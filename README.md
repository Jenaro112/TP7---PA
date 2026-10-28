# RutaSur: Plataforma de Logística Orientada a Eventos (EDA)
**Licenciatura en Sistemas de Información — Programación Avanzada 2026**

RutaSur es una plataforma integral de seguimiento de envíos de última milla en tiempo real, diseñada bajo una **arquitectura dirigida por eventos (EDA)** utilizando **Apache Kafka** como log inmutable de eventos, servicios desacoplados en **Node.js (TypeScript)**, **MongoDB** como modelo de lectura (CQRS) con soporte de Change Streams, y un frontend reactivo en **Next.js** con Server-Sent Events (SSE).

---

## 🏗️ Arquitectura del Sistema

El principio fundamental del sistema es que **Apache Kafka es el único punto de contacto entre los servicios**: ningún servicio invoca a otro mediante llamadas directas (HTTP o RPC). La comunicación es 100% coreográfica a través de eventos con clave de partición por `shipmentId`, garantizando orden estricto por paquete.

```
+----------------------------------------------------------------------------------------------------+
|                                           Apache Kafka                                             |
|  Topics:                                                                                           |
|  - envios.estados (3 part., 30 días)            - alertas.sla (3 part., 7 días)                   |
|  - envios.promesas (3 part., compactado)        - notificaciones.enviadas (3 part., 7 días)        |
|  - envios.reprogramaciones (3 part., 30 días)   - envios.estados.dlq (3 part., 30 días)           |
+----------------------------------------------------------------------------------------------------+
       ▲                                 ▲          ▲          ▲             ▲
       │ Produce                         │ Produce  │ Produce  │ Produce     │ Consume & Proyecta
+--------------+                   +-------------+  │    +-------------+  +--------------+
|  Simulador   |                   | Monitor SLA |  │    | Reprogram.  |  |  Proyector   |
| (Escenarios) |                   +-------------+  │    +-------------+  +-------+------+
+--------------+                                    │                             │
                                           +-----------------+                    │ Escribe
                                           | Notificaciones  |                    ▼
                                           +-----------------+              +------------+
                                                                            |  MongoDB   |
                                                                            | (rs0 / CS) |
                                                                            +-----+------+
                                                                                  │ SSE Stream
                                                                                  ▼
                                                                            +------------+
                                                                            |  Next.js   |
                                                                            |  Frontend  |
                                                                            +------------+
```

---

## 📦 Componentes y Responsabilidades

| Componente | Tipo | Responsabilidad | Grupo de Consumidores |
| :--- | :--- | :--- | :--- |
| **Simulador** | Productor / API | Genera eventos de ciclo de vida, promesas de entrega y escenarios de prueba (flujo continuo o bajo demanda). | *No consume* |
| **Proyector** | Consumidor | Consume los 4 topics de negocio y proyecta vistas en MongoDB (`envios`, `alertas`, `notificaciones`). Aplica idempotencia, regla de secuencia y envía inválidos a la DLQ. | `proyector` |
| **Notificaciones** | Consumidor / Productor | Reacciona a `ENTREGA_FALLIDA` y `alertas.sla` emitiendo notificaciones simuladas al cliente con opciones de reprogramación hacia `notificaciones.enviadas`. | `notificaciones` |
| **Reprogramación** | Consumidor / Productor | Reacciona a `ENTREGA_FALLIDA` evaluando reglas de negocio (`AUSENTE`, `DIRECCION_INCORRECTA`, `RECHAZADO`, 3º intento) y emitiendo acciones hacia `envios.reprogramaciones`. | `reprogramacion` |
| **Monitor de SLA** | Consumidor / Productor | Cruza estados con promesas de entrega en base al reloj simulado. Evalúa las 4 reglas de SLA periódicamente y emite alertas y cierres hacia `alertas.sla`. | `monitor-sla` |
| **Analítica** | Consumidor / API | Consume `envios.estados` y mantiene contadores incrementales atómicos (`$inc`) en `metricas_diarias`. Ejecuta reprocesamiento histórico (Indicador 4). | `analitica` |
| **Frontend** | Next.js 14 Web App | Interfaz reactiva para supervisor, destinatario y gerencia. Escucha MongoDB Change Streams vía Server-Sent Events (SSE). | *No consume Kafka* |

---

## 🎯 Casos de Uso Implementados

### CU1: Ciclo de vida del envío con tracking en vivo
- **Estados soportados:** `CREADO` ➔ `INGRESADO_HUB` ➔ `CLASIFICADO` ➔ `EN_REPARTO` ➔ `ENTREGADO` o `ENTREGA_FALLIDA`.
- **Regla de orden / secuencia:** Si un evento recibido tiene `secuencia <= doc.ultimaSecuencia`, el proyector descarta el retroceso de estado manteniendo la consistencia.
- **Regla de idempotencia:** Verificación contra la colección `eventos_procesados` con índice único `{ consumidor: 1, eventId: 1 }`. Si un `eventId` ya fue procesado, se omite.
- **Dead Letter Queue (DLQ):** Eventos con JSON malformado o violación de esquema se derivan a `envios.estados.dlq` con la causa, permitiendo que el consumidor continúe sin interrupciones.

