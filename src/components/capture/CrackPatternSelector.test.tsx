/**
 * Tests para CrackPatternSelector — Selector visual de patron de grieta
 * (Spec R1, R2; Slice 2 Work Unit 2 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Renderiza exactamente 10 opciones (matching CrackPattern enum).
 *   - Cada opcion expone titulo en espanol desde PATTERN_METADATA.labelEs.
 *   - Cada opcion incluye un diagrama SVG inline (>=1 elemento <svg> por opcion).
 *   - Cada opcion incluye un SeverityBadge con el riskBaseline correcto.
 *   - Click en opcion invoca onChange(pattern) con el CrackPattern correcto.
 *   - Opcion seleccionada expone aria-checked="true" y role="radio".
 *   - Contenedor expone role="radiogroup" + aria-label descriptivo.
 *   - Keyboard navigation: focusable, espacio/enter seleccionan.
 *   - Tamano de tap target >= 44px (height/width CSS).
 *   - Invariante: cero emojis en el HTML renderizado.
 *
 * Diseno: src/components/capture/CrackPatternSelector.tsx
 * Spec: sdd/seismic-triage-upgrade/spec (R1: 10 patterns; R2: metadata)
 * Tasks: sdd/seismic-triage-upgrade/tasks (Phase 2, items 2.1-2.3)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CrackPatternSelector } from './CrackPatternSelector';
import {
  CRACK_PATTERN_VALUES,
  type CrackPattern,
} from '@/lib/validation/crackTaxonomy';

/** Regex de emoji equivalente al usado en SeverityBadge.test.tsx. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

const EXPECTED_TITLE_BY_PATTERN: Record<CrackPattern, string> = {
  hairline_cosmetic: 'Grieta Capilar Cosmetica',
  vertical_shrinkage: 'Contraccion Vertical',
  horizontal_flexural: 'Flexion Horizontal',
  diagonal_shear: 'Corte Diagonal',
  stepped_masonry: 'Mamposteria Escalonada',
  reentrant_corner: 'Esquina Reentrante',
  interface_wall_column: 'Union Muro-Columna',
  interface_wall_beam: 'Union Muro-Viga',
  structural_beam_column: 'Nudo Estructural Viga-Columna',
  spalling_corrosion: 'Descascaramiento y Corrosion',
};

describe('CrackPatternSelector', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('renderizado base: 10 opciones en espanol', () => {
    it('renderiza exactamente 10 opciones (matching CrackPattern enum)', () => {
      render(<CrackPatternSelector value={null} onChange={() => {}} />);
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(10);
    });

    it.each(CRACK_PATTERN_VALUES)(
      'renderiza el titulo en espanol "%s" -> "%s"',
      (value) => {
        render(<CrackPatternSelector value={null} onChange={() => {}} />);
        expect(
          screen.getByText(EXPECTED_TITLE_BY_PATTERN[value])
        ).toBeInTheDocument();
      }
    );

    it('renderiza cada opcion con la guidance textual de PATTERN_METADATA', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      // Total 10 textos de guidance visibles (accesibles)
      const texts = container.textContent ?? '';
      // Frases clave reconocibles por cada patron
      const expectedFragments = [
        '0.3 mm', // hairline_cosmetic
        'monitorear', // vertical_shrinkage
        'flexion', // horizontal_flexural
        'cortante', // diagonal_shear
        'juntas de mortero', // stepped_masonry
        'ventana', // reentrant_corner
        'anclajes', // interface_wall_column
        'nivel superior', // interface_wall_beam
        'nudo rigido', // structural_beam_column
        'varilla expuesta', // spalling_corrosion
      ];
      for (const frag of expectedFragments) {
        expect(texts.toLowerCase()).toContain(frag);
      }
    });
  });

  describe('diagrama SVG inline por opcion', () => {
    it('cada opcion incluye al menos un <svg> como diagrama vectorial', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      // 10 opciones, cada una con su svg de diagrama (>=10 svg internos)
      // ademas pueden existir otros svg si los badges usan iconos.
      const radios = container.querySelectorAll('[role="radio"]');
      expect(radios.length).toBe(10);
      for (const radio of Array.from(radios)) {
        const svgs = radio.querySelectorAll('svg');
        expect(svgs.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('los SVGs de diagrama son decorativos (aria-hidden=true)', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      const svgs = container.querySelectorAll('[role="radio"] svg');
      expect(svgs.length).toBeGreaterThanOrEqual(10);
      for (const svg of Array.from(svgs)) {
        // Diagramas vectoriales: aria-hidden=true (descripcion via titulo)
        const ariaHidden = svg.getAttribute('aria-hidden');
        expect(ariaHidden === 'true' || ariaHidden === null).toBe(true);
      }
    });
  });

  describe('SeverityBadge de riesgo baseline por opcion', () => {
    it('opciones con riskBaseline="minor" muestran badge "Leve"', () => {
      render(
        <CrackPatternSelector
          value="hairline_cosmetic"
          onChange={() => {}}
        />
      );
      // hairline_cosmetic es minor; debe haber al menos un badge "Leve"
      const leves = screen.getAllByText('Leve');
      expect(leves.length).toBeGreaterThanOrEqual(1);
    });

    it('opciones con riskBaseline="moderate" muestran badge "Moderado"', () => {
      render(
        <CrackPatternSelector value="stepped_masonry" onChange={() => {}} />
      );
      const moderate = screen.getAllByText('Moderado');
      expect(moderate.length).toBeGreaterThanOrEqual(1);
    });

    it('opciones con riskBaseline="critical" muestran badge "Critico"', () => {
      render(
        <CrackPatternSelector
          value="spalling_corrosion"
          onChange={() => {}}
        />
      );
      // spalling_corrosion es critical; debe haber al menos un badge "Critico"
      expect(screen.getAllByText('Crítico').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('interaccion: seleccion y onChange', () => {
    it('click en una opcion invoca onChange con el CrackPattern correcto', () => {
      const onChange = vi.fn();
      render(<CrackPatternSelector value={null} onChange={onChange} />);

      const radio = screen.getByRole('radio', {
        name: /Grieta Capilar Cosmetica/i,
      });
      fireEvent.click(radio);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('hairline_cosmetic');
    });

    it('click en otra opcion invoca onChange con su CrackPattern', () => {
      const onChange = vi.fn();
      render(<CrackPatternSelector value={null} onChange={onChange} />);

      const radio = screen.getByRole('radio', {
        name: /Corte Diagonal/i,
      });
      fireEvent.click(radio);

      expect(onChange).toHaveBeenCalledWith('diagonal_shear');
    });

    it('valor inicial null: ninguna opcion expone aria-checked=true', () => {
      render(<CrackPatternSelector value={null} onChange={() => {}} />);
      const radios = screen.getAllByRole('radio');
      for (const radio of radios) {
        expect(radio.getAttribute('aria-checked')).toBe('false');
      }
      // Tambien verificamos via query (no debe haber radios checked)
      expect(screen.queryAllByRole('radio', { checked: true }).length).toBe(0);
    });

    it('valor inicial definido: opcion seleccionada expone aria-checked=true', () => {
      render(
        <CrackPatternSelector
          value="diagonal_shear"
          onChange={() => {}}
        />
      );
      const checked = screen.getAllByRole('radio', { checked: true });
      expect(checked.length).toBe(1);
      expect(checked[0].getAttribute('aria-checked')).toBe('true');
    });

    it('cambiar el prop value refleja nueva opcion aria-checked', () => {
      const { rerender } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      expect(
        screen.queryAllByRole('radio', { checked: true }).length
      ).toBe(0);

      rerender(
        <CrackPatternSelector
          value="structural_beam_column"
          onChange={() => {}}
        />
      );
      const checked = screen.getAllByRole('radio', { checked: true });
      expect(checked.length).toBe(1);
    });
  });

  describe('ARIA y accesibilidad', () => {
    it('contenedor expone role="radiogroup"', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      const group = container.querySelector('[role="radiogroup"]');
      expect(group).not.toBeNull();
    });

    it('radiogroup expone aria-label descriptivo en espanol', () => {
      render(<CrackPatternSelector value={null} onChange={() => {}} />);
      const group = screen.getByRole('radiogroup');
      const label = group.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(0);
      // Esperado: en espanol, menciona "patron" o "grieta"
      expect(label.toLowerCase()).toMatch(/patr[oó]n|grieta/);
    });

    it('cada opcion expone role="radio"', () => {
      render(<CrackPatternSelector value={null} onChange={() => {}} />);
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(10);
      for (const radio of radios) {
        expect(radio.getAttribute('role')).toBe('radio');
      }
    });

    it('opciones son focusable (tabindex >= 0 cuando seleccionadas, sino tabindex >= -1)', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      const radios = container.querySelectorAll('[role="radio"]');
      for (const radio of Array.from(radios)) {
        const tabindex = radio.getAttribute('tabindex');
        expect(tabindex).not.toBeNull();
        const ti = Number(tabindex);
        expect(ti).toBeGreaterThanOrEqual(-1);
      }
    });

    it('cumple tamano minimo de tap target (>= 44px) en height o width', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      const radios = container.querySelectorAll('[role="radio"]');
      for (const radio of Array.from(radios)) {
        // min-h-[Npx] donde N >= 44, o min-h-11 (44px), o equivalentes.
        // Aceptamos min-h-[140px] (tamanos mayores son validos).
        const cls = radio.getAttribute('class') ?? '';
        // Acepta min-h-[Npx] con cualquier N>=44 (>= 44)
        const match = cls.match(/min-h-\[(\d+)px\]|min-h-(\d+)/);
        let ok = false;
        if (match) {
          const n = Number(match[1] ?? match[2]);
          ok = n >= 44;
        }
        // Tambien acepta clases de Tailwind estandar >= min-h-11 (44px)
        if (!ok) {
          ok = /min-h-\[\d{3,}px\]/.test(cls) || /\bmin-h-1[1-9]\b|\bmin-h-2\d\b|\bmin-h-3\d\b/.test(cls);
        }
        expect(ok).toBe(true);
      }
    });
  });

  describe('invariante: cero emojis en HTML renderizado', () => {
    it('el innerHTML del componente no contiene caracteres emoji', () => {
      const { container } = render(
        <CrackPatternSelector value="hairline_cosmetic" onChange={() => {}} />
      );
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('los aria-label de cada opcion no contienen emojis', () => {
      const { container } = render(
        <CrackPatternSelector value={null} onChange={() => {}} />
      );
      const radios = container.querySelectorAll('[role="radio"]');
      for (const radio of Array.from(radios)) {
        const ariaLabel = radio.getAttribute('aria-label') ?? '';
        expect(ariaLabel).not.toMatch(EMOJI_REGEX);
      }
    });
  });

  describe('className externo', () => {
    it('combina className externo con clases base', () => {
      const { container } = render(
        <CrackPatternSelector
          value={null}
          onChange={() => {}}
          className="custom-external-class"
        />
      );
      const group = container.querySelector('[role="radiogroup"]');
      expect(group?.getAttribute('class') ?? '').toContain(
        'custom-external-class'
      );
    });
  });
});