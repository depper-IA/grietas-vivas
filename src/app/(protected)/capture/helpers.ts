/**
 * Helpers para capture page — funciones puras y constantes reutilizables.
 *
 * Extraido de page.tsx para mantener ese archivo bajo el limite de 600 lineas
 * (REGLAS_IMPORTANTES.md §5) y facilitar el testeo unitario.
 *
 * Ref: design `capture/page.tsx` migration (slice 4, work unit 4).
 */

/**
 * Convierte un ArrayBuffer a string base64 (sin dependencias externas).
 * Compatible con navegador: usa btoa + String.fromCharCode.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Mensajes espanol para los badges de riesgo en el flujo post-captura. */
export const RISK_BADGE_MESSAGES: Record<string, string> = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
};