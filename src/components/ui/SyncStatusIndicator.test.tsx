/**
 * Tests para SyncStatusIndicator — primitiva visual de sincronizacion.
 *
 * Contrato:
 *   - 4 estados: 'synced' (Sincronizado), 'pending' (Pendiente + count),
 *                'syncing' (Sincronizando... + pulse), 'error' (Error)
 *   - Iconos Lucide: CheckCircle2, Clock, RefreshCw, AlertCircle
 *   - ARIA: role="status" + aria-live="polite"
 *   - Estado 'syncing' aplica clase de animacion 'animate-sync-pulse'
 *   - Estado 'pending' muestra badge con contador cuando pendingCount > 0
 *   - Invariante: cero emojis en el HTML renderizado
 *
 * Ref: spec `visual-redesign-core` (Offline Sync Status Indicator).
 * Ref: design `SyncStatusIndicatorProps`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SyncStatusIndicator } from './SyncStatusIndicator';

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

describe('SyncStatusIndicator', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('estado "synced"', () => {
    it('renderiza texto espanol "Sincronizado"', () => {
      render(<SyncStatusIndicator state="synced" />);
      expect(screen.getByText('Sincronizado')).toBeInTheDocument();
    });

    it('usa icono CheckCircle2 (lucide-circle-check)', () => {
      const { container } = render(<SyncStatusIndicator state="synced" />);
      const icon = container.querySelector('svg.lucide-circle-check');
      expect(icon).not.toBeNull();
    });

    it('NO renderiza contador de pendientes', () => {
      const { container } = render(<SyncStatusIndicator state="synced" />);
      // El contador solo debe aparecer si state === 'pending' y count > 0
      expect(container.querySelector('[data-testid="pending-count"]')).toBeNull();
    });

    it('NO aplica clase de animacion sync-pulse', () => {
      const { container } = render(<SyncStatusIndicator state="synced" />);
      const root = container.querySelector('[role="status"]');
      expect(root?.className ?? '').not.toContain('animate-sync-pulse');
    });
  });

  describe('estado "pending"', () => {
    it('renderiza texto espanol "Pendiente"', () => {
      render(<SyncStatusIndicator state="pending" />);
      expect(screen.getByText('Pendiente')).toBeInTheDocument();
    });

    it('usa icono Clock (lucide-clock)', () => {
      const { container } = render(<SyncStatusIndicator state="pending" />);
      const icon = container.querySelector('svg.lucide-clock');
      expect(icon).not.toBeNull();
    });

    it('muestra badge con contador cuando pendingCount > 0', () => {
      render(<SyncStatusIndicator state="pending" pendingCount={3} />);
      expect(screen.getByTestId('pending-count').textContent).toBe('3');
    });

    it('muestra "99+" para contadores grandes (>99)', () => {
      render(<SyncStatusIndicator state="pending" pendingCount={250} />);
      expect(screen.getByTestId('pending-count').textContent).toBe('99+');
    });

    it('NO muestra badge cuando pendingCount es 0 o undefined', () => {
      const { container: c1 } = render(
        <SyncStatusIndicator state="pending" pendingCount={0} />
      );
      expect(c1.querySelector('[data-testid="pending-count"]')).toBeNull();

      cleanup();
      const { container: c2 } = render(
        <SyncStatusIndicator state="pending" />
      );
      expect(c2.querySelector('[data-testid="pending-count"]')).toBeNull();
    });

    it('NO aplica clase de animacion sync-pulse', () => {
      const { container } = render(
        <SyncStatusIndicator state="pending" pendingCount={2} />
      );
      const root = container.querySelector('[role="status"]');
      expect(root?.className ?? '').not.toContain('animate-sync-pulse');
    });
  });

  describe('estado "syncing"', () => {
    it('renderiza texto espanol "Sincronizando..."', () => {
      render(<SyncStatusIndicator state="syncing" />);
      expect(screen.getByText(/Sincronizando/)).toBeInTheDocument();
    });

    it('usa icono RefreshCw (lucide-refresh-cw)', () => {
      const { container } = render(<SyncStatusIndicator state="syncing" />);
      const icon = container.querySelector('svg.lucide-refresh-cw');
      expect(icon).not.toBeNull();
    });

    it('aplica clase de animacion "animate-sync-pulse"', () => {
      const { container } = render(<SyncStatusIndicator state="syncing" />);
      const root = container.querySelector('[role="status"]');
      expect(root?.className ?? '').toContain('animate-sync-pulse');
    });

    it('ignora pendingCount (no muestra badge en syncing)', () => {
      const { container } = render(
        <SyncStatusIndicator state="syncing" pendingCount={5} />
      );
      expect(container.querySelector('[data-testid="pending-count"]')).toBeNull();
    });
  });

  describe('estado "error"', () => {
    it('renderiza texto espanol "Error de sincronizacion"', () => {
      render(<SyncStatusIndicator state="error" />);
      expect(screen.getByText(/Error de sincronizaci[oó]n/i)).toBeInTheDocument();
    });

    it('usa icono AlertCircle (lucide-circle-alert)', () => {
      const { container } = render(<SyncStatusIndicator state="error" />);
      const icon = container.querySelector('svg.lucide-circle-alert');
      expect(icon).not.toBeNull();
    });

    it('NO aplica clase de animacion sync-pulse', () => {
      const { container } = render(<SyncStatusIndicator state="error" />);
      const root = container.querySelector('[role="status"]');
      expect(root?.className ?? '').not.toContain('animate-sync-pulse');
    });
  });

  describe('ARIA y accesibilidad', () => {
    const states: Array<'synced' | 'pending' | 'syncing' | 'error'> = [
      'synced',
      'pending',
      'syncing',
      'error',
    ];

    it.each(states)(
      'estado "%s" expone role="status"',
      (state) => {
        render(<SyncStatusIndicator state={state} />);
        expect(screen.getByRole('status')).toBeInTheDocument();
      }
    );

    it.each(states)(
      'estado "%s" expone aria-live="polite"',
      (state) => {
        render(<SyncStatusIndicator state={state} />);
        expect(screen.getByRole('status')).toHaveAttribute(
          'aria-live',
          'polite'
        );
      }
    );

    it.each(states)(
      'estado "%s" expone aria-label descriptivo en espanol',
      (state) => {
        render(<SyncStatusIndicator state={state} pendingCount={4} />);
        const root = screen.getByRole('status');
        const ariaLabel = root.getAttribute('aria-label');
        expect(ariaLabel).not.toBeNull();
        expect(ariaLabel).toMatch(/sincroniz|Sincroniz|Pendiente|Error/i);
      }
    );

    it('combina className externo con clases base', () => {
      const { container } = render(
        <SyncStatusIndicator state="synced" className="custom-test-class" />
      );
      const root = container.querySelector('[role="status"]');
      expect(root?.className).toContain('custom-test-class');
    });
  });

  describe('Invariante: cero emojis en el HTML renderizado', () => {
    const states: Array<'synced' | 'pending' | 'syncing' | 'error'> = [
      'synced',
      'pending',
      'syncing',
      'error',
    ];

    it.each(states)(
      'estado "%s" no contiene caracteres emoji',
      (state) => {
        const { container } = render(
          <SyncStatusIndicator state={state} pendingCount={7} />
        );
        const html = container.innerHTML;
        expect(html).not.toMatch(EMOJI_REGEX);
      }
    );

    it.each(states)(
      'el aria-label del estado "%s" no contiene emojis',
      (state) => {
        render(<SyncStatusIndicator state={state} />);
        const ariaLabel = screen.getByRole('status').getAttribute('aria-label');
        expect(ariaLabel ?? '').not.toMatch(EMOJI_REGEX);
      }
    );
  });
});