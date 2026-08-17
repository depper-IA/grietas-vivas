/**
 * Tests para DamageReportCard — card de reporte de danos con tokens semanticos.
 *
 * Contrato:
 *   - Contenedor de imagen con aspect-ratio 4/3 fijo (CLS = 0)
 *   - Telemtria: ancho de grieta (mm), confianza AI (%), GPS, timestamp ISO en espanol
 *   - Integracion con SeverityBadge (3 niveles: minor / moderate / critical)
 *   - Integracion con SyncStatusIndicator (4 estados: synced / pending / syncing / error)
 *   - Estado skeleton mientras la imagen carga
 *   - Micro-interacciones GPU-accelerated (transition-all duration-150)
 *   - Invariante: cero emojis en el HTML renderizado
 *
 * Ref: spec `visual-redesign-core` (Damage Assessment Cards, Sync Status Indicator,
 *      Severity Badge System, Zero CLS, No Emojis in UI).
 * Ref: design `DamageReportCard` (slice 3, work unit 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DamageReportCard } from './DamageReportCard';
import type { RiskLevel } from '@/lib/ai/types';
import type { SyncState } from '@/components/ui/SyncStatusIndicator';

/** Regex robusto para detectar caracteres emoji en HTML renderizado. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

describe('DamageReportCard', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('layout y contenedor de imagen', () => {
    it('el contenedor de imagen usa aspect-ratio 4/3 fijo (CLS = 0)', () => {
      const { container } = render(
        <DamageReportCard
          id="rep-001"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta estructural analizada"
          riskLevel="high"
          syncState="synced"
          crackWidthMm={2.4}
          confidencePercent={87}
          createdAtIso="2026-08-16T15:30:00.000Z"
          gpsLatitude={4.7110}
          gpsLongitude={-74.0721}
        />
      );

      const imageContainer = container.querySelector(
        '[data-testid="damage-report-thumbnail"]'
      );
      expect(imageContainer).not.toBeNull();
      expect(imageContainer?.className).toContain('aspect-[4/3]');
    });

    it('el contenedor externo usa tokens semanticos (surface-elevated, border-default)', () => {
      const { container } = render(
        <DamageReportCard
          id="rep-002"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const card = container.querySelector(
        '[data-testid="damage-report-card"]'
      );
      expect(card?.className).toContain('bg-surface-2');
      expect(card?.className).toContain('border-border-default');
    });

    it('la imagen renderizada tiene alt descriptivo para accesibilidad', () => {
      render(
        <DamageReportCard
          id="rep-003"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta horizontal de 2.4 mm en muro de concreto"
          riskLevel="high"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const img = screen.getByRole('img', {
        name: /Grieta horizontal de 2\.4 mm/,
      });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        'src',
        'https://cdn.example.com/crack.jpg'
      );
    });
  });

  describe('telemtria (chips de datos)', () => {
    it('renderiza ancho de grieta en mm con fuente mono y tabular-nums', () => {
      render(
        <DamageReportCard
          id="rep-004"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="medium"
          syncState="synced"
          crackWidthMm={2.4}
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      // El chip de ancho expone el valor con unidades mm
      const widthChip = screen.getByTestId('damage-report-width');
      expect(widthChip).toHaveTextContent('2.4');
      expect(widthChip.textContent).toMatch(/mm/);

      // Garantiza alineacion vertical entre filas (CLS visual = 0)
      expect(widthChip.className).toContain('font-mono');
      expect(widthChip.className).toContain('tabular-nums');
    });

    it('renderiza confianza AI como porcentaje con fuente mono y tabular-nums', () => {
      render(
        <DamageReportCard
          id="rep-005"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="high"
          syncState="synced"
          confidencePercent={87}
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const confidenceChip = screen.getByTestId('damage-report-confidence');
      expect(confidenceChip).toHaveTextContent('87%');

      // Tabular nums para columnas alineadas
      expect(confidenceChip.className).toContain('font-mono');
      expect(confidenceChip.className).toContain('tabular-nums');
    });

    it('renderiza ubicacion GPS como string en formato legible', () => {
      render(
        <DamageReportCard
          id="rep-006"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="critical"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
          gpsLatitude={4.711}
          gpsLongitude={-74.0721}
        />
      );

      const gpsChip = screen.getByTestId('damage-report-gps');
      // Formato esperado: "4.711, -74.072" (toFixed(3) en ambos)
      expect(gpsChip.textContent).toMatch(/4\.711/);
      expect(gpsChip.textContent).toMatch(/-74\.072/);
      // Fuente mono para alineacion
      expect(gpsChip.className).toContain('font-mono');
    });

    it('renderiza timestamp ISO formateado en espanol (es-CO)', () => {
      render(
        <DamageReportCard
          id="rep-007"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="medium"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const timestamp = screen.getByTestId('damage-report-timestamp');
      // El elemento expone el ISO original como atributo (machine-readable)
      expect(timestamp.tagName.toLowerCase()).toBe('time');
      expect(timestamp).toHaveAttribute(
        'datetime',
        '2026-08-16T15:30:00.000Z'
      );

      // El texto visible es la version formateada en espanol
      // toLocaleString('es-CO') produce un string con dia/mes/anio.
      // No validamos el texto exacto (depende de ICU), solo que no sea el ISO crudo.
      const visibleText = timestamp.textContent ?? '';
      expect(visibleText).not.toBe('2026-08-16T15:30:00.000Z');
      expect(visibleText.length).toBeGreaterThan(0);
    });

    it('omite chips cuando la telemetria no esta disponible (degradacion graceful)', () => {
      render(
        <DamageReportCard
          id="rep-008"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
          // Sin crackWidthMm, sin confidencePercent, sin GPS
        />
      );

      expect(
        screen.queryByTestId('damage-report-width')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('damage-report-confidence')
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('damage-report-gps')).not.toBeInTheDocument();
      // Timestamp SIEMPRE presente (es dato base del reporte)
      expect(
        screen.getByTestId('damage-report-timestamp')
      ).toBeInTheDocument();
    });
  });

  describe('integracion con SeverityBadge', () => {
    it('mapea riskLevel="low" o "medium" a severity "minor" (Leve)', () => {
      render(
        <DamageReportCard
          id="rep-009"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      // SeverityBadge expone role="status" con aria-label "Severidad: Leve"
      const badge = screen.getByRole('status', { name: /Severidad: Leve/ });
      expect(badge).toBeInTheDocument();
    });

    it('mapea riskLevel="high" a severity "moderate" (Moderado)', () => {
      render(
        <DamageReportCard
          id="rep-010"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="high"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const badge = screen.getByRole('status', {
        name: /Severidad: Moderado/,
      });
      expect(badge).toBeInTheDocument();
    });

    it('mapea riskLevel="critical" a severity "critical" (Critico)', () => {
      render(
        <DamageReportCard
          id="rep-011"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="critical"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const badge = screen.getByRole('status', {
        name: /Severidad: Crítico/,
      });
      expect(badge).toBeInTheDocument();
    });
  });

  describe('integracion con SyncStatusIndicator', () => {
    it('renderiza SyncStatusIndicator con state="synced" para reportes sincronizados', () => {
      render(
        <DamageReportCard
          id="rep-012"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      // SyncStatusIndicator expone data-state="synced"
      const indicator = document.querySelector('[data-state="synced"]');
      expect(indicator).not.toBeNull();
    });

    it('renderiza SyncStatusIndicator con state="pending" + badge contador', () => {
      render(
        <DamageReportCard
          id="rep-013"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="medium"
          syncState="pending"
          pendingSyncCount={3}
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const indicator = document.querySelector('[data-state="pending"]');
      expect(indicator).not.toBeNull();
      // Badge de pendientes (data-testid exportado por SyncStatusIndicator)
      expect(screen.getByTestId('pending-count')).toHaveTextContent('3');
    });

    it('renderiza SyncStatusIndicator con state="error" cuando hay fallo de sync', () => {
      render(
        <DamageReportCard
          id="rep-014"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="high"
          syncState="error"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const indicator = document.querySelector('[data-state="error"]');
      expect(indicator).not.toBeNull();
    });
  });

  describe('estado skeleton (imagen cargando)', () => {
    it('muestra skeleton placeholder cuando loading=true', () => {
      const { container } = render(
        <DamageReportCard
          id="rep-015"
          imageUrl={null}
          imageAlt="Cargando imagen..."
          riskLevel="medium"
          syncState="pending"
          createdAtIso="2026-08-16T15:30:00.000Z"
          loading
        />
      );

      // El contenedor sigue siendo aspect 4/3 (CLS = 0 durante la carga)
      const imageContainer = container.querySelector(
        '[data-testid="damage-report-thumbnail"]'
      );
      expect(imageContainer?.className).toContain('aspect-[4/3]');

      // Marca visible para tests y AT
      const skeleton = screen.getByTestId('damage-report-skeleton');
      expect(skeleton).toBeInTheDocument();
      // El placeholder debe ser accesible (sr-only) o tener aria-busy
      expect(
        skeleton.getAttribute('aria-busy') === 'true' ||
          skeleton.getAttribute('aria-label') !== null
      ).toBe(true);
    });

    it('no renderiza <img> en estado skeleton', () => {
      render(
        <DamageReportCard
          id="rep-016"
          imageUrl={null}
          imageAlt="Cargando imagen..."
          riskLevel="medium"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
          loading
        />
      );

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('micro-interacciones (GPU-accelerated)', () => {
    it('aplica transition-all duration-150 al card root para feedback suave', () => {
      const { container } = render(
        <DamageReportCard
          id="rep-017"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const card = container.querySelector(
        '[data-testid="damage-report-card"]'
      );
      expect(card?.className).toContain('transition-all');
      expect(card?.className).toContain('duration-150');
    });

    it('el easing aplicado es la curva canonica cubic-bezier(0.16, 1, 0.3, 1)', () => {
      const { container } = render(
        <DamageReportCard
          id="rep-018"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const card = container.querySelector(
        '[data-testid="damage-report-card"]'
      );
      expect(card?.className).toMatch(/ease-\[cubic-bezier/);
    });
  });

  describe('clasificacion estructural opcional', () => {
    it('renderiza la etiqueta de clasificacion cuando se pasa', () => {
      render(
        <DamageReportCard
          id="rep-019"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="high"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
          classificationLabel="Estructural"
        />
      );

      const label = screen.getByTestId('damage-report-classification');
      expect(label).toHaveTextContent('Estructural');
    });

    it('omite la etiqueta de clasificacion cuando no se pasa', () => {
      render(
        <DamageReportCard
          id="rep-020"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="low"
          syncState="synced"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      expect(
        screen.queryByTestId('damage-report-classification')
      ).not.toBeInTheDocument();
    });
  });

  describe('Invariante: cero emojis en el HTML renderizado', () => {
    const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const SYNC_STATES: SyncState[] = [
      'synced',
      'pending',
      'syncing',
      'error',
    ];

    it.each(
      RISK_LEVELS.flatMap((risk) =>
        SYNC_STATES.map((sync) => ({ risk, sync }))
      )
    )(
      'riskLevel=%s syncState=%s no contiene caracteres emoji',
      ({ risk, sync }) => {
        cleanup();
        const { container } = render(
          <DamageReportCard
            id="rep-emoji"
            imageUrl="https://cdn.example.com/crack.jpg"
            imageAlt="Grieta"
            riskLevel={risk}
            syncState={sync}
            pendingSyncCount={5}
            crackWidthMm={2.4}
            confidencePercent={87}
            createdAtIso="2026-08-16T15:30:00.000Z"
            gpsLatitude={4.711}
            gpsLongitude={-74.0721}
            classificationLabel="Estructural"
          />
        );
        expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
      }
    );

    it('ningun aria-label contiene emojis', () => {
      cleanup();
      const { container } = render(
        <DamageReportCard
          id="rep-aria"
          imageUrl="https://cdn.example.com/crack.jpg"
          imageAlt="Grieta"
          riskLevel="critical"
          syncState="error"
          createdAtIso="2026-08-16T15:30:00.000Z"
        />
      );

      const elementsWithAria = container.querySelectorAll('[aria-label]');
      elementsWithAria.forEach((el) => {
        const ariaLabel = el.getAttribute('aria-label') ?? '';
        expect(ariaLabel).not.toMatch(EMOJI_REGEX);
      });
    });
  });
});
