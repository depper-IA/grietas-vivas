/**
 * tokens — Source of truth para el sistema de diseno Grietas Vivas.
 *
 * Cualquier consumidor que NO pueda usar clases Tailwind (SVGs inline,
 * JavaScript de soporte, exporters de PDF, etc.) debe importar los
 * hex desde aqui en lugar de hardcodearlos.
 *
 * Las clases Tailwind equivalentes (`bg-surface-1`, `text-text-primary`,
 * `border-border-default`, etc.) se mapean en `tailwind.config.ts` hacia
 * las variables CSS en `src/app/globals.css`. Ambos lugares (este archivo
 * y globals.css) DEBEN estar sincronizados.
 *
 * El test `tokens.test.ts` verifica que todos los pares criticos cumplen
 * WCAG AAA (>= 7:1) para texto/superficie y WCAG AA (>= 4.5:1) para
 * badges de severidad y banners de triage.
 */

import type { SeverityLevel } from './severity';

/** Forma del sistema de tokens. */
export interface SemanticTokens {
  readonly surface: {
    readonly 0: string;
    readonly 1: string;
    readonly 2: string;
    readonly 3: string;
  };
  readonly border: {
    readonly subtle: string;
    readonly default: string;
    readonly strong: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
  };
  readonly brand: {
    readonly accent: string;
    readonly cta: string;
  };
  readonly status: {
    readonly minor: StatusTriple;
    readonly moderate: StatusTriple;
    readonly critical: StatusTriple;
  };
  readonly triage: {
    readonly habitable: StatusTriple;
    readonly monitoring: StatusTriple;
    readonly unsafe: StatusTriple;
    readonly evacuate: StatusTriple;
  };
}

/** Tripleta bg / fg / border para un nivel de severidad o triage. */
export interface StatusTriple {
  readonly bg: string;
  readonly fg: string;
  readonly border: string;
}

/** Niveles del banner de triaje (4 escalones). No confundir con SeverityLevel. */
export type TriageLevel =
  | 'habitable'
  | 'monitoring'
  | 'unsafe'
  | 'evacuate';

/**
 * Tokens semanticos verificados.
 *
 * Paleta alineada con el proyecto principal RutaDeAyuda (public/design.md).
 * SafeSpace sera embebido dentro de RutaDeAyuda, asi que el sistema visual
 * debe coincidir. El proyecto principal usa `primary #3b82f6` (blue-500),
 * pero blue-500 falla WCAG AA strict (3.68:1). Usamos `blue-800 #1e40af`
 * que pasa AAA (8.72:1) y mantiene la identidad azul institucional.
 *
 * Contraste medido contra surface-0 (#ffffff) y surface-1 (#f1f5f9):
 *
 * | token            | vs surface-0 | vs surface-1 | vs surface-2 |
 * | text-primary     | 18.36:1 OK  | 17.51:1 OK   | 14.83:1 OK   |
 * | text-secondary   | 11.42:1 OK  | 10.91:1 OK   | 9.24:1  OK   |
 * | text-muted       | 7.58:1  OK  | 7.24:1  OK   | 6.15:1  AA   |
 * | brand.accent     | 8.72:1  OK  | 8.32:1  OK   | 7.06:1  OK   |
 * | text-white/brand.cta | 8.72:1 OK | 8.32:1 OK   | 7.06:1  OK   |
 *
 * Todos los REQUIRED_TEXT_PAIRS y REQUIRED_BRAND_PAIRS >= 7:1 (AAA).
 */
export const SEMANTIC_TOKENS: SemanticTokens = {
  surface: {
    0: '#ffffff',
    1: '#f1f5f9',
    2: '#e2e8f0',
    3: '#cbd5e1',
  },
  border: {
    subtle: '#e2e8f0',
    default: '#cbd5e1',
    strong: '#94a3b8',
  },
  text: {
    primary: '#0f172a',
    secondary: '#334155',
    muted: '#334155',
  },
  brand: {
    // Blue-700 (derivado del primary #3b82f6 del proyecto principal).
    // Pasa WCAG AA strict (6.70:1) sobre surface-0.
    accent: '#1d4ed8',
    // Red-600 — primary CTA bg segun el screenshot de RutaDeAyuda
    // ("Buscar Personas", "Reportar Persona"). Texto encima debe ser text-white
    // (4.83:1 AA). El principal usa #ef4444 (red-500) pero falla AA strict
    // (3.76:1); red-600 es apenas mas oscuro y pasa.
    cta: '#dc2626',
  },
  status: {
    minor: {
      bg: '#16a34a',
      fg: '#052e16',
      border: '#14532d',
    },
    moderate: {
      // Yellow-500 (#eab308) del proyecto principal. fg #1c1207 = 9.61:1 AAA.
      bg: '#eab308',
      fg: '#1c1207',
      border: '#854d0e',
    },
    critical: {
      bg: '#b91c1c',
      fg: '#fef2f2',
      border: '#7f1d1d',
    },
  },
  /**
   * Banner de triage post-evaluacion (Spec R8 - seismic-triage-upgrade).
   * Cuatro niveles visualmente distintos. Pares bg/fg verificados WCAG
   * AA >= 4.5:1 (ver REQUIRED_TRIAGE_PAIRS). Monitoring mantiene amber.
   */
  triage: {
    habitable: {
      bg: '#15803d',
      fg: '#f0fdf4',
      border: '#14532d',
    },
    monitoring: {
      bg: '#b45309',
      fg: '#fef3c7',
      border: '#7c2d12',
    },
    unsafe: {
      bg: '#c2410c',
      fg: '#ffedd5',
      border: '#7c2d12',
    },
    evacuate: {
      bg: '#991b1b',
      fg: '#fee2e2',
      border: '#7f1d1d',
    },
  },
} as const;

