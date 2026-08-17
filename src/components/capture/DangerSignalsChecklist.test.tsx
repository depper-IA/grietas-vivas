/**
 * Tests para DangerSignalsChecklist — Checklist de 5 senales de peligro
 * inmediato (Spec R3, R4; Slice 2 Work Unit 2 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Renderiza exactamente 5 toggle cards (DangerSignals).
 *   - Cada toggle expone icono Lucide + label en espanol + descripcion.
 *   - Toggle onClick / onKey invocan onChange(signals) con estado actualizado.
 *   - Estado inicial: aria-checked refleja `value`.
 *   - Banner critico ("Peligro Estructural Detectado") aparece cuando
 *     cualquier senal trigger (exposedRebarSpalling o throughWallXCracks)
 *     esta activa.
 *   - role="group" + aria-label descriptivo en el contenedor.
 *   - Cada toggle expone role="checkbox" (semantica de toggle) o
 *     role="switch" + aria-checked.
 *   - Tap targets >= 44px.
 *   - Invariante: cero emojis en HTML renderizado.
 *
 * Diseno: src/components/capture/DangerSignalsChecklist.tsx
 * Spec: sdd/seismic-triage-upgrade/spec (R3: 5 booleans, R4: override)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DangerSignalsChecklist } from './DangerSignalsChecklist';
import type { DangerSignals } from '@/lib/validation/crackTaxonomy';

/** Regex de emoji equivalente al usado en SeverityBadge.test.tsx. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

const ALL_FALSE: DangerSignals = {
  jammedDoorsWindows: false,
  unleveledFloors: false,
  tiltedElements: false,
  exposedRebarSpalling: false,
  throughWallXCracks: false,
};

const EXPECTED_LABEL_KEYS: Array<{ key: keyof DangerSignals; fragment: string }> = [
  { key: 'jammedDoorsWindows', fragment: /puerta|ventana/i },
  { key: 'unleveledFloors', fragment: /piso|nivel/i },
  { key: 'tiltedElements', fragment: /inclin|columna|elemento/i },
  { key: 'exposedRebarSpalling', fragment: /varilla|concreto|descar/i },
  { key: 'throughWallXCracks', fragment: /grieta.*x|x.*grieta|atravesa/i },
];

describe('DangerSignalsChecklist', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('renderizado base: 5 toggles con iconos Lucide', () => {
    it('renderiza exactamente 5 toggles (uno por senal)', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      // Cada toggle es un button con role checkbox o switch
      const toggles = container.querySelectorAll(
        '[role="checkbox"], [role="switch"]'
      );
      expect(toggles.length).toBe(5);
    });

    it('cada toggle expone una etiqueta en espanol', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const text = container.textContent ?? '';
      for (const { fragment } of EXPECTED_LABEL_KEYS) {
        expect(text).toMatch(fragment);
      }
    });

    it('cada toggle incluye al menos un SVG de Lucide (icono)', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const toggles = container.querySelectorAll(
        '[role="checkbox"], [role="switch"]'
      );
      for (const toggle of Array.from(toggles)) {
        const lucideIcon = toggle.querySelector('svg[class*="lucide-"]');
        expect(lucideIcon).not.toBeNull();
      }
    });

    it('los iconos Lucide son decorativos (aria-hidden)', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const icons = container.querySelectorAll('svg[class*="lucide-"]');
      expect(icons.length).toBeGreaterThanOrEqual(5);
      for (const icon of Array.from(icons)) {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      }
    });
  });

  describe('estado inicial: aria-checked refleja value', () => {
    it('value=all-false: todos los toggles aria-checked="false"', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const toggles = container.querySelectorAll(
        '[role="checkbox"], [role="switch"]'
      );
      for (const toggle of Array.from(toggles)) {
        expect(toggle.getAttribute('aria-checked')).toBe('false');
      }
    });

    it('value con un toggle activo: solo ese expone aria-checked="true"', () => {
      const value: DangerSignals = {
        ...ALL_FALSE,
        jammedDoorsWindows: true,
      };
      const { container } = render(
        <DangerSignalsChecklist value={value} onChange={() => {}} />
      );
      const checked = container.querySelectorAll(
        '[role="checkbox"][aria-checked="true"], [role="switch"][aria-checked="true"]'
      );
      expect(checked.length).toBe(1);
    });

    it('cambiar el prop value refleja el nuevo aria-checked', () => {
      const { rerender } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      expect(
        screen.queryAllByRole('checkbox', { checked: true }).length +
          screen.queryAllByRole('switch', { checked: true }).length
      ).toBe(0);

      rerender(
        <DangerSignalsChecklist
          value={{ ...ALL_FALSE, exposedRebarSpalling: true }}
          onChange={() => {}}
        />
      );
      const checkedCount =
        screen.queryAllByRole('checkbox', { checked: true }).length +
        screen.queryAllByRole('switch', { checked: true }).length;
      expect(checkedCount).toBe(1);
    });
  });

  describe('interaccion: toggle y onChange', () => {
    it('click en toggle de jammedDoorsWindows invoca onChange con esa senal activa', () => {
      const onChange = vi.fn();
      render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={onChange} />
      );

      const toggle = screen.getByRole('checkbox', {
        name: /puerta|ventana|atascad/i,
      });
      fireEvent.click(toggle);

      expect(onChange).toHaveBeenCalledTimes(1);
      const arg = onChange.mock.calls[0][0] as DangerSignals;
      expect(arg.jammedDoorsWindows).toBe(true);
      // Las otras senales deben permanecer false (toggle, no reemplazar)
      expect(arg.exposedRebarSpalling).toBe(false);
    });

    it('click en toggle activo invoca onChange con esa senal desactivada', () => {
      const onChange = vi.fn();
      const value: DangerSignals = {
        ...ALL_FALSE,
        unleveledFloors: true,
      };
      render(<DangerSignalsChecklist value={value} onChange={onChange} />);

      const toggle = screen.getByRole('checkbox', {
        name: /piso|nivel/i,
      });
      fireEvent.click(toggle);

      const arg = onChange.mock.calls[0][0] as DangerSignals;
      expect(arg.unleveledFloors).toBe(false);
    });

    it('click alterna multiples toggles independientemente', () => {
      const onChange = vi.fn();
      const value: DangerSignals = {
        ...ALL_FALSE,
        jammedDoorsWindows: true,
      };
      render(<DangerSignalsChecklist value={value} onChange={onChange} />);

      // Toggle exposedRebarSpalling
      const spalling = screen.getByRole('checkbox', {
        name: /varilla|descar/i,
      });
      fireEvent.click(spalling);

      const arg = onChange.mock.calls[0][0] as DangerSignals;
      expect(arg.exposedRebarSpalling).toBe(true);
      expect(arg.jammedDoorsWindows).toBe(true); // preserva el previo
    });

    it('Enter en toggle invoca onChange (keyboard activation)', () => {
      const onChange = vi.fn();
      render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={onChange} />
      );

      const toggle = screen.getByRole('checkbox', {
        name: /puerta|ventana|atascad/i,
      });
      toggle.focus();
      fireEvent.keyDown(toggle, { key: 'Enter' });

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('banner critico reactivo (R3/R4)', () => {
    it('NO muestra banner critico cuando todas las senales son false', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const alerts = container.querySelectorAll('[role="alert"]');
      // Solo debe haber banners con role="alert" si hay peligro detectado
      expect(alerts.length).toBe(0);
    });

    it('muestra banner critico cuando exposedRebarSpalling=true', () => {
      const { container } = render(
        <DangerSignalsChecklist
          value={{ ...ALL_FALSE, exposedRebarSpalling: true }}
          onChange={() => {}}
        />
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      const text = container.textContent ?? '';
      expect(text).toMatch(/peligro estructural|evacuaci[oó]n|inminente/i);
    });

    it('muestra banner critico cuando throughWallXCracks=true', () => {
      const { container } = render(
        <DangerSignalsChecklist
          value={{ ...ALL_FALSE, throughWallXCracks: true }}
          onChange={() => {}}
        />
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
    });

    it('NO muestra banner critico con senales no-trigger activas (jammed, unleveled, tilted)', () => {
      const { container } = render(
        <DangerSignalsChecklist
          value={{
            ...ALL_FALSE,
            jammedDoorsWindows: true,
            unleveledFloors: true,
            tiltedElements: true,
          }}
          onChange={() => {}}
        />
      );
      // Las senales "no trigger" no disparan banner critico por si solas.
      // (El override de seguridad requiere pattern diagonal_shear + jammedDoors,
      // pero aqui no hay pattern; por lo tanto no hay banner critico automatico.)
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeNull();
    });

    it('el banner expone el texto "Peligro Estructural Detectado"', () => {
      const { container } = render(
        <DangerSignalsChecklist
          value={{ ...ALL_FALSE, exposedRebarSpalling: true }}
          onChange={() => {}}
        />
      );
      const text = container.textContent ?? '';
      expect(text).toContain('Peligro Estructural Detectado');
    });
  });

  describe('ARIA y accesibilidad', () => {
    it('contenedor expone role="group" o role="region" con aria-label', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const group = container.querySelector('[role="group"], [role="region"]');
      expect(group).not.toBeNull();
      const label = group?.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(0);
    });

    it('cumple tamano minimo de tap target (>= 44px) en cada toggle', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const toggles = container.querySelectorAll(
        '[role="checkbox"], [role="switch"]'
      );
      for (const toggle of Array.from(toggles)) {
        const cls = toggle.getAttribute('class') ?? '';
        const match = cls.match(/min-h-\[(\d+)px\]|min-h-(\d+)/);
        let ok = false;
        if (match) {
          const n = Number(match[1] ?? match[2]);
          ok = n >= 44;
        }
        if (!ok) {
          ok =
            /min-h-\[\d{3,}px\]/.test(cls) ||
            /\bmin-h-1[1-9]\b|\bmin-h-2\d\b|\bmin-h-3\d\b/.test(cls);
        }
        expect(ok).toBe(true);
      }
    });

    it('toggles son focusable', () => {
      render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const toggle = screen.getByRole('checkbox', {
        name: /puerta|ventana|atascad/i,
      });
      toggle.focus();
      expect(document.activeElement).toBe(toggle);
    });
  });

  describe('invariante: cero emojis en HTML renderizado', () => {
    it('el innerHTML no contiene caracteres emoji', () => {
      const value: DangerSignals = {
        ...ALL_FALSE,
        exposedRebarSpalling: true,
      };
      const { container } = render(
        <DangerSignalsChecklist value={value} onChange={() => {}} />
      );
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('los aria-label de cada toggle no contienen emojis', () => {
      const { container } = render(
        <DangerSignalsChecklist value={ALL_FALSE} onChange={() => {}} />
      );
      const toggles = container.querySelectorAll(
        '[role="checkbox"], [role="switch"]'
      );
      for (const toggle of Array.from(toggles)) {
        const ariaLabel = toggle.getAttribute('aria-label') ?? '';
        expect(ariaLabel).not.toMatch(EMOJI_REGEX);
      }
    });
  });

  describe('className externo', () => {
    it('combina className externo con clases base', () => {
      const { container } = render(
        <DangerSignalsChecklist
          value={ALL_FALSE}
          onChange={() => {}}
          className="custom-checklist-class"
        />
      );
      const root = container.firstChild as HTMLElement | null;
      // El contenedor raiz debe tener la clase externa
      const html = container.innerHTML;
      expect(html).toContain('custom-checklist-class');
    });
  });
});