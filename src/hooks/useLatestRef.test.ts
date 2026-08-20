/**
 * Tests para useLatestRef.
 *
 * Contrato:
 *   - El ref apunta al valor mas reciente despues de cualquier re-render.
 *   - Misma identidad de ref entre renders (es estable).
 *   - Funciona con tipos primitivos y objetos.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLatestRef } from './useLatestRef';

describe('useLatestRef', () => {
  it('apunta al valor inicial en el primer render', () => {
    const { result } = renderHook(() => useLatestRef('hello'));
    expect(result.current.current).toBe('hello');
  });

  it('se actualiza cuando el valor cambia', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'a' },
    });

    expect(result.current.current).toBe('a');

    rerender({ value: 'b' });
    expect(result.current.current).toBe('b');

    rerender({ value: 'c' });
    expect(result.current.current).toBe('c');
  });

  it('mantiene la misma identidad de ref entre renders', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 1 },
    });

    const firstRef = result.current;
    rerender({ value: 2 });
    expect(result.current).toBe(firstRef);
  });

  it('funciona con objetos (mismas referencias vs contenidos)', () => {
    const obj1 = { x: 1 };
    const obj2 = { x: 2 };
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: obj1 },
    });

    expect(result.current.current).toBe(obj1);

    rerender({ value: obj2 });
    expect(result.current.current).toBe(obj2);
    expect(result.current.current).not.toBe(obj1);
  });

  it('funciona con null y undefined', () => {
    const { result, rerender } = renderHook<{ v: string | null | undefined }, { v: string | null | undefined }>(
      ({ v }) => useLatestRef(v),
      { initialProps: { v: null as string | null } },
    );

    expect(result.current.current).toBeNull();

    rerender({ v: undefined });
    expect(result.current.current).toBeUndefined();

    rerender({ v: 'value' });
    expect(result.current.current).toBe('value');
  });

  it('captura la ultima lectura despues de un setTimeout asincrono (caso de uso real)', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'first' },
    });

    // Captura el ref en un closure ANTES del re-render
    const capturedRef = result.current;

    // Re-render con valor nuevo
    rerender({ value: 'second' });
    rerender({ value: 'third' });

    // El closure ve el ultimo valor aunque fue capturado antes
    expect(capturedRef.current).toBe('third');
    vi.useRealTimers();
  });
});