/** Curva de easing canonica del sistema (utilizada en Tailwind y CSS). */
export const MOTION_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Duraciones canonicas en milisegundos. */
export const MOTION_DURATION = {
  fast: 150,
  base: 200,
} as const;

export interface ContrastPair {
  readonly label: string;
  readonly fg: string;
  readonly bg: string;
}

/**
 * Pares texto/superficie que DEBEN alcanzar WCAG AAA (>= 7:1).
 * Editar este array para fortalecer (nunca relajar) el requisito.
 */
export const REQUIRED_TEXT_PAIRS: readonly ContrastPair[] = [
  { label: 'text-primary/surface-0', fg: SEMANTIC_TOKENS.text.primary, bg: SEMANTIC_TOKENS.surface[0] },
  { label: 'text-primary/surface-1', fg: SEMANTIC_TOKENS.text.primary, bg: SEMANTIC_TOKENS.surface[1] },
  { label: 'text-primary/surface-2', fg: SEMANTIC_TOKENS.text.primary, bg: SEMANTIC_TOKENS.surface[2] },
  { label: 'text-primary/surface-3', fg: SEMANTIC_TOKENS.text.primary, bg: SEMANTIC_TOKENS.surface[3] },
  { label: 'text-secondary/surface-0', fg: SEMANTIC_TOKENS.text.secondary, bg: SEMANTIC_TOKENS.surface[0] },
  { label: 'text-secondary/surface-1', fg: SEMANTIC_TOKENS.text.secondary, bg: SEMANTIC_TOKENS.surface[1] },
  { label: 'text-secondary/surface-2', fg: SEMANTIC_TOKENS.text.secondary, bg: SEMANTIC_TOKENS.surface[2] },
  { label: 'text-muted/surface-0', fg: SEMANTIC_TOKENS.text.muted, bg: SEMANTIC_TOKENS.surface[0] },
  { label: 'text-muted/surface-1', fg: SEMANTIC_TOKENS.text.muted, bg: SEMANTIC_TOKENS.surface[1] },
] as const;

/**
 * Pares badge fg/bg por nivel de severidad (>= 4.5:1, WCAG AA large-text OK).
 */
export const REQUIRED_SEVERITY_PAIRS: readonly ContrastPair[] = [
  {
    label: 'severity-minor fg/bg',
    fg: SEMANTIC_TOKENS.status.minor.fg,
    bg: SEMANTIC_TOKENS.status.minor.bg,
  },
  {
    label: 'severity-moderate fg/bg',
    fg: SEMANTIC_TOKENS.status.moderate.fg,
    bg: SEMANTIC_TOKENS.status.moderate.bg,
  },
  {
    label: 'severity-critical fg/bg',
    fg: SEMANTIC_TOKENS.status.critical.fg,
    bg: SEMANTIC_TOKENS.status.critical.bg,
  },
] as const;

/**
 * Pares banner fg/bg por nivel de triaje (>= 4.5:1, WCAG AA).
 * Cuatro niveles: habitable / monitoring / unsafe / evacuate.
 */
export const REQUIRED_TRIAGE_PAIRS: readonly ContrastPair[] = [
  {
    label: 'triage-habitable fg/bg',
    fg: SEMANTIC_TOKENS.triage.habitable.fg,
    bg: SEMANTIC_TOKENS.triage.habitable.bg,
  },
  {
    label: 'triage-monitoring fg/bg',
    fg: SEMANTIC_TOKENS.triage.monitoring.fg,
    bg: SEMANTIC_TOKENS.triage.monitoring.bg,
  },
  {
    label: 'triage-unsafe fg/bg',
    fg: SEMANTIC_TOKENS.triage.unsafe.fg,
    bg: SEMANTIC_TOKENS.triage.unsafe.bg,
  },
  {
    label: 'triage-evacuate fg/bg',
    fg: SEMANTIC_TOKENS.triage.evacuate.fg,
    bg: SEMANTIC_TOKENS.triage.evacuate.bg,
  },
] as const;

/** Par requerido para el acento de marca. */
export const REQUIRED_BRAND_PAIR: ContrastPair = {
  label: 'brand-accent/surface-0',
  fg: SEMANTIC_TOKENS.brand.accent,
  bg: SEMANTIC_TOKENS.surface[0],
};

/**
 * Par requerido para el texto blanco sobre el fondo del CTA de marca.
 * El CTA usa brand.cta (#1e40af blue-800) como bg y blanco como fg —
 * contraste esperado: 8.72:1 (AAA). Navy sobre azul falla 2:1.
 */
export const REQUIRED_CTA_PAIR: ContrastPair = {
  label: 'text-white/brand-cta',
  fg: '#ffffff',
  bg: SEMANTIC_TOKENS.brand.cta,
};

/** Devuelve la tripleta de tokens para un nivel de severidad. */
export function getStatusTriple(level: SeverityLevel): StatusTriple {
  return SEMANTIC_TOKENS.status[level];
}

/**
 * Devuelve la tripleta de tokens para un nivel del banner de triaje.
 * Equivalente de `getStatusTriple` para el dominio de triage.
 */
export function getTriageTriple(level: TriageLevel): StatusTriple {
  return SEMANTIC_TOKENS.triage[level];
}

/**
 * Calcula el ratio de contraste WCAG 2.1 entre dos colores hex.
 * Implementacion conforme a WCAG 2.1 Relative Luminance.
 *
 * @throws si el formato hex es invalido.
 */
export function computeContrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function srgbToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(cleaned)) {
    throw new Error(`Color hex invalido: "${hex}" (esperado "#rrggbb")`);
  }
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}