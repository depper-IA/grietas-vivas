/**
 * Tests de tokens semanticos del sistema de diseno.
 *
 * Verifica:
 *   1. Que el modulo `tokens` exporta la paleta completa esperada.
 *   2. Que las parejas texto/fondo criticas alcanzan WCAG AAA >= 7:1
 *      (requisito del spec `visual-redesign-core`).
 *   3. Que los pares severidad bg/fg (badges) alcanzan WCAG AA >= 4.5:1.
 *
 * Si los valores hex cambian sin ajustar el ratio, este test falla.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  SEMANTIC_TOKENS,
  REQUIRED_TEXT_PAIRS,
  REQUIRED_SEVERITY_PAIRS,
  REQUIRED_TRIAGE_PAIRS,
  REQUIRED_BRAND_PAIR,
  REQUIRED_CTA_PAIR,
  getStatusTriple,
  getTriageTriple,
  computeContrastRatio,
  type TriageLevel,
} from './tokens';

describe('SEMANTIC_TOKENS (estructura)', () => {
  it('expone superficies 0..3', () => {
    expect(SEMANTIC_TOKENS.surface[0]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.surface[1]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.surface[2]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.surface[3]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('expone la escala de bordes (subtle/default/strong)', () => {
    expect(SEMANTIC_TOKENS.border.subtle).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.border.default).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.border.strong).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('expone la escala de texto (primary/secondary/muted)', () => {
    expect(SEMANTIC_TOKENS.text.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.text.secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_TOKENS.text.muted).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('expone tripletas bg/fg/border para minor/moderate/critical', () => {
    for (const level of ['minor', 'moderate', 'critical'] as const) {
      expect(SEMANTIC_TOKENS.status[level].bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SEMANTIC_TOKENS.status[level].fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SEMANTIC_TOKENS.status[level].border).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('expone tripletas bg/fg/border para triage habitable/monitoring/unsafe/evacuate', () => {
    for (const level of [
      'habitable',
      'monitoring',
      'unsafe',
      'evacuate',
    ] as const) {
      expect(SEMANTIC_TOKENS.triage[level].bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SEMANTIC_TOKENS.triage[level].fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SEMANTIC_TOKENS.triage[level].border).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('expone un acento de marca', () => {
    expect(SEMANTIC_TOKENS.brand.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('computeContrastRatio', () => {
  it('caso conocido: negro sobre blanco == 21:1', () => {
    expect(computeContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('caso conocido: blanco sobre blanco == 1:1', () => {
    expect(computeContrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
  });

  it('es conmutativo: ratio(a,b) == ratio(b,a)', () => {
    expect(computeContrastRatio('#0b1220', '#f5f7fa')).toBeCloseTo(
      computeContrastRatio('#f5f7fa', '#0b1220'),
      6
    );
  });

  it('ignora mayusculas/minusculas en hex', () => {
    expect(computeContrastRatio('#ABCDEF', '123456')).toBeCloseTo(
      computeContrastRatio('#abcdef', '#123456'),
      6
    );
  });

  it('lanza error descriptivo ante hex invalido', () => {
    expect(() => computeContrastRatio('not-a-color', '#ffffff')).toThrow(
      /hex/i
    );
  });
});

describe('Contraste WCAG AAA (>= 7:1) — texto sobre superficies', () => {
  for (const pair of REQUIRED_TEXT_PAIRS) {
    const ratio = computeContrastRatio(pair.fg, pair.bg);
    it(`${pair.label}: ${pair.fg} sobre ${pair.bg} >= 7:1 (real ${ratio.toFixed(2)}:1)`, () => {
      expect(ratio).toBeGreaterThanOrEqual(7);
    });
  }
});

describe('Contraste WCAG AA (>= 4.5:1) — badge severidad bg/fg', () => {
  for (const pair of REQUIRED_SEVERITY_PAIRS) {
    const ratio = computeContrastRatio(pair.fg, pair.bg);
    it(`${pair.label}: ${pair.fg} sobre ${pair.bg} >= 4.5:1 (real ${ratio.toFixed(2)}:1)`, () => {
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('Contraste WCAG AA (>= 4.5:1) — banner triage bg/fg', () => {
  it('REQUIRED_TRIAGE_PAIRS incluye los 4 niveles', () => {
    expect(REQUIRED_TRIAGE_PAIRS.length).toBe(4);
  });
  for (const pair of REQUIRED_TRIAGE_PAIRS) {
    const ratio = computeContrastRatio(pair.fg, pair.bg);
    it(`${pair.label}: ${pair.fg} sobre ${pair.bg} >= 4.5:1 (real ${ratio.toFixed(2)}:1)`, () => {
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('getStatusTriple y getTriageTriple', () => {
  it('getStatusTriple devuelve tripleta para cada severity', () => {
    expect(getStatusTriple('minor').bg).toBe(SEMANTIC_TOKENS.status.minor.bg);
    expect(getStatusTriple('moderate').bg).toBe(SEMANTIC_TOKENS.status.moderate.bg);
    expect(getStatusTriple('critical').bg).toBe(SEMANTIC_TOKENS.status.critical.bg);
  });

  it('getTriageTriple devuelve tripleta para cada nivel', () => {
    const levels: readonly TriageLevel[] = [
      'habitable',
      'monitoring',
      'unsafe',
      'evacuate',
    ];
    for (const level of levels) {
      expect(getTriageTriple(level).bg).toBe(SEMANTIC_TOKENS.triage[level].bg);
      expect(getTriageTriple(level).fg).toBe(SEMANTIC_TOKENS.triage[level].fg);
      expect(getTriageTriple(level).border).toBe(
        SEMANTIC_TOKENS.triage[level].border
      );
    }
  });
});

describe('Contraste del acento de marca (>= 4.5:1 sobre surface-0)', () => {
  const ratio = computeContrastRatio(
    REQUIRED_BRAND_PAIR.fg,
    REQUIRED_BRAND_PAIR.bg
  );
  it(`brand accent: ${REQUIRED_BRAND_PAIR.fg} sobre ${REQUIRED_BRAND_PAIR.bg} >= 4.5:1 (real ${ratio.toFixed(2)}:1)`, () => {
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Contraste del CTA de marca (text-primary sobre brand.cta >= 4.5:1)', () => {
  const ratio = computeContrastRatio(
    REQUIRED_CTA_PAIR.fg,
    REQUIRED_CTA_PAIR.bg
  );
  it(`cta: ${REQUIRED_CTA_PAIR.fg} sobre ${REQUIRED_CTA_PAIR.bg} >= 4.5:1 (real ${ratio.toFixed(2)}:1)`, () => {
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Propiedad: cualquier par (texto, surface) listado cumple >= 7:1', () => {
  it('verifica invariante para todas las REQUIRED_TEXT_PAIRS', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: REQUIRED_TEXT_PAIRS.length - 1 }),
        (index) => {
          const pair = REQUIRED_TEXT_PAIRS[index];
          const ratio = computeContrastRatio(pair.fg, pair.bg);
          return ratio >= 7;
        }
      )
    );
  });
});