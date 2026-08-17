/**
 * Tests para orientation.ts — captura de DeviceOrientation API.
 *
 * Contrato:
 *   - Si el API no existe (SSR/no soportado), devuelve `{ ..., available: false }`.
 *   - Si el evento dispara con TODOS los ejes null (caso tipico: iOS sin
 *     permiso explicito, Android que no emite hasta primer toque),
 *     `available` debe ser `false`. Antes del fix esto devolvia
 *     `available: true` y la UI imprimia "undefined°".
 *   - Si al menos un eje trae un numero valido, `available: true`
 *     conservando los nulls individuales.
 *   - Si la ventana de sampling de 500ms expira sin recibir evento,
 *     `available: false`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDeviceOrientation } from './orientation';

describe('getDeviceOrientation', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    vi.useRealTimers();
  });

  describe('API no disponible', () => {
    it('devuelve available=false cuando window.DeviceOrientationEvent no existe', async () => {
      // Simula que el navegador no soporta DeviceOrientationEvent
      const original = (window as unknown as { DeviceOrientationEvent?: unknown })
        .DeviceOrientationEvent;
      // @ts-expect-error borramos la propiedad para forzar el fallback
      delete (window as unknown as { DeviceOrientationEvent?: unknown })
        .DeviceOrientationEvent;

      try {
        const result = await getDeviceOrientation();
        expect(result.available).toBe(false);
        expect(result.alpha).toBeNull();
        expect(result.beta).toBeNull();
        expect(result.gamma).toBeNull();
      } finally {
        (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent =
          original;
      }
    });
  });

  describe('evento recibido con datos parciales (Bug 1 fix)', () => {
    it('evento con alpha/beta/gamma todos null → available=false (NO imprime undefined)', async () => {
      const promise = getDeviceOrientation();

      // Capturamos el listener que el modulo registra
      const handler = addEventListenerSpy.mock.calls.find(
        ([eventName]: [string]) => eventName === 'deviceorientation'
      )?.[1] as (event: DeviceOrientationEvent) => void;

      expect(handler).toBeDefined();

      // Dispara un evento con todos los ejes null (caso iOS sin permiso)
      handler({ alpha: null, beta: null, gamma: null } as DeviceOrientationEvent);

      const result = await promise;
      expect(result.alpha).toBeNull();
      expect(result.beta).toBeNull();
      expect(result.gamma).toBeNull();
      // Clave del fix: ya no debe estar disponible cuando no hay datos
      expect(result.available).toBe(false);
    });

    it('evento con alpha valido pero beta/gamma null → available=true con nulls individuales', async () => {
      const promise = getDeviceOrientation();

      const handler = addEventListenerSpy.mock.calls.find(
        ([eventName]: [string]) => eventName === 'deviceorientation'
      )?.[1] as (event: DeviceOrientationEvent) => void;

      handler({
        alpha: 180,
        beta: null,
        gamma: null,
      } as DeviceOrientationEvent);

      const result = await promise;
      expect(result.alpha).toBe(180);
      expect(result.beta).toBeNull();
      expect(result.gamma).toBeNull();
      expect(result.available).toBe(true);
    });

    it('evento con todos los ejes validos → available=true y todos los valores presentes', async () => {
      const promise = getDeviceOrientation();

      const handler = addEventListenerSpy.mock.calls.find(
        ([eventName]: [string]) => eventName === 'deviceorientation'
      )?.[1] as (event: DeviceOrientationEvent) => void;

      handler({
        alpha: 90,
        beta: 45,
        gamma: -10,
      } as DeviceOrientationEvent);

      const result = await promise;
      expect(result.alpha).toBe(90);
      expect(result.beta).toBe(45);
      expect(result.gamma).toBe(-10);
      expect(result.available).toBe(true);
    });
  });

  describe('timeout de la ventana de sampling', () => {
    it('si ningun evento dispara en 500ms → available=false', async () => {
      vi.useFakeTimers();
      const promise = getDeviceOrientation();

      // Avanzamos el reloj mas alla de la ventana de 500ms
      await vi.advanceTimersByTimeAsync(600);

      const result = await promise;
      expect(result.alpha).toBeNull();
      expect(result.beta).toBeNull();
      expect(result.gamma).toBeNull();
      expect(result.available).toBe(false);
    });

    it('evento recibido antes del timeout gana y cancela el timer', async () => {
      vi.useFakeTimers();
      const promise = getDeviceOrientation();

      const handler = addEventListenerSpy.mock.calls.find(
        ([eventName]: [string]) => eventName === 'deviceorientation'
      )?.[1] as (event: DeviceOrientationEvent) => void;

      // Dispara con un valor valido antes del timeout
      handler({
        alpha: 45,
        beta: 30,
        gamma: -5,
      } as DeviceOrientationEvent);

      const result = await promise;
      expect(result.available).toBe(true);
      expect(result.alpha).toBe(45);
      expect(result.beta).toBe(30);
      expect(result.gamma).toBe(-5);

      // Verificar que el listener fue removido (cleanup)
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'deviceorientation',
        handler
      );
    });
  });

  describe('limpia el listener despues de procesar', () => {
    it('llama a removeEventListener tras recibir el primer evento', async () => {
      const promise = getDeviceOrientation();

      const handler = addEventListenerSpy.mock.calls.find(
        ([eventName]: [string]) => eventName === 'deviceorientation'
      )?.[1] as (event: DeviceOrientationEvent) => void;

      handler({
        alpha: 0,
        beta: 0,
        gamma: 0,
      } as DeviceOrientationEvent);

      await promise;

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'deviceorientation',
        handler
      );
    });

    it('llama a removeEventListener tras el timeout', async () => {
      vi.useFakeTimers();
      const promise = getDeviceOrientation();

      await vi.advanceTimersByTimeAsync(600);

      await promise;

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'deviceorientation',
        expect.any(Function)
      );
    });
  });
});