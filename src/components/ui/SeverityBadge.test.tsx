/**
 * Tests para SeverityBadge — primitiva visual de severidad.
 *
 * Contrato:
 *   - 3 niveles: 'minor' (Leve), 'moderate' (Moderado), 'critical' (Critico)
 *   - 3 tamanos: 'sm', 'md' (default), 'lg'
 *   - Iconos Lucide: Leaf, AlertTriangle, AlertOctagon
 *   - Clases de tokens semanticos (status-minor/moderate/critical)
 *   - ARIA: role="status" + aria-label en espanol
 *   - Invariante: cero emojis en el HTML renderizado
 *
 * Ref: spec `visual-redesign-core` (Severity Badge System).
 * Ref: design `SeverityBadgeProps`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SeverityBadge } from './SeverityBadge';

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

describe('SeverityBadge', () => {
  beforeEach(() => {
    // Cada test arranca con DOM limpio
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('nivel "minor" (Leve)', () => {
    it('renderiza texto espanol "Leve"', () => {
      render(<SeverityBadge level="minor" />);
      expect(screen.getByText('Leve')).toBeInTheDocument();
    });

    it('aplica clases de token status-minor', () => {
      render(<SeverityBadge level="minor" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-status-minor');
      expect(badge.className).toContain('text-status-minor-fg');
      expect(badge.className).toContain('border-status-minor-border');
    });

    it('expone aria-label en espanol: "Severidad: Leve"', () => {
      render(<SeverityBadge level="minor" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Severidad: Leve'
      );
    });
  });

  describe('nivel "moderate" (Moderado)', () => {
    it('renderiza texto espanol "Moderado"', () => {
      render(<SeverityBadge level="moderate" />);
      expect(screen.getByText('Moderado')).toBeInTheDocument();
    });

    it('aplica clases de token status-moderate', () => {
      render(<SeverityBadge level="moderate" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-status-moderate');
      expect(badge.className).toContain('text-status-moderate-fg');
      expect(badge.className).toContain('border-status-moderate-border');
    });

    it('expone aria-label en espanol: "Severidad: Moderado"', () => {
      render(<SeverityBadge level="moderate" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Severidad: Moderado'
      );
    });
  });

  describe('nivel "critical" (Critico)', () => {
    it('renderiza texto espanol "Critico"', () => {
      render(<SeverityBadge level="critical" />);
      expect(screen.getByText('Crítico')).toBeInTheDocument();
    });

    it('aplica clases de token status-critical', () => {
      render(<SeverityBadge level="critical" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-status-critical');
      expect(badge.className).toContain('text-status-critical-fg');
      expect(badge.className).toContain('border-status-critical-border');
    });

    it('expone aria-label en espanol: "Severidad: Critico"', () => {
      render(<SeverityBadge level="critical" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Severidad: Crítico'
      );
    });
  });

  describe('iconos Lucide por nivel', () => {
    it('minor usa icono Leaf (svg lucide)', () => {
      const { container } = render(<SeverityBadge level="minor" />);
      // lucide-react genera <svg class="lucide lucide-leaf ...">
      const icon = container.querySelector('svg.lucide-leaf');
      expect(icon).not.toBeNull();
    });

    it('moderate usa icono AlertTriangle (lucide-triangle-alert)', () => {
      const { container } = render(<SeverityBadge level="moderate" />);
      const icon = container.querySelector('svg.lucide-triangle-alert');
      expect(icon).not.toBeNull();
    });

    it('critical usa icono AlertOctagon (lucide-octagon-alert)', () => {
      const { container } = render(<SeverityBadge level="critical" />);
      const icon = container.querySelector('svg.lucide-octagon-alert');
      expect(icon).not.toBeNull();
    });

    it('el icono esta marcado como decorativo (aria-hidden)', () => {
      const { container } = render(<SeverityBadge level="minor" />);
      const icon = container.querySelector('svg.lucide-leaf');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('variantes de tamano', () => {
    it('tamano por defecto es "md"', () => {
      const { container } = render(<SeverityBadge level="minor" />);
      const badge = container.querySelector('[role="status"]');
      expect(badge?.className).toContain('text-xs');
      // md usa text-xs + px-2.5 + py-1 (intermedio)
      expect(badge?.className).toMatch(/px-2\.5|py-1/);
    });

    it('tamano "sm" reduce tamano de texto y padding', () => {
      const { container } = render(
        <SeverityBadge level="minor" size="sm" />
      );
      const badge = container.querySelector('[role="status"]');
      // sm debe ser mas chico que md
      expect(badge?.className).toMatch(/text-\[10px\]|text-xs.*px-1\.5|p-0\.5/);
    });

    it('tamano "lg" aumenta tamano de texto y padding', () => {
      const { container } = render(
        <SeverityBadge level="minor" size="lg" />
      );
      const badge = container.querySelector('[role="status"]');
      // lg debe ser mas grande que md
      expect(badge?.className).toMatch(/text-sm|px-3|py-1\.5/);
    });
  });

  describe('ARIA y accesibilidad', () => {
    it('siempre expone role="status"', () => {
      const { rerender } = render(<SeverityBadge level="minor" />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<SeverityBadge level="moderate" />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<SeverityBadge level="critical" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('combina className externo con clases base', () => {
      const { container } = render(
        <SeverityBadge level="minor" className="custom-test-class" />
      );
      const badge = container.querySelector('[role="status"]');
      expect(badge?.className).toContain('custom-test-class');
      expect(badge?.className).toContain('bg-status-minor');
    });
  });

  describe('Invariante: cero emojis en el HTML renderizado', () => {
    const levels: Array<'minor' | 'moderate' | 'critical'> = [
      'minor',
      'moderate',
      'critical',
    ];

    it.each(levels)(
      'no contiene caracteres emoji al renderizar nivel "%s" en ningun tamano',
      (level) => {
        const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
        for (const size of sizes) {
          cleanup();
          const { container } = render(
            <SeverityBadge level={level} size={size} />
          );
          const html = container.innerHTML;
          expect(html).not.toMatch(EMOJI_REGEX);
        }
      }
    );

    it('el aria-label nunca contiene emojis', () => {
      for (const level of levels) {
        cleanup();
        render(<SeverityBadge level={level} />);
        const ariaLabel = screen.getByRole('status').getAttribute('aria-label');
        expect(ariaLabel).not.toMatch(EMOJI_REGEX);
      }
    });
  });
});