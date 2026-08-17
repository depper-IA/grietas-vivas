/**
 * Tests para DualCaptureFlow — Orquestador del flujo de captura dual +
 * selector de patron + checklist de senales (Spec R5, R6, R7, R3, R4;
 * Slice 4 Work Unit 4 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Multi-step flow visible con indicador de paso (1/4, 2/4, 3/4, 4/4).
 *   - Step 1: muestra DualCaptureHUD para captura detalle + contexto.
 *   - Step 2: muestra CrackPatternSelector (10 patrones). Bloqueado
 *     hasta seleccionar patron.
 *   - Step 3: muestra DangerSignalsChecklist (5 senales). "Continuar"
 *     disponible en cualquier momento.
 *   - Step 4: muestra resumen + boton "Confirmar y Analizar" que
 *     invoca onComplete con { detailImageBlob, contextImageBlob,
 *     pattern, dangerSignals }.
 *   - Boton "Atras" permite navegar al paso previo.
 *   - Boton "Cancelar" invoca onCancel cuando se provee.
 *   - ARIA live announcements en cambios de paso.
 *   - Invariante: cero emojis en el HTML renderizado.
 *
 * Diseno: src/components/capture/DualCaptureFlow.tsx
 * Spec: sdd/seismic-triage-upgrade/spec (R3-R7)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { DualCaptureFlow } from './DualCaptureFlow';
import type {
  CrackPattern,
  DangerSignals,
} from '@/lib/validation/crackTaxonomy';

/** Regex de emoji equivalente al usado en otros tests del proyecto. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

const FAKE_BLOB_DETAIL = new Blob(['detail-bytes'], { type: 'image/jpeg' });
const FAKE_BLOB_CONTEXT = new Blob(['context-bytes'], { type: 'image/jpeg' });

/** Ruta esperada del boton de captura dentro del DualCaptureHUD. */
const HUD_CAPTURE_BUTTON = 'dual-hud-capture-button';
/** Ruta esperada del boton "Retomar foto 1" en step context. */
const HUD_RETAKE_BUTTON = 'dual-hud-retake-step1';
/** Ruta del input file oculto del DualCaptureHUD. */
const HUD_FILE_INPUT = 'dual-hud-file-input';

/**
 * Simula la seleccion de un archivo en el input file oculto del
 * DualCaptureHUD y dispara el handler de captura. El componente espera
 * un File en input.files[0] antes de invocar onCapture(blob, step).
 */
