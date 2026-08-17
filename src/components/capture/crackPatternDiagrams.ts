/**
 * crackPatternDiagrams — Diagramas SVG inline para CrackPatternSelector.
 *
 * Cada entrada expone un objeto `paths` con hasta 14 elementos `<path>`,
 * `<line>` o `<rect>` que describen geometricamente el patron de grieta.
 * Los colores se aplican via `currentColor` para integrarse con el sistema
 * de tokens semanticos (text-primary, text-secondary) y modo oscuro.
 *
 * Mantener este archivo libre de emojis y de dependencias de React. El
 * consumidor (CrackPatternSelector) renderiza el SVG y aplica tokens
 * via clases Tailwind sobre el contenedor.
 *
 * Ref: spec seismic-triage-upgrade R2 (metadata + diagramIconId).
 */

import type { CrackPattern } from '@/lib/validation/crackTaxonomy';

/**
 * Vista SVG (24x24) en geometria escalada, estilo outline consistente.
 * Los paths usan coordenadas dentro del viewBox 0 0 24 24.
 */
export interface CrackDiagramPaths {
  /** Lineas / polilineas / paths geometricos (8-14 elementos). */
  readonly paths: ReadonlyArray<{
    d: string;
    strokeWidth?: number;
    fill?: 'none' | string;
  }>;
}

/** Vista SVG compartida por todos los diagramas. */
export const CRACK_DIAGRAM_VIEWBOX = '0 0 24 24';

/**
 * 10 diagramas geometricos, uno por patron. Cada uno representa la
 * forma caracteristica de la grieta segun FEMA 306 / NSR-10.
 */
export const CRACK_DIAGRAMS: Readonly<
  Record<CrackPattern, CrackDiagramPaths>
