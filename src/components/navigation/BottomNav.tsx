'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, FileText, Settings2 } from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/capture',
    label: 'Capturar',
    Icon: Camera,
  },
  {
    href: '/reports',
    label: 'Reportes',
    Icon: FileText,
  },
  {
    href: '/settings',
    label: 'Configuración',
    Icon: Settings2,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-default bg-surface-1/90 backdrop-blur-md shadow-lg pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              aria-label={`Ir a ${label}`}
              className={`flex flex-col items-center justify-center min-h-[48px] min-w-[64px] gap-1 px-3 py-1.5 rounded-xl transition-all duration-150 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                isActive
                  ? 'text-brand-accent font-semibold bg-surface-2 shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-2/50'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-brand-accent' : 'text-text-muted'}`} aria-hidden="true" />
              <span className="text-[11px] font-medium leading-none">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
