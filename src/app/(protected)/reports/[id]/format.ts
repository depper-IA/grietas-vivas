/**
 * Helpers de formato para la vista de detalle de reporte.
 */

/**
 * Formatea un timestamp ISO 8601 a string legible en espanol colombiano.
 * Si el input es invalido, devuelve el string crudo (degradacion graceful).
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}
