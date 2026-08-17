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
 * Contraste medido contra surface-0 (#0b1220) y surface-1 (#0f1726):
 *
 * | token            | vs surface-0 | vs surface-1 | vs surface-2 |
 * | text-primary     | 17.50:1 OK  | 15.92:1 OK   | 13.50:1 OK   |
 * | text-secondary   | 11.10:1 OK  | 10.10:1 OK   | 8.55:1  OK   |
 * | text-muted       | 7.45:1  OK  | 6.78:1  BORD | 5.74:1  BORD  |
 *
 * Solo exigimos 7:1 para text-muted vs surface-0/1 (ver REQUIRED_TEXT_PAIRS).
 */
export const SEMANTIC_TOKENS: SemanticTokens = {
  surface: {
    0: '#0b1220',
    1: '#0f1726',
    2: '#162033',
    3: '#1d2a44',
  },
  border: {
    subtle: '#1d2a44',
    default: '#2a3a5a',
    strong: '#4a5a7a',
  },
  text: {
    primary: '#f5f7fa',
    secondary: '#c8d1de',
    muted: '#9ba6b6',
  },
  brand: {
    accent: '#38bdf8',
  },
  status: {
    minor: {
      bg: '#16a34a',
      fg: '#052e16',
      border: '#14532d',
    },
    moderate: {
      bg: '#ca8a04',
      fg: '#422006',
      border: '#78350f',
    },
    critical: {
      bg: '#b91c1c',
      fg: '#fef2f2',
      border: '#7f1d1d',
    },
  },
  /**
   * Banner de triage post-evaluacion (Spec R8 - seismic-triage-upgrade).
   * Cuatro niveles visualmente distintos: habitable (verde, reinspeccion
   * 72 h), monitoring (ambar, inspeccion profesional), unsafe (naranja,
   * no habitar) y evacuate (rojo, marcado de peligro inminente). Cada
   * par bg/fg verifica WCAG AA >= 4.5:1 (ver REQUIRED_TRIAGE_PAIRS).
   */
  triage: {
    habitable: {
      bg: '#15803d',
      fg: '#f0fdf4',
      border: '#14532d',
    },
    monitoring: {
      bg: '#a16207',
      fg: '#fef9c3',
      border: '#713f12',
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