FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services/notificaciones ./services/notificaciones

RUN cd shared && npm install && npm run build
RUN cd services/notificaciones && npm install && npm run build

WORKDIR /app/services/notificaciones
CMD ["node", "dist/index.js"]
