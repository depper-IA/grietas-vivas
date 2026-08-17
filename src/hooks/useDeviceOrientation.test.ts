/**
 * Tests para useDeviceOrientation — hook de orientacion del dispositivo.
 *
 * Contrato:
 *   - Devuelve pitch (beta) y roll (gamma) en grados.
 *   - Throttling: cambios < 0.25 grados no disparan re-render.
 *   - supported=false si DeviceOrientationEvent no existe.
 *   - En navegadores sin soporte, devuelve 0/0/0 sin crash.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeviceOrientation } from './useDeviceOrientation';

describe('useDeviceOrientation', () => {
  let originalDeviceOrientationEvent: typeof window.DeviceOrientationEvent;
  let orientationListeners: Array<(event: DeviceOrientationEvent) => void>;

  beforeEach(() => {
    originalDeviceOrientationEvent = window.DeviceOrientationEvent;
    orientationListeners = [];

    // Mock window.addEventListener para capturar listeners de deviceorientation
    const originalAdd = window.addEventListener.bind(window);
    window.addEventListener = vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'deviceorientation') {
          orientationListeners.push(listener as (event: DeviceOrientationEvent) => void);
        }
        originalAdd(type, listener);
      }
    );
  });

  afterEach(() => {
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      value: originalDeviceOrientationEvent,
      writable: true,
      configurable: true,
    });
    cleanup();
  });

  // Helper local
  function cleanup() {
    vi.restoreAllMocks();
  }

  function emitOrientation(alpha: number | null, beta: number | null, gamma: number | null) {
    const event = {
      alpha,
      beta,
      gamma,
    } as DeviceOrientationEvent;
    orientationListeners.forEach((listener) => listener(event));
  }

  describe('estado inicial', () => {
    it('devuelve pitch=0 y roll=0 por defecto', () => {
      const { result } = renderHook(() => useDeviceOrientation());
      expect(result.current.pitch).toBe(0);
      expect(result.current.roll).toBe(0);
    });

    it('marca supported=true si DeviceOrientationEvent existe', () => {
      Object.defineProperty(window, 'DeviceOrientationEvent', {
        value: class {},
        writable: true,
        configurable: true,
      });
      const { result } = renderHook(() => useDeviceOrientation());
      expect(result.current.supported).toBe(true);
    });

    it('marca supported=false si DeviceOrientationEvent no existe', () => {
      Object.defineProperty(window, 'DeviceOrientationEvent', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const { result } = renderHook(() => useDeviceOrientation());
      expect(result.current.supported).toBe(false);
    });
  });

  describe('recepcion de eventos', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'DeviceOrientationEvent', {
        value: class {},
        writable: true,
        configurable: true,
      });
    });

    it('actualiza pitch y roll cuando se recibe un evento con cambio >= umbral', () => {
      const { result } = renderHook(() => useDeviceOrientation());

      act(() => {
        emitOrientation(0, 10, 5);
      });

      expect(result.current.pitch).toBe(10);
      expect(result.current.roll).toBe(5);
    });

    it('NO actualiza cuando el cambio es menor al umbral (throttling)', () => {
      const { result } = renderHook(() => useDeviceOrientation());

      // Primer evento: establece baseline
      act(() => {
        emitOrientation(0, 10, 5);
      });
      expect(result.current.pitch).toBe(10);

      // Segundo evento: cambio < 0.25 grados
      act(() => {
        emitOrientation(0, 10.1, 5.1);
      });

      // Debe seguir igual (sin re-render)
      expect(result.current.pitch).toBe(10);
      expect(result.current.roll).toBe(5);
    });

    it('ignora eventos con todos los angulos null', () => {
      const { result } = renderHook(() => useDeviceOrientation());

      act(() => {
        emitOrientation(null, null, null);
      });

      expect(result.current.pitch).toBe(0);
      expect(result.current.roll).toBe(0);
    });

    it('preserva el ultimo valor conocido cuando un angulo es null', () => {
      const { result } = renderHook(() => useDeviceOrientation());

      act(() => {
        emitOrientation(0, 10, 5);
      });
      expect(result.current.pitch).toBe(10);
      expect(result.current.roll).toBe(5);

      // Evento con beta null pero gamma valido
      act(() => {
        emitOrientation(0, null, 20);
      });

      expect(result.current.pitch).toBe(10); // preservado
      expect(result.current.roll).toBe(20);
    });
  });
});