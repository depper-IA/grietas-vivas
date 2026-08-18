/**
 * Tests para DualCaptureHUD — Vista guiada de captura dual de fotos
 * (Spec R5, R6, R7; Slice 3 Work Unit 3 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Step 1 (`detail`): cuadro de referencia de escala superpuesto a
 *     la camara en vivo, con texto "Coloca una moneda o tarjeta al
 *     lado de la grieta", indicador "Paso 1 de 2: Foto de Detalle
 *     (30-50 cm)".
 *   - Step 2 (`context`): cuadro de encuadre amplio superpuesto a la
 *     camara, indicador "Paso 2 de 2: Foto de Contexto (a 2 metros)",
 *     guia para enmarcar columnas y vigas del entorno.
 *   - Thumbnail preview del step 1 cuando estamos en step 2.
 *   - Boton de captura invoca `onCapture(photoBlob, step)` tras
 *     disparar el snapshot de la `CameraViewfinder` en vivo.
 *   - Boton "Retomar foto 1" permite repetir el step 1.
 *   - ARIA live announcements en cambios de paso (`aria-live="polite"`).
 *   - Tap targets >= 44px.
 *   - Invariante: cero emojis en el HTML renderizado.
 *
 * Diseno: src/components/capture/DualCaptureHUD.tsx
 * Spec: sdd/seismic-triage-upgrade/spec (R5 detail, R6 context, R7 inspectionReportId)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { DualCaptureHUD } from './DualCaptureHUD';

// Mock de CameraViewfinder — el comportamiento real no es relevante para
// este componente. Lo que queremos validar aqui es que DualCaptureHUD
// dispara correctamente el trigger de captura y propaga el blob a su
// caller via `onCapture(blob, step)`. El mock auto-fira `onCapture`
// cuando `captureRequested` pasa a true (mismo patron que usa el
// integration test del capture page).
vi.mock('@/components/capture/CameraViewfinder', () => ({
  CameraViewfinder: ({
    captureRequested,
    onCapture,
    onCaptureComplete,
    onError,
  }: {
    captureRequested?: boolean;
    onCapture?: (blob: Blob) => void;
    onCaptureComplete?: () => void;
    onError?: (msg: string | null) => void;
  }) => {
    if (captureRequested && onCapture) {
      setTimeout(() => {
        // act() envuelve el side-effect async para que React no emita
        // warnings de "update not wrapped in act(...)" durante los tests.
        Promise.resolve().then(() => {
          onCapture(new Blob(['fake-frame-bytes'], { type: 'image/jpeg' }));
          onCaptureComplete?.();
        });
      }, 0);
    }
    return (
      <div data-testid="camera-viewfinder">
        <button
          type="button"
          aria-label="Mock camera error"
          onClick={() => onError?.('mock-error')}
        />
      </div>
    );
  },
}));

/** Regex de emoji equivalente al usado en otros tests del proyecto. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

/** Blob arbitrario para representar la foto capturada por el mock. */
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

  describe('camara en vivo: renderiza CameraViewfinder', () => {
    it('renderiza el container de camara y la CameraViewfinder en step 1', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(
        container.querySelector('[data-testid="dual-hud-camera"]')
      ).not.toBeNull();
      expect(screen.getByTestId('camera-viewfinder')).toBeInTheDocument();
    });

    it('renderiza la CameraViewfinder tambien en step 2 (no la desmonta al avanzar)', () => {
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(screen.getByTestId('camera-viewfinder')).toBeInTheDocument();
    });
  });

  describe('captura: boton de captura invoca onCapture(blob, step)', () => {
    it('click en el boton de captura en step 1 invoca onCapture(blob, "detail")', async () => {
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

      // El mock dispara onCapture asincronicamente via setTimeout(..., 0).
      // `act()` espera a que React procese las actualizaciones resultantes.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(onCapture).toHaveBeenCalledTimes(1);
      const [blobArg, stepArg] = onCapture.mock.calls[0];
      expect(stepArg).toBe('detail');
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it('click en el boton de captura en step 2 invoca onCapture(blob, "context")', async () => {
      const onCapture = vi.fn();
      render(
        <DualCaptureHUD
          step="context"
          detailPreviewUrl="blob:test-detail"
          onCapture={onCapture}
          onRetakeStep1={() => {}}
        />
      );

      const btn = screen.getByTestId('dual-hud-capture-button');
      fireEvent.click(btn);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(onCapture).toHaveBeenCalledTimes(1);
      const [blobArg, stepArg] = onCapture.mock.calls[0];
      expect(stepArg).toBe('context');
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it('incluye boton de carga de galeria e input de archivo accesible', () => {
      const { container } = render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      expect(screen.getByTestId('dual-hud-upload-button')).toBeInTheDocument();
      expect(container.querySelector('input[type="file"]')).not.toBeNull();
    });

    it('deshabilita el boton mientras la captura esta en curso', async () => {
      const onCapture = vi.fn();
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={onCapture}
          onRetakeStep1={() => {}}
        />
      );
      const btn = screen.getByTestId('dual-hud-capture-button') as HTMLButtonElement;
      fireEvent.click(btn);
      // Inmediatamente despues del click (antes del setTimeout del mock)
      // el boton debe estar disabled para evitar dobles disparos.
      expect(btn).toBeDisabled();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      // Tras completarse la captura, el boton vuelve a habilitarse
      expect(btn).not.toBeDisabled();
    });
  });

  describe('manejo de errores de camara', () => {
    it('muestra mensaje de error cuando la camara falla', () => {
      render(
        <DualCaptureHUD
          step="detail"
          onCapture={() => {}}
          onRetakeStep1={() => {}}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /mock camera error/i }));
      expect(
        screen.getByRole('alert')
      ).toHaveTextContent(/mock-error/);
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

  // Conserva referencias para que los bundlers no marquen como unused
  // los blobs de "antes" — utiles al migrar tests adicionales.
  void FAKE_BLOB_DETAIL;
  void FAKE_BLOB_CONTEXT;
});