/**
 * Tests para DualCaptureHUD — Vista guiada de captura dual de fotos
 * (Spec R5, R6, R7; Slice 3 Work Unit 3 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Step 1 (`detail`): cuadro de referencia de escala con texto
 *     "Coloca una moneda o tarjeta al lado de la grieta", indicador
 *     "Paso 1 de 2: Foto de Detalle (30–50 cm)", guia visual de
 *     encuadre cercano.
 *   - Step 2 (`context`): cuadro de encuadre amplio, indicador
 *     "Paso 2 de 2: Foto de Contexto (a 2 metros)", guia para enmarcar
 *     columnas y vigas del entorno.
 *   - Thumbnail preview del step 1 cuando estamos en step 2.
 *   - Boton de captura invoca `onCapture(photoBlob, step)`.
 *   - Boton "Retomar foto 1" permite repetir el step 1.
 *   - ARIA live announcements en cambios de paso (`aria-live="polite"`).
 *   - Tap targets >= 44px.
 *   - Invariante: cero emojis en el HTML renderizado.
 *
 * Diseno: src/components/capture/DualCaptureHUD.tsx
 * Spec: sdd/seismic-triage-upgrade/spec (R5 detail, R6 context, R7 inspectionReportId)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DualCaptureHUD } from './DualCaptureHUD';

/** Regex de emoji equivalente al usado en otros tests del proyecto. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

/** Blob arbitrario para representar la foto capturada. */
const FAKE_BLOB_DETAIL = new Blob(['detail-bytes'], { type: 'image/jpeg' });
const FAKE_BLOB_CONTEXT = new Blob(['context-bytes'], { type: 'image/jpeg' });

