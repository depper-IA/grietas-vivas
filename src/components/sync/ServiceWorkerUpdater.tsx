'use client';

import { useEffect } from 'react';

/**
 * ServiceWorkerUpdater — Gestión de actualización de Service Worker y caché PWA.
 *
 * 1. En entorno de desarrollo (localhost): desregistra service workers activos
 *    y limpia caches huérfanas para evitar servir código viejo o chunks rotos.
 * 2. En producción: verifica actualizaciones inmediatamente al cargar y
 *    fuerza la activación de la versión más reciente sin atrapar al usuario en caché vieja.
 */
export function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      // En localhost desregistrar SWs para desarrollo transparente
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if ('caches' in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
    } else {
      // En producción, forzar verificación de actualización
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.update().catch(() => {});
        }
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Nueva versión instalada y controlando la página
        window.location.reload();
      });
    }
  }, []);

  return null;
}