### CU2: Entrega fallida con tres reacciones independientes
Un único evento `ENTREGA_FALLIDA` desencadena en paralelo 3 reacciones desacopladas:
1. **Notificaciones:** Emite aviso (WhatsApp/SMS) al destinatario con opciones de reprogramación (`MANANA`, `TARDE`).
2. **Reprogramación:** Aplica la lógica de negocio:
   - `AUSENTE`: Nuevo intento al siguiente día hábil en la franja horaria opuesta (mañana ➔ tarde, tarde ➔ mañana).
   - `DIRECCION_INCORRECTA`: Queda en estado `RETENIDO` hasta que el destinatario corrija los datos (no se reprograma solo).
   - `RECHAZADO`: Marcado para devolución al comercio (`DEVUELTO_AL_COMERCIO`).
   - `Tercer intento fallido`: Cualquiera sea el motivo, el envío se cancela y pasa a devolución al comercio.
3. **Analítica:** Suma el fallo a los agregados diarios por zona, franja y motivo de fallo.
- *Aislamiento:* Si se detiene cualquiera de los servicios (por ejemplo, notificaciones), los demás siguen operando con total normalidad.

### CU3: Alerta temprana de riesgo de SLA
- El monitor de SLA cruza el estado de cada envío con la promesa (`venceEn`).
- Utiliza el **reloj simulado acelerado** (120x: 1 hora simulada = 30 segundos reales) obtenido de los eventos.
- Evalúa periódicamente (en memoria con respaldo en MongoDB `monitor_sla_estado` para tolerancia a reinicios):
  1. `Sin ingreso` (Prioridad MEDIA): Faltan menos de 10 horas y no ingresó a hub.
  2. `Sin salida` (Prioridad ALTA): Faltan menos de 4 horas y no está en reparto.
  3. `Fallo en el día límite` (Prioridad ALTA): `ENTREGA_FALLIDA` y la promesa vence hoy.
  4. `Vencido` (Prioridad CRITICA): Venció la promesa sin haberse entregado.
- **Sin repetición:** Una regla no vuelve a alertar dos veces sobre el mismo envío.
- **Cierre automático:** Al llegar el evento `ENTREGADO`, el monitor emite el cierre de las alertas abiertas.

### CU4: Analítica de mejora con reprocesamiento de eventos (Event Replay)
- **Indicadores precalculados incrementalmente:**
  1. *Tasa de entrega en primer intento:* Por zona, franja horaria y día.
  2. *Distribución de motivos de fallo:* Desglose por motivo (Ausente 60%, Dirección 20%, Rechazo 15%, Zona 5%).
  3. *Cumplimiento de SLA:* Entregas a tiempo vs demoradas por Hub y día.
- **Indicador 4 (Demostración de Reprocesamiento Histórico):**
  - "Tiempo medio entre `INGRESADO_HUB` y `EN_REPARTO` por Hub".
  - Se calcula creando un **nuevo grupo de consumidores** (`analitica-reproceso-<timestamp>`) con `fromBeginning: true` que lee todo el topic `envios.estados` desde el inicio y calcula el histórico sin reiniciar ni afectar a ninguno de los otros servicios en ejecución.

---

## 🖥️ Pantallas del Frontend en Next.js

1. **Torre de Control (`/`):**
   - Contadores en tiempo real por estado (Total, Creados, En Hub, Clasificados, En Reparto, Entregados, Fallidos, Retenidos).
   - Cola de alertas de SLA priorizada (Crítica > Alta > Media) con filtros dinámicos.
   - Feed en vivo de últimos eventos y envíos con latencia < 2s vía Server-Sent Events (SSE).
2. **Explorador de Envíos (`/envios`):**
   - Búsqueda por ID de envío y filtros por estado y zona.
3. **Detalle del Envío (`/envios/[id]`):**
   - Vista integral para el supervisor: línea de tiempo cronológica con secuencia y timestamp, gestión de reprogramaciones, alertas de SLA asociadas y notificaciones emitidas.
4. **Tracking Público (`/tracking` y `/tracking/[id]`):**
   - Vista orientada al destinatario: lenguaje amigable sin tecnicismos ni códigos internos de operarios, barra de progreso y fecha estimada.
5. **Analítica (`/analitica`):**
   - Dashboard gerencial con los 4 indicadores y botón para disparar el reprocesamiento histórico.
6. **Panel de Demo (`/demo`):**
   - Controles interactivos para disparar los escenarios del guion durante la defensa:
     - 🚀 *Envío Feliz*
     - 🏠 *Ausente (con reprogramación en franja opuesta)*
     - ⏰ *Demorado en Hub (alerta de SLA)*
     - 🛑 *Tercer Fallo (pase a devolución)*
     - ⚠️ *Inyección de Evento Malformado (verificación de DLQ)*
     - ⚡ *Ráfaga de 500 envíos*
     - 🔄 *Switch de Flujo Continuo*
     - 🐛 *Visor en vivo de la DLQ*

---

## 🚀 Arranque del Entorno con un Solo Comando

### Requisitos Previos:
- Docker y Docker Compose instalados.
- Node.js 20+ (opcional para desarrollo local o suite de tests en host).

### Levantar todo el sistema:
```bash
docker compose up -d --build
```

Esto inicia automáticamente los siguientes servicios:
- `rutasur-kafka`: Broker Apache Kafka 3.8 en modo KRaft (puertos 9092 y 29092).
- `rutasur-mongodb`: MongoDB 7.0 configurado como Replica Set (`rs0`) para habilitar Change Streams (puerto 27017).
- `rutasur-mongo-init`: Inicializador automático e idempotente del Replica Set.
- `rutasur-simulador`: Servicio generador de eventos y API de escenarios (puerto 3001).
- `rutasur-proyector`: Consumidor proyector CQRS en MongoDB.
- `rutasur-notificaciones`: Consumidor de avisos y notificaciones.
- `rutasur-reprogramacion`: Consumidor de reglas de reprogramación.
- `rutasur-monitor-sla`: Consumidor y monitor de reloj acelerado de SLA.
- `rutasur-analitica`: Consumidor y API de métricas / reprocesamiento (puerto 3002).
- `rutasur-frontend`: Aplicación web Next.js 14 (puerto 3000).

### Acceso Web:
- **Torre de Control:** [http://localhost:3000](http://localhost:3000)
- **Panel de Demo:** [http://localhost:3000/demo](http://localhost:3000/demo)
- **Tracking Público:** [http://localhost:3000/tracking](http://localhost:3000/tracking)
- **Analítica:** [http://localhost:3000/analitica](http://localhost:3000/analitica)

---

## ✅ Ejecución de la Suite de Pruebas de Aceptación

Para ejecutar la verificación completa de todos los criterios de aceptación:

```bash
KAFKA_BROKERS=localhost:29092 npm run test:acceptance
```

El script evalúa y valida automáticamente:
1. Ciclo de vida: proyección de estados, latencia < 2s, idempotencia ante duplicados, descarte de eventos fuera de orden y desvío a DLQ ante esquema inválido.
2. Entrega fallida: emisión de notificaciones, reprogramación por motivo (`AUSENTE`, `DIRECCION_INCORRECTA`, `RECHAZADO`), tercer fallo a devolución y aislamiento.
3. Riesgo de SLA: disparo de alertas con prioridades, sin repetición y cierre al entregar.
4. Analítica y reprocesamiento: cálculo incremental en `metricas_diarias` y reprocesamiento histórico desde offset 0.

---

## 📋 Justificación de Decisiones de Diseño (Defensa del Trabajo)

| Decisión | Elección Adoptada | Justificación Técnica | Alternativa Descartada y Motivo |
| :--- | :--- | :--- | :--- |
| **Garantía de entrega** | Al menos una vez (*At-least-once*) con consumidores idempotentes | Es un modelo simple, confiable y que garantiza no perder eventos. La idempotencia en el consumidor (vía `eventId` y verificación de `secuencia`) absorbe reintentos sin efectos secundarios. | *Exactly-once con transacciones Kafka:* Agrega sobrecarga de coordinación y complejidad innecesaria para el alcance del problema. |
| **Confirmación de offsets** | Manual, posterior a la persistencia en MongoDB | Garantiza que si el proceso falla antes de escribir la proyección en la base de datos, el evento se reintentará en el reinicio. | *Confirmación automática:* Riesgo crítico de perder eventos si el servicio se cae tras consumir pero antes de persistir. |
| **Particiones de `envios.estados`** | 3 particiones (con clave `shipmentId`) | Permite demostrar reparto de carga entre múltiples consumidores y rebalanceo, garantizando a la vez que todos los eventos del mismo envío caigan en la misma partición y mantengan orden estricto. | *1 partición:* No permite demostrar paralelismo ni escalabilidad horizontal. |
| **Formato de eventos** | JSON estructurado con validación Zod en cada consumidor | Legible, fácil de depurar e inspeccionar sin requerir componentes externos. | *Avro con Schema Registry:* Agrega dependencias de infraestructura excesivas para la maqueta local. |
| **Monitor de SLA** | Consumidor con estado en memoria y respaldo en MongoDB | La lógica temporal y las 4 reglas quedan a la vista, son fáciles de auditar y toleran reinicios rehidratando el estado. | *Kafka Streams / ksqlDB:* Quedan como posibles extensiones; un servicio explícito en Node.js clarifica la pedagogía del algoritmo. |
| **Kafka en local** | Broker único en modo KRaft | Elimina la dependencia de ZooKeeper, acelera el arranque a pocos segundos y reduce el consumo de memoria en Docker. | *Clúster multi-broker:* Solo se justificaría para demostrar tolerancia a caídas de brokers físicos. |
| **Tiempo real en la interfaz** | MongoDB Change Streams + Server-Sent Events (SSE) | Desacopla la interfaz web del broker de Kafka (CQRS estricto). SSE es unidireccional, ligero y no requiere brokers de WebSocket adicionales. | *Consumir Kafka directamente desde Next.js:* Acoplaría el cliente web al broker y violaría el principio de lectura de vistas proyectadas. |