describe('DualCaptureHUD', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('renderizado base: contenedor accesible', () => {
    it('renderiza un contenedor con role="region" y aria-label descriptivo', () => {
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const region = screen.getByRole('region', { name: /captura dual|dual capture/i });
      expect(region).toBeInTheDocument();
    });

    it('acepta y aplica className externa sin romper estilos base', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
          className="extra-test-class"
        />
      );
      const region = container.querySelector('[role="region"]');
      expect(region?.className).toContain('extra-test-class');
    });
  });

  describe('step 1: Foto de Detalle (30-50 cm)', () => {
    it('renderiza el indicador "Paso 1 de 2: Foto de Detalle (30-50 cm)"', () => {
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(
        screen.getByText(/Paso 1 de 2: Foto de Detalle/i)
      ).toBeInTheDocument();
    });

    it('renderiza la guia "Coloca una moneda o tarjeta al lado de la grieta"', () => {
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const matches = screen.getAllByText(/moneda|tarjeta/i);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('renderiza el cuadro de encuadre cercano con marcador de escala', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      // Marcador de escala: input + indicador
      const scaleBox = container.querySelector('[data-testid="dual-hud-scale-box"]');
      expect(scaleBox).not.toBeNull();
    });

    it('NO renderiza el thumbnail del step 1 en step 1', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const thumb = container.querySelector('[data-testid="dual-hud-step1-thumbnail"]');
      expect(thumb).toBeNull();
    });

    it('NO renderiza el boton "Retomar foto 1" en step 1', () => {
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /retomar foto 1/i })).toBeNull();
    });
  });

  describe('step 2: Foto de Contexto (a 2 metros)', () => {
    it('renderiza el indicador "Paso 2 de 2: Foto de Contexto (a 2 metros)"', () => {
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl={null}
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(
        screen.getByText(/Paso 2 de 2: Foto de Contexto/i)
      ).toBeInTheDocument();
    });

    it('renderiza la guia para encuadrar columnas y vigas del entorno', () => {
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl={null}
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const matches = screen.getAllByText(/column|viga|entorno/i);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('renderiza el cuadro de encuadre amplio con marcadores de contexto', () => {
      const { container } = render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl={null}
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const frameBox = container.querySelector('[data-testid="dual-hud-context-frame"]');
      expect(frameBox).not.toBeNull();
    });

    it('renderiza el thumbnail del step 1 cuando detailPreviewUrl esta presente', () => {
      const { container } = render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const thumb = container.querySelector('[data-testid="dual-hud-step1-thumbnail"]');
      expect(thumb).not.toBeNull();
      const img = thumb?.querySelector('img');
      expect(img?.getAttribute('src')).toBe('blob:test-detail');
    });

    it('NO renderiza thumbnail si detailPreviewUrl es null', () => {
      const { container } = render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl={null}
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const thumb = container.querySelector('[data-testid="dual-hud-step1-thumbnail"]');
      expect(thumb).toBeNull();
    });

    it('renderiza el boton "Retomar foto 1" en step 2', () => {
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(
        screen.getByRole('button', { name: /retomar foto 1/i })
      ).toBeInTheDocument();
    });

    it('click en "Retomar foto 1" invoca onRetakeStep1', () => {
      const onRetake = vi.fn();
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={onRetake}
        />
      );
      const btn = screen.getByRole('button', { name: /retomar foto 1/i });
      fireEvent.click(btn);
      expect(onRetake).toHaveBeenCalledTimes(1);
    });
  });

  describe('captura: boton de captura invoca onCapture(blob, step)', () => {
    it('click en el boton de captura en step 1 invoca onCapture(blob, "detail")', () => {
      const onCapture = vi.fn();
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={onCapture}
          onRetakeStep1={() => {}}
        />
      );
      const btn = screen.getByTestId('dual-hud-capture-button');
      // El blob debe venir de un input[type=file] simulado via el input del HUD
      // pero el componente expone un input file que setea el blob via onChange.
      const fileInput = screen.getByTestId('dual-hud-file-input') as HTMLInputElement;
      // Simular carga
      const file = new File([FAKE_BLOB_DETAIL], 'detail.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInput, 'files', { value: [file] });
      fireEvent.change(fileInput);

      fireEvent.click(btn);
      expect(onCapture).toHaveBeenCalledTimes(1);
      const [blobArg, stepArg] = onCapture.mock.calls[0];
      expect(stepArg).toBe('detail');
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it('click en el boton de captura en step 2 invoca onCapture(blob, "context")', () => {
      const onCapture = vi.fn();
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={onCapture}
          onRetakeStep1={() => {}}
        />
      );
      const fileInput = screen.getByTestId('dual-hud-file-input') as HTMLInputElement;
      const file = new File([FAKE_BLOB_CONTEXT], 'context.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInput, 'files', { value: [file] });
      fireEvent.change(fileInput);

      const btn = screen.getByTestId('dual-hud-capture-button');
      fireEvent.click(btn);
      expect(onCapture).toHaveBeenCalledTimes(1);
      const [blobArg, stepArg] = onCapture.mock.calls[0];
      expect(stepArg).toBe('context');
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it('click sin archivo seleccionado no invoca onCapture', () => {
      const onCapture = vi.fn();
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={onCapture}
          onRetakeStep1={() => {}}
        />
      );
      const btn = screen.getByTestId('dual-hud-capture-button');
      fireEvent.click(btn);
      expect(onCapture).not.toHaveBeenCalled();
    });

    it('el input file acepta solo image/* y captura del entorno', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const fileInput = container.querySelector(
        '[data-testid="dual-hud-file-input"]'
      ) as HTMLInputElement;
      expect(fileInput.getAttribute('accept')).toMatch(/image/);
      expect(fileInput.getAttribute('capture')).toBe('environment');
    });
  });

  describe('accesibilidad: ARIA live announcements en cambios de paso', () => {
    it('renderiza un announcer con aria-live="polite" para cambios de paso', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const announcer = container.querySelector('[aria-live="polite"]');
      expect(announcer).not.toBeNull();
    });

    it('announcer refleja el paso actual (step="detail")', () => {
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const announcer = screen.getByTestId('dual-hud-step-announcer');
      expect(announcer).toHaveAttribute('aria-live', 'polite');
      expect(announcer.textContent).toMatch(/detalle/i);
    });

    it('announcer refleja el paso actual (step="context")', () => {
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const announcer = screen.getByTestId('dual-hud-step-announcer');
      expect(announcer.textContent).toMatch(/contexto/i);
    });
  });

  describe('tap targets y ergonomia', () => {
    it('boton de captura tiene altura >= 44px (mobile tap target)', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const btn = container.querySelector(
        '[data-testid="dual-hud-capture-button"]'
      ) as HTMLElement;
      const classes = btn.className;
      // min-h-[56px] o equivalente >= 44px
      expect(classes).toMatch(/min-h-\[(44|48|52|56|60|64|72|80)px\]/);
    });

    it('boton "Retomar foto 1" tiene altura >= 44px', () => {
      const { container } = render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const btn = container.querySelector(
        '[data-testid="dual-hud-retake-step1"]'
      ) as HTMLElement;
      const classes = btn.className;
      expect(classes).toMatch(/min-h-\[(44|48|52|56|60|64|72|80)px\]/);
    });
  });

  describe('invariante: cero emojis en HTML renderizado', () => {
    it('NO contiene emojis en el render de step=detail', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const html = container.innerHTML;
      expect(html).not.toMatch(EMOJI_REGEX);
    });

    it('NO contiene emojis en el render de step=context con preview', () => {
      const { container } = render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const html = container.innerHTML;
      expect(html).not.toMatch(EMOJI_REGEX);
    });

    it('usa exclusivamente iconos Lucide (svg con clase lucide-*)', () => {
      const { container } = render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      const lucideIcons = container.querySelectorAll('svg[class*="lucide-"]');
      expect(lucideIcons.length).toBeGreaterThan(0);
    });
  });

  describe('progresion visual entre pasos', () => {
    it('muestra indicador de progreso (1/2 vs 2/2)', () => {
      const { rerender } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      rerender(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });
  });
});