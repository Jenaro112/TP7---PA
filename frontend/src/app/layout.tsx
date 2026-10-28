import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'RutaSur - Logística Orientada a Eventos',
  description: 'Plataforma de seguimiento en tiempo real construida con Apache Kafka, Node.js y MongoDB',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="bg-slate-900/60 border-t border-slate-800/80 py-4 text-center text-xs text-slate-400">
          RutaSur &copy; 2026 - Licenciatura en Sistemas de Información - Programación Avanzada
        </footer>
      </body>
    </html>
  );
}