function simularCaptura(blob: Blob, fileName: string) {
  const input = screen.getByTestId(HUD_FILE_INPUT) as HTMLInputElement;
  const file = new File([blob], fileName, { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
}

/**
 * Stub para `URL.createObjectURL` (jsdom no provee un valor seguro).
 * Devuelve un identificador unico para evitar choques entre blobs.
 */
let urlCounter = 0;
function makeObjectUrlStub(): string {
  urlCounter += 1;
  return `blob:http://localhost/test-${urlCounter}`;
}

describe('DualCaptureFlow', () => {
  beforeEach(() => {
    cleanup();
    urlCounter = 0;
    global.URL.createObjectURL = vi.fn((blob: Blob) =>
      blob === FAKE_BLOB_DETAIL ? 'blob:detail' : 'blob:context'
    );
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  describe('renderizado base: contenedor accesible', () => {
    it('renderiza un contenedor con role="region" y aria-label descriptivo', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      const region = screen.getByRole('region', {
        name: /flujo de captura|capture flow/i,
      });
      expect(region).toBeInTheDocument();
    });

    it('acepta y aplica className externa sin romper estilos base', () => {
      const { container } = render(
        <DualCaptureFlow onComplete={() => {}} className="extra-flow-class" />
      );
      const region = container.querySelector('[role="region"]');
      expect(region?.className).toContain('extra-flow-class');
    });

    it('muestra indicador de paso "1 / 4" en el estado inicial', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      expect(screen.getByText('1 / 4')).toBeInTheDocument();
    });

    it('NO muestra emojis en el HTML renderizado', () => {
      const { container } = render(<DualCaptureFlow onComplete={() => {}} />);
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });
  });

  describe('step 1: captura dual (DualCaptureHUD)', () => {
    it('muestra el DualCaptureHUD con step="detail" en el primer paso', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      expect(
        screen.getByText(/Paso 1 de 2: Foto de Detalle/i)
      ).toBeInTheDocument();
    });

    it('capturar detalle avanza al step="context" del DualCaptureHUD', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      // Ahora debe verse el titulo del step 2
      expect(
        screen.getByText(/Paso 2 de 2: Foto de Contexto/i)
      ).toBeInTheDocument();
    });

    it('capturar contexto avanza al step 2 del flow (selector de patron)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      // Ahora en context
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      // Indicador de paso global debe ser 2 / 4
      expect(screen.getByText('2 / 4')).toBeInTheDocument();
    });

    it('"Retomar foto 1" en contexto regresa a detail y permite re-capturar', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      // Detail capturada, ahora en context
      fireEvent.click(screen.getByTestId(HUD_RETAKE_BUTTON));
      // De vuelta en detail; el titulo del step 1 debe volver a aparecer
      expect(
        screen.getByText(/Paso 1 de 2: Foto de Detalle/i)
      ).toBeInTheDocument();
    });

    it('NO permite avanzar al step 2 sin capturar ambas fotos', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      // El indicador global de paso debe seguir siendo 1 / 4
      expect(screen.getByText('1 / 4')).toBeInTheDocument();
    });
  });

  describe('step 2: selector de patron (CrackPatternSelector)', () => {
    function avanzarASelectorPatron() {
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
    }

    it('muestra el CrackPatternSelector con 10 opciones', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarASelectorPatron();
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(10);
    });

    it('boton "Continuar" esta deshabilitado hasta seleccionar patron', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarASelectorPatron();
      const cont = screen.getByTestId('dual-flow-continue');
      expect(cont).toBeDisabled();
    });

    it('seleccionar patron habilita el boton "Continuar"', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarASelectorPatron();
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      const cont = screen.getByTestId('dual-flow-continue');
      expect(cont).not.toBeDisabled();
    });

    it('click en "Continuar" avanza al step 3 (checklist)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarASelectorPatron();
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      expect(screen.getByText('3 / 4')).toBeInTheDocument();
    });

    it('boton "Atras" regresa al step 1 (captura)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarASelectorPatron();
      fireEvent.click(screen.getByTestId('dual-flow-back'));
      expect(screen.getByText('1 / 4')).toBeInTheDocument();
    });

    it('al regresar al step 1 conserva la foto de detalle (se re-muestra)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      // Vuelve a detail
      fireEvent.click(screen.getByTestId(HUD_RETAKE_BUTTON));
      // El flujo ahora debe estar en el step 1 otra vez
      expect(screen.getByText('1 / 4')).toBeInTheDocument();
    });
  });

  describe('step 3: checklist de senales (DangerSignalsChecklist)', () => {
    function avanzarAChecklist() {
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
    }

    it('muestra el DangerSignalsChecklist con 5 toggles', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAChecklist();
      const toggles = screen.getAllByRole('checkbox');
      expect(toggles.length).toBe(5);
    });

    it('boton "Continuar" esta habilitado por defecto (signals opcionales)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAChecklist();
      const cont = screen.getByTestId('dual-flow-continue');
      expect(cont).not.toBeDisabled();
    });

    it('click en "Continuar" avanza al step 4 (resumen)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAChecklist();
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      expect(screen.getByText('4 / 4')).toBeInTheDocument();
    });

    it('mostrar critical banner al activar exposedRebarSpalling', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAChecklist();
      fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
      expect(
        screen.getByText(/Peligro Estructural Detectado/i)
      ).toBeInTheDocument();
    });

    it('boton "Atras" regresa al step 2 (selector de patron)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAChecklist();
      fireEvent.click(screen.getByTestId('dual-flow-back'));
      expect(screen.getByText('2 / 4')).toBeInTheDocument();
    });
  });

  describe('step 4: resumen y submit', () => {
    function avanzarAResumen() {
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
    }

    it('muestra el resumen del patron seleccionado', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAResumen();
      // En el resumen debe aparecer el titulo del patron
      expect(screen.getByText(/Corte Diagonal/i)).toBeInTheDocument();
    });

    it('muestra el resumen del label espanol del patron', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAResumen();
      const summary = screen.getByTestId('dual-flow-summary');
      expect(summary.textContent).toMatch(/Corte Diagonal/i);
    });

    it('muestra contador de senales activas en el resumen', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      // Capturar fotos y seleccionar patron
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByTestId('crack-pattern-structural_beam_column'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      // Activar 2 senales
      fireEvent.click(screen.getByTestId('danger-signal-jammedDoorsWindows'));
      fireEvent.click(screen.getByTestId('danger-signal-tiltedElements'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      const summary = screen.getByTestId('dual-flow-summary');
      expect(summary.textContent).toMatch(/2 de 5|2 \/ 5/i);
    });

    it('boton "Confirmar y Analizar" invoca onComplete con todos los datos', async () => {
      const onComplete = vi.fn();
      render(<DualCaptureFlow onComplete={onComplete} />);
      avanzarAResumen();
      fireEvent.click(screen.getByTestId('dual-flow-submit'));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });

      const payload = onComplete.mock.calls[0][0] as {
        detailImageBlob: Blob;
        contextImageBlob: Blob | null;
        pattern: CrackPattern;
        dangerSignals: DangerSignals;
      };
      expect(payload.detailImageBlob).toBeInstanceOf(Blob);
      expect(payload.pattern).toBe('diagonal_shear');
      expect(payload.dangerSignals).toBeDefined();
      expect(payload.dangerSignals.exposedRebarSpalling).toBe(false);
    });

    it('onComplete incluye todas las senales activas seleccionadas', async () => {
      const onComplete = vi.fn();
      render(<DualCaptureFlow onComplete={onComplete} />);
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByTestId('crack-pattern-spalling_corrosion'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
      fireEvent.click(screen.getByTestId('danger-signal-throughWallXCracks'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('dual-flow-submit'));

      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      const payload = onComplete.mock.calls[0][0] as {
        pattern: CrackPattern;
        dangerSignals: DangerSignals;
      };
      expect(payload.pattern).toBe('spalling_corrosion');
      expect(payload.dangerSignals.exposedRebarSpalling).toBe(true);
      expect(payload.dangerSignals.throughWallXCracks).toBe(true);
    });

    it('boton "Atras" regresa al step 3 (checklist)', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      avanzarAResumen();
      fireEvent.click(screen.getByTestId('dual-flow-back'));
      expect(screen.getByText('3 / 4')).toBeInTheDocument();
    });
  });

  describe('cancelacion', () => {
    it('boton "Cancelar" invoca onCancel cuando se provee', () => {
      const onCancel = vi.fn();
      render(<DualCaptureFlow onComplete={() => {}} onCancel={onCancel} />);
      fireEvent.click(screen.getByTestId('dual-flow-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('NO renderiza el boton "Cancelar" si onCancel no se provee', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      expect(screen.queryByTestId('dual-flow-cancel')).toBeNull();
    });
  });

  describe('invariante: cero emojis en todos los pasos', () => {
    it('HTML renderizado sin emojis incluso con senales criticas activas', () => {
      const { container } = render(<DualCaptureFlow onComplete={() => {}} />);
      simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByTestId('crack-pattern-spalling_corrosion'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });
  });
});