> = {
  hairline_cosmetic: {
    paths: [
      // Fisura fina vertical + pequenas horquillas de retraccion
      { d: 'M11 4 L11 20', strokeWidth: 0.4 },
      { d: 'M13 6 L13 18', strokeWidth: 0.4 },
      { d: 'M10 8 L14 8', strokeWidth: 0.3 },
      { d: 'M10 14 L14 14', strokeWidth: 0.3 },
      { d: 'M9.5 11 L14.5 11', strokeWidth: 0.3 },
    ],
  },
  vertical_shrinkage: {
    paths: [
      // Linea vertical principal + leve zig-zag por asentamiento
      { d: 'M12 3 L12 21', strokeWidth: 0.7 },
      { d: 'M12 7 L11.5 9 L12.5 11 L12 13 L11.5 15 L12.5 17', strokeWidth: 0.5 },
      // Pequeñas ramas
      { d: 'M12 9 L9 11', strokeWidth: 0.3 },
      { d: 'M12 13 L15 15', strokeWidth: 0.3 },
      // Marca de suelo
      { d: 'M3 22 L21 22', strokeWidth: 0.4 },
    ],
  },
  horizontal_flexural: {
    paths: [
      // Viga horizontal + grieta horizontal con leve curvatura
      { d: 'M2 12 L22 12', strokeWidth: 1.2 },
      // Grieta con pandeo leve
      { d: 'M6 12 Q12 8 18 12', strokeWidth: 0.7 },
      // Apoyos
      { d: 'M2 14 L2 18', strokeWidth: 0.5 },
      { d: 'M22 14 L22 18', strokeWidth: 0.5 },
      { d: 'M2 18 L4 18', strokeWidth: 0.5 },
      { d: 'M22 18 L20 18', strokeWidth: 0.5 },
    ],
  },
  diagonal_shear: {
    paths: [
      // Muro + grieta diagonal 45 grados
      { d: 'M3 3 L3 21', strokeWidth: 0.5 },
      { d: 'M21 3 L21 21', strokeWidth: 0.5 },
      // Grieta diagonal principal
      { d: 'M5 19 L19 5', strokeWidth: 1.2 },
      // Grieta secundaria (X incipiente)
      { d: 'M8 17 L15 9', strokeWidth: 0.5 },
      { d: 'M11 19 L17 13', strokeWidth: 0.5 },
      // Base
      { d: 'M2 22 L22 22', strokeWidth: 0.4 },
    ],
  },
  stepped_masonry: {
    paths: [
      // Lineas de bloques horizontales + grieta escalonada siguiendo juntas
      { d: 'M2 7 L22 7', strokeWidth: 0.3 },
      { d: 'M2 12 L22 12', strokeWidth: 0.3 },
      { d: 'M2 17 L22 17', strokeWidth: 0.3 },
      // Grieta escalonada
      { d: 'M5 4 L5 7 L9 7 L9 12 L13 12 L13 17 L17 17 L17 22', strokeWidth: 0.9 },
      // Borde de bloque
      { d: 'M2 4 L22 4', strokeWidth: 0.3 },
    ],
  },
  reentrant_corner: {
    paths: [
      // Esquina reentrante (hueco de ventana) + grietas en X desde la esquina
      { d: 'M2 4 L14 4 L14 12', strokeWidth: 0.5 },
      { d: 'M2 4 L2 22 L22 22 L22 4 L18 4', strokeWidth: 0.5 },
      // Grietas diagonales desde la esquina interior
      { d: 'M14 12 L8 18', strokeWidth: 0.7 },
      { d: 'M14 12 L20 18', strokeWidth: 0.7 },
      { d: 'M14 12 L14 20', strokeWidth: 0.5 },
    ],
  },
  interface_wall_column: {
    paths: [
      // Columna vertical + muro adyacente + grieta vertical en la interfaz
      { d: 'M9 2 L9 22', strokeWidth: 1.5 },
      { d: 'M10 2 L10 22', strokeWidth: 0.3 },
      { d: 'M11 4 L22 4', strokeWidth: 0.4 },
      { d: 'M11 8 L22 8', strokeWidth: 0.4 },
      { d: 'M11 12 L22 12', strokeWidth: 0.4 },
      { d: 'M11 16 L22 16', strokeWidth: 0.4 },
      { d: 'M11 20 L22 20', strokeWidth: 0.4 },
      // Grieta en la union
      { d: 'M10 3 L10 21', strokeWidth: 0.9 },
    ],
  },
  interface_wall_beam: {
    paths: [
      // Viga horizontal arriba + muro abajo + grieta horizontal en la union
      { d: 'M2 6 L22 6', strokeWidth: 1.5 },
      { d: 'M2 7 L22 7', strokeWidth: 0.3 },
      // Muro
      { d: 'M2 8 L22 8', strokeWidth: 0.4 },
      { d: 'M2 12 L22 12', strokeWidth: 0.4 },
      { d: 'M2 16 L22 16', strokeWidth: 0.4 },
      { d: 'M2 20 L22 20', strokeWidth: 0.4 },
      // Grieta horizontal
      { d: 'M2 7.5 L22 7.5', strokeWidth: 0.9 },
    ],
  },
  structural_beam_column: {
    paths: [
      // Nudo rigido viga-columna + grietas diagonales formando X
      { d: 'M10 2 L10 22', strokeWidth: 1.5 },
      { d: 'M2 10 L22 10', strokeWidth: 1.5 },
      // Grietas en X (falla del nudo)
      { d: 'M10 10 L4 16', strokeWidth: 0.9 },
      { d: 'M10 10 L16 16', strokeWidth: 0.9 },
      { d: 'M10 10 L4 4', strokeWidth: 0.5 },
      { d: 'M10 10 L16 4', strokeWidth: 0.5 },
      // Zona del nudo
      { d: 'M7 7 L13 13', strokeWidth: 0.4 },
    ],
  },
  spalling_corrosion: {
    paths: [
      // Concreto descascarado + varilla expuesta + oxido
      { d: 'M3 8 Q6 5 9 7 Q12 4 15 7 Q18 5 21 8 L21 18 L3 18 Z', strokeWidth: 0.5 },
      // Varillas expuestas (lineas verticales paralelas)
      { d: 'M8 18 L8 22', strokeWidth: 0.9 },
      { d: 'M12 18 L12 22', strokeWidth: 0.9 },
      { d: 'M16 18 L16 22', strokeWidth: 0.9 },
      // Marcas de oxido (puntos)
      { d: 'M8 20 L8.5 19.7', strokeWidth: 0.5 },
      { d: 'M12 19 L12.5 18.7', strokeWidth: 0.5 },
      { d: 'M16 21 L16.5 20.7', strokeWidth: 0.5 },
    ],
  },
};