/**
 * useLatestRef — Hook utilitario para "latest value" pattern.
 *
 * Mantiene una ref sincronizada con el valor mas reciente de un prop/state.
 * Util en closures asincronas (handlers, timeouts, fetch callbacks) donde
 * capturar el state directamente en useCallback produce closures obsoletas.
 *
 * Patron tipico (sin este hook):
 * ```ts
 * const valueRef = useRef(value);
 * useEffect(() => { valueRef.current = value; }, [value]);
 * // luego en algun closure: valueRef.current
 * ```
 *
 * Patron equivalente con useLatestRef:
 * ```ts
 * const valueRef = useLatestRef(value);
 * // en algun closure: valueRef.current
 * ```
 *
 * Spec: sdd/improve-project 3.1 — usado en capture/page.tsx para eliminar
 * 6 pares useRef+useEffect y consolidar async closures.
 */
'use client';

import { useEffect, useRef } from 'react';

/** Mantiene `ref.current` sincronizado con el valor mas reciente de `value`. */
export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
