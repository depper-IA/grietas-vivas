/**
 * DeviceOrientationTracker — Hook para suscribirse a DeviceOrientationEvent.
 *
 * Devuelve los angulos de orientacion del dispositivo en grados:
 *   - alpha: rotacion alrededor del eje Z (0-360)
 *   - beta:  rotacion alrededor del eje X (-180 a 180) -> "pitch"
 *   - gamma: rotacion alrededor del eje Y (-90 a 90) -> "roll"
 *
 * Filtra solo valores validos (no null) y aplica un debounce ligero para
 * evitar re-renders innecesarios cuando el dispositivo esta estable.
 *
 * Compatible con web (Chrome/Safari/Firefox) via window.deviceorientation.
 * En navegadores sin soporte, devuelve los defaults (0/0/0) y expone
 * `supported=false` para que el caller pueda ocultar la UI.
 *
 * Ref: design `useDeviceOrientation` (slice 4, work unit 4).
 */

import { useEffect, useState } from 'react';

export interface DeviceOrientation {
  /** Rotacion Z (0-360). */
  alpha: number;
  /** Rotacion X / pitch (-180 a 180). */
  beta: number;
  /** Rotacion Y / roll (-90 a 90). */
  gamma: number;
}

export interface UseDeviceOrientationReturn {
  /** Angulo pitch (beta) en grados. */
  pitch: number;
  /** Angulo roll (gamma) en grados. */
  roll: number;
  /** Si el navegador soporta DeviceOrientationEvent. */
  supported: boolean;
}

/** Umbral minimo de cambio para emitir actualizacion (evita re-renders). */
const CHANGE_THRESHOLD_DEGREES = 0.25;

/**
 * useDeviceOrientation — suscribe a deviceorientation y devuelve pitch/roll.
 *
 * Si el navegador no soporta el evento o el usuario no ha dado permiso
 * (iOS 13+ requiere permiso explicito), devuelve 0/0 y `supported=false`.
 */
export function useDeviceOrientation(): UseDeviceOrientationReturn {
  const isBrowser = typeof window !== 'undefined';
  const supported =
    isBrowser && typeof window.DeviceOrientationEvent !== 'undefined';

  const [orientation, setOrientation] = useState<DeviceOrientation>({
    alpha: 0,
    beta: 0,
    gamma: 0,
  });

  useEffect(() => {
    if (!supported) return;

    let last: DeviceOrientation = { alpha: 0, beta: 0, gamma: 0 };

    function handle(event: DeviceOrientationEvent) {
      // Filtra eventos donde todos los angulos son null (sensores no disponibles)
      if (
        event.alpha === null &&
        event.beta === null &&
        event.gamma === null
      ) {
        return;
      }

      const next: DeviceOrientation = {
        alpha: event.alpha ?? last.alpha,
        beta: event.beta ?? last.beta,
        gamma: event.gamma ?? last.gamma,
      };

      // Throttling: solo emite si cambio >= threshold
      const delta =
        Math.abs(next.beta - last.beta) +
        Math.abs(next.gamma - last.gamma);
      if (delta < CHANGE_THRESHOLD_DEGREES) return;

      last = next;
      setOrientation(next);
    }

    // iOS 13+ requiere solicitud explicita de permiso
    const requestPermission = (
      window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      }
    ).requestPermission;

    if (typeof requestPermission === 'function') {
      // No solicitamos permiso automaticamente; el caller debe hacerlo si quiere
      window.addEventListener('deviceorientation', handle);
    } else {
      window.addEventListener('deviceorientation', handle);
    }

    return () => {
      window.removeEventListener('deviceorientation', handle);
    };
  }, [supported]);

  return {
    pitch: orientation.beta,
    roll: orientation.gamma,
    supported,
  };
}