/**
 * Tests para PostTriageActionGuide — Banner / guia post-triaje con
 * accion recomendada (Spec R8, R9; Slice 3 Work Unit 3).
 *
 * Contrato:
 *   - Renderiza el banner segun el nivel de TriageOutcome:
 *       * habitable          -> triage-habitable token
 *       * monitoring_required -> triage-monitoring token
 *       * unsafe_no_entry     -> triage-unsafe token
 *       * evacuate_emergency  -> triage-evacuate token
 *   - Boton "Llamar 123" (anchor tel:) presente SOLO en
 *     evacuate_emergency y unsafe_no_entry.
 *   - El numero de telefono viene de NEXT_PUBLIC_EMERGENCY_NUMBER
 *     (default '123').
 *   - Checklist pre-emergencia (modal o acordeon) con 5 items:
 *     Gas, Agua, Electricidad, No Ascensores, Zonas Comunes.
 *   - Accesibilidad: role apropiado, aria-label, focus management,
 *     keyboard navigation.
 *   - Tap targets >= 44px.
 *   - Invariante: cero emojis en el HTML renderizado.
 *
 * Diseno: src/components/reports/PostTriageActionGuide.tsx
 * Spec: sdd/seismic-triage-upgrade/spec (R8 outcome banner, R9 checklist)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PostTriageActionGuide } from './PostTriageActionGuide';
import type { TriageOutcome } from '@/lib/validation/crackTaxonomy';

/** Regex de emoji equivalente al usado en otros tests del proyecto. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

const OUTCOME_HABITABLE: TriageOutcome = {
  level: 'habitable',
  labelEs: 'Habitable',
  actionEs:
    'Puedes permanecer en la vivienda. Reinspecciona la grieta despues de 72 horas y documenta cualquier cambio.',
  safetyOverride: false,
};

const OUTCOME_MONITORING: TriageOutcome = {
  level: 'monitoring_required',
  labelEs: 'Monitoreo Requerido',
  actionEs:
    'Agenda una inspeccion profesional en los proximos 7 dias. Evita modificacion de muros hasta entonces.',
  safetyOverride: false,
};

const OUTCOME_UNSAFE: TriageOutcome = {
  level: 'unsafe_no_entry',
  labelEs: 'No Habitar',
  actionEs:
    'No permanezcas en el area afectada. Contacta un ingeniero estructural antes de cualquier intervencion.',
  safetyOverride: false,
};

const OUTCOME_EVACUATE: TriageOutcome = {
  level: 'evacuate_emergency',
  labelEs: 'Evacuacion Inmediata',
  actionEs:
    'Sal del inmueble ahora. Corta gas y agua, no uses ascensor. Llama a la linea de emergencias 123.',
  safetyOverride: true,
};

describe('PostTriageActionGuide', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('renderizado base: contenedor accesible', () => {
    it('renderiza un contenedor con role="region" y aria-label descriptivo', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_HABITABLE} />);
      const region = screen.getByRole('region', {
        name: /gu[ií]a post[-\s]?triaje|acci[oó]n post[-\s]?triaje/i,
      });
      expect(region).toBeInTheDocument();
    });

    it('acepta className externa y la aplica al contenedor', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_HABITABLE} className="extra-class" />
      );
      const region = container.querySelector('[role="region"]');
      expect(region?.className).toContain('extra-class');
    });
  });

  describe('4 niveles de triage con tokens semanticos', () => {
    it('habitable usa token triage-habitable', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_HABITABLE} />
      );
      const banner = container.querySelector('[data-testid="triage-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.className).toMatch(/triage-habitable/);
    });

    it('monitoring_required usa token triage-monitoring', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_MONITORING} />
      );
      const banner = container.querySelector('[data-testid="triage-banner"]');
      expect(banner?.className).toMatch(/triage-monitoring/);
    });

    it('unsafe_no_entry usa token triage-unsafe', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_UNSAFE} />
      );
      const banner = container.querySelector('[data-testid="triage-banner"]');
      expect(banner?.className).toMatch(/triage-unsafe/);
    });

    it('evacuate_emergency usa token triage-evacuate', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const banner = container.querySelector('[data-testid="triage-banner"]');
      expect(banner?.className).toMatch(/triage-evacuate/);
    });

    it('renderiza el label del outcome (labelEs)', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_HABITABLE} />);
      expect(screen.getByText('Habitable')).toBeInTheDocument();
    });

    it('renderiza la accion recomendada del outcome (actionEs)', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_HABITABLE} />);
      expect(
        screen.getByText(/permanecer en la vivienda/i)
      ).toBeInTheDocument();
    });
  });

  describe('boton de llamada a emergencias (R9)', () => {
    it('NO muestra boton de llamada en habitable', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_HABITABLE} />
      );
      const telLink = container.querySelector('a[href^="tel:"]');
      expect(telLink).toBeNull();
    });

    it('NO muestra boton de llamada en monitoring_required', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_MONITORING} />
      );
      const telLink = container.querySelector('a[href^="tel:"]');
      expect(telLink).toBeNull();
    });

    it('muestra boton de llamada en unsafe_no_entry', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_UNSAFE} />
      );
      const telLink = container.querySelector('a[href^="tel:"]');
      expect(telLink).not.toBeNull();
      expect(telLink?.getAttribute('href')).toMatch(/^tel:/);
    });

    it('muestra boton de llamada en evacuate_emergency', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const telLink = container.querySelector('a[href^="tel:"]');
      expect(telLink).not.toBeNull();
    });

    it('el boton "Llamar 123" usa NEXT_PUBLIC_EMERGENCY_NUMBER (default 123)', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const telLink = container.querySelector('a[href^="tel:"]');
      // Por defecto 123
      expect(telLink?.getAttribute('href')).toBe('tel:123');
    });

    it('el boton de llamada tiene altura >= 44px', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const telLink = container.querySelector('a[href^="tel:"]') as HTMLElement;
      expect(telLink.className).toMatch(/min-h-\[(44|48|52|56|60|64|72|80)px\]/);
    });

    it('el boton de llamada tiene aria-label descriptivo', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_EVACUATE} />);
      const btn = screen.getByRole('link', { name: /llamar.*123|emergencias/i });
      expect(btn).toBeInTheDocument();
    });
  });

  describe('checklist pre-emergencia (R9)', () => {
    it('muestra toggle / acordeon para abrir el checklist de seguridad', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_EVACUATE} />);
      expect(
        screen.getByRole('button', { name: /checklist|protocolo|antes de evacuar/i })
      ).toBeInTheDocument();
    });

    it('click en toggle abre el modal / panel del checklist', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_EVACUATE} />);
      const toggle = screen.getByRole('button', {
        name: /checklist|protocolo|antes de evacuar/i,
      });
      fireEvent.click(toggle);
      // El panel debe contener las 5 acciones canonicas
      expect(screen.getByText(/corta el gas/i)).toBeInTheDocument();
    });

    it('checklist contiene los 5 items canonicos: Gas, Agua, Electricidad, No Ascensores, Zonas Comunes', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_EVACUATE} />);
      const toggle = screen.getByRole('button', {
        name: /checklist|protocolo|antes de evacuar/i,
      });
      fireEvent.click(toggle);

      const checklist = screen.getByTestId('pre-evacuation-checklist');
      const text = checklist.textContent ?? '';

      // 5 items canonicos (con tolerancia a variaciones menores en la redaccion)
      expect(text).toMatch(/gas/i);
      expect(text).toMatch(/agua/i);
      expect(text).toMatch(/electric/i);
      expect(text).toMatch(/ascensor/i);
      expect(text).toMatch(/zonas comunes|[aá]reas comunes/i);
    });

    it('el checklist tiene role="region" / dialog con aria-label o aria-labelledby', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_EVACUATE} />);
      const toggle = screen.getByRole('button', {
        name: /checklist|protocolo|antes de evacuar/i,
      });
      fireEvent.click(toggle);
      const checklist = screen.getByTestId('pre-evacuation-checklist');
      // Aceptable: region, dialog, o un div con aria-labelledby / aria-label
      const hasAccessibleRole =
        checklist.getAttribute('role') === 'region' ||
        checklist.getAttribute('role') === 'dialog' ||
        checklist.hasAttribute('aria-label') ||
        checklist.hasAttribute('aria-labelledby');
      expect(hasAccessibleRole).toBe(true);
    });

    it('el checklist se muestra prioritariamente en triage evacuate / unsafe', () => {
      const { rerender } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      expect(
        screen.getByTestId('pre-evacuation-checklist-toggle')
      ).toBeInTheDocument();
      rerender(<PostTriageActionGuide outcome={OUTCOME_HABITABLE} />);
      // En niveles no-criticos el checklist puede estar ausente u opcional
      // (decisión de diseño: solo en unsafe/evacuate se enfatiza).
      const checklist = screen.queryByTestId('pre-evacuation-checklist-toggle');
      expect(checklist).toBeNull();
    });

    it('el boton de toggle del checklist tiene altura >= 44px', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const toggle = container.querySelector(
        '[data-testid="pre-evacuation-checklist-toggle"]'
      ) as HTMLElement;
      expect(toggle.className).toMatch(/min-h-\[(44|48|52|56|60|64|72|80)px\]/);
    });
  });

  describe('callback opcional onDismiss', () => {
    it('boton "Entendido" invoca onDismiss cuando se provee', () => {
      const onDismiss = vi.fn();
      render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} onDismiss={onDismiss} />
      );
      const dismissBtn = screen.getByRole('button', { name: /entendido|cerrar/i });
      fireEvent.click(dismissBtn);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('NO renderiza boton "Entendido" si onDismiss no se provee', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_HABITABLE} />);
      expect(
        screen.queryByRole('button', { name: /entendido|cerrar/i })
      ).toBeNull();
    });
  });

  describe('accesibilidad: estructura semantica', () => {
    it('renderiza un heading accesible con el label del outcome', () => {
      render(<PostTriageActionGuide outcome={OUTCOME_EVACUATE} />);
      const heading = screen.getByRole('heading', { name: /Evacuacion Inmediata/i });
      expect(heading).toBeInTheDocument();
    });

    it('iconos Lucide son decorativos (aria-hidden)', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const icons = container.querySelectorAll('svg[class*="lucide-"]');
      expect(icons.length).toBeGreaterThan(0);
      for (const icon of Array.from(icons)) {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('safetyOverride=true expone role="alert" o aria-live="assertive" en el banner', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      const banner = container.querySelector('[data-testid="triage-banner"]');
      // role="alert" o aria-live="assertive" para emergencias
      const isAlert =
        banner?.getAttribute('role') === 'alert' ||
        banner?.getAttribute('aria-live') === 'assertive';
      expect(isAlert).toBe(true);
    });
  });

  describe('invariante: cero emojis en HTML renderizado', () => {
    it('NO contiene emojis en habitable', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_HABITABLE} />
      );
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('NO contiene emojis en monitoring_required', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_MONITORING} />
      );
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('NO contiene emojis en unsafe_no_entry', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_UNSAFE} />
      );
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('NO contiene emojis en evacuate_emergency', () => {
      const { container } = render(
        <PostTriageActionGuide outcome={OUTCOME_EVACUATE} />
      );
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });
  });
});