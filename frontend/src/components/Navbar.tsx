'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Truck, Activity, Package, BarChart3, PlayCircle, Radio } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const [sseConnected, setSseConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events/sse');
      eventSource.onopen = () => setSseConnected(true);
      eventSource.onerror = () => setSseConnected(false);
      eventSource.addEventListener('heartbeat', () => setSseConnected(true));
    } catch {
      setSseConnected(false);
    }
    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const navItems = [
    { href: '/', label: 'Torre de Control', icon: Activity },
    { href: '/envios', label: 'Envíos', icon: Package },
    { href: '/tracking', label: 'Tracking Público', icon: Truck },
    { href: '/analitica', label: 'Analítica', icon: BarChart3 },
    { href: '/demo', label: 'Panel Demo', icon: PlayCircle },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2">
              <div className="p-2 bg-blue-600 rounded-lg shadow-md">
                <Truck className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
                RutaSur
              </span>
            </Link>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              EDA Logística
            </span>
          </div>

          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 text-xs">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-300">
                {sseConnected ? 'SSE Conectado (En Vivo)' : 'Conectando SSE...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
