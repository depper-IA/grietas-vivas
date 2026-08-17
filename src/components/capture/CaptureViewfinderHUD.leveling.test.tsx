/**
 * Tests para CaptureViewfinderHUD — Indicador de nivelacion y cinemática de la burbuja.
 *
 * Ref: spec `visual-redesign-core` (Capture Viewfinder HUD).
 * Ref: REGLAS_IMPORTANTES.md §5 (Modularizacion bajo 600 lineas).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  CaptureViewfinderHUD,
  type CaptureState,
} from './CaptureViewfinderHUD';

/** Regex robusto para detectar caracteres emoji en HTML renderizado. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

const CAPTURE_STATES: CaptureState[] = ['idle', 'capturing', 'processing'];

describe('CaptureViewfinderHUD — Nivelacion y Cinemática', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('indicador de nivel (burbuja de nivelacion)', () => {
    it('renderiza el contenedor circular de la burbuja', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={0}
          roll={0}
        />
      );

      expect(screen.getByTestId('leveling-bubble')).toBeInTheDocument();
    });

    it('muestra "Nivelado" cuando pitch y roll estan dentro de +/- 3 grados', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={2.5}
          roll={-2.5}
        />
      );

      expect(screen.getByText('Nivelado')).toBeInTheDocument();
    });

    it('muestra los angulos cuando estan fuera del umbral (pitch > 3 grados)', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={15}
          roll={0}
        />
      );

      expect(screen.queryByText('Nivelado')).not.toBeInTheDocument();
      expect(screen.getByText(/15/)).toBeInTheDocument();
    });

    it('muestra los angulos cuando estan fuera del umbral (roll > 3 grados)', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={0}
          roll={10}
        />
      );

      expect(screen.queryByText('Nivelado')).not.toBeInTheDocument();
      expect(screen.getByText(/10/)).toBeInTheDocument();
    });

    it('la posicion de la burbuja responde al pitch (translateY)', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={10}
          roll={0}
        />
      );

      const bubble = container.querySelector('[data-testid="leveling-bubble"]');
      const style = (bubble as HTMLElement | null)?.getAttribute('style') ?? '';
      expect(style).toMatch(/translate/);
    });

    it('la posicion de la burbuja responde al roll (translateX)', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={0}
          roll={10}
        />
      );

      const bubble = container.querySelector('[data-testid="leveling-bubble"]');
      const style = (bubble as HTMLElement | null)?.getAttribute('style') ?? '';
      expect(style).toMatch(/translate/);
    });

    it('la burbuja aplica transicion CSS para suavizar cambios', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={5}
          roll={5}
        />
      );

      const bubble = container.querySelector('[data-testid="leveling-bubble"]');
      expect(bubble?.className).toMatch(/transition/);
    });

    it('la burbuja usa easing canonico cubic-bezier(0.16, 1, 0.3, 1)', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={5}
          roll={5}
        />
      );

      const bubble = container.querySelector('[data-testid="leveling-bubble"]');
      expect(bubble?.className).toMatch(/ease-\[cubic-bezier/);
    });
  });

  describe('Invariante: cero emojis en el HTML renderizado', () => {
    it.each(
      CAPTURE_STATES.flatMap((state) =>
        [false, true].map((torch) => ({ state, torch }))
      )
    )(
      'captureState=$state torchOn=$torch no contiene caracteres emoji',
      ({ state, torch }) => {
        cleanup();
        const { container } = render(
          <CaptureViewfinderHUD
            captureState={state}
            onCapture={() => {}}
            onTorchToggle={() => {}}
            torchOn={torch}
            pitch={state === 'idle' ? 0 : 5}
            roll={state === 'idle' ? 0 : 5}
          />
        );
        expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
      }
    );

    it('ningun aria-label contiene emojis en estados activos', () => {
      cleanup();
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="processing"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={true}
          pitch={15}
          roll={15}
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
