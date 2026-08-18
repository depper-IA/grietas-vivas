/**
 * Tests para DualCaptureFlow — Orquestador del flujo de captura dual +
 * cuestionario estructural + selector de patron + checklist de senales
 * (Spec R1-R7 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Multi-step flow visible con indicador de paso (1/5, 2/5, 3/5, 4/5, 5/5).
 *   - Step 1: muestra DualCaptureHUD para captura detalle + contexto.
 *   - Step 2: muestra StructuralQuestionnaire (4 preguntas sobre elemento, cruce, escala).
 *   - Step 3: muestra CrackPatternSelector (10 patrones). Bloqueado hasta seleccionar patron.
 *   - Step 4: muestra DangerSignalsChecklist (5 senales). "Continuar" disponible en cualquier momento.
 *   - Step 5: muestra resumen completo con miniaturas + boton "Confirmar y Analizar con IA"
 *     que invoca onComplete con { detailImageBlob, contextImageBlob, structuralContext, pattern, dangerSignals }.
 *   - Boton "Atras" permite navegar al paso previo.
 *   - Boton "Cancelar" invoca onCancel cuando se provee.
 *   - ARIA live announcements en cambios de paso.
 *   - Invariante: cero emojis en el HTML renderizado.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { DualCaptureFlow } from './DualCaptureFlow';
import type {
  CrackPattern,
  DangerSignals,
} from '@/lib/validation/crackTaxonomy';

// Mock de CameraViewfinder
vi.mock('@/components/capture/CameraViewfinder', () => ({
  CameraViewfinder: ({
    captureRequested,
    onCapture,
    onCaptureComplete,
  }: {
    captureRequested?: boolean;
    onCapture?: (blob: Blob) => void;
    onCaptureComplete?: () => void;
  }) => {
    if (captureRequested && onCapture) {
      setTimeout(() => {
        onCapture(new Blob(['mock-frame-bytes'], { type: 'image/jpeg' }));
        onCaptureComplete?.();
      }, 0);
    }
    return <div data-testid="camera-viewfinder" />;
  },
}));

/** Regex de emoji */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

const FAKE_BLOB_DETAIL = new Blob(['detail-bytes'], { type: 'image/jpeg' });
const FAKE_BLOB_CONTEXT = new Blob(['context-bytes'], { type: 'image/jpeg' });

const HUD_CAPTURE_BUTTON = 'dual-hud-capture-button';
const HUD_RETAKE_BUTTON = 'dual-hud-retake-step1';

async function simularCaptura(_blob: Blob, _fileName: string) {
  fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

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

    it('muestra indicador de paso "1 / 5" en el estado inicial', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
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

    it('capturar detalle avanza al step="context" del DualCaptureHUD', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      expect(
        screen.getByText(/Paso 2 de 2: Foto de Contexto/i)
      ).toBeInTheDocument();
    });

    it('capturar contexto avanza al step 2 del flow (cuestionario estructural)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
      expect(screen.getByText(/¿En qué elemento está la grieta\?/i)).toBeInTheDocument();
    });

    it('"Retomar foto 1" en contexto regresa a detail y permite re-capturar', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      fireEvent.click(screen.getByTestId(HUD_RETAKE_BUTTON));
      expect(
        screen.getByText(/Paso 1 de 2: Foto de Detalle/i)
      ).toBeInTheDocument();
    });

    it('NO permite avanzar al step 2 sin capturar ambas fotos o saltar contexto', () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });
  });

  describe('step 2: cuestionario estructural (StructuralQuestionnaire)', () => {
    async function avanzarACuestionario() {
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
    }

    it('muestra las preguntas del cuestionario en el step 2', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarACuestionario();
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
      expect(screen.getByText(/¿En qué elemento está la grieta\?/i)).toBeInTheDocument();
    });

    it('pulsar "Saltar todo" avanza al step 3 (selector de patrón)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarACuestionario();
      fireEvent.click(screen.getByText(/Saltar todo/i));
      expect(screen.getByText('3 / 5')).toBeInTheDocument();
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(10);
    });

    it('completar las 4 preguntas avanza al step 3 (selector de patrón)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarACuestionario();
      // P1: Elemento
      fireEvent.click(screen.getByText('Columna'));
      // P2: Cruza
      fireEvent.click(screen.getByText(/Sí, cruza completamente/i));
      // P3: Crecimiento
      fireEvent.click(screen.getByText(/Sí, es nueva o creció/i));
      // P4: Escala
      fireEvent.click(screen.getByText(/Sí, una moneda/i));

      expect(screen.getByText('3 / 5')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Patrón de la grieta/i })).toBeInTheDocument();
    });
  });

  describe('step 3: selector de patron (CrackPatternSelector)', () => {
    async function avanzarASelectorPatron() {
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByText(/Saltar todo/i));
    }

    it('muestra el CrackPatternSelector con 10 opciones', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarASelectorPatron();
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(10);
    });

    it('boton "Continuar" esta deshabilitado hasta seleccionar patron', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarASelectorPatron();
      const cont = screen.getByTestId('dual-flow-continue');
      expect(cont).toBeDisabled();
    });

    it('seleccionar patron habilita el boton "Continuar"', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarASelectorPatron();
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      const cont = screen.getByTestId('dual-flow-continue');
      expect(cont).not.toBeDisabled();
    });

    it('click en "Continuar" avanza al step 4 (checklist de señales)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarASelectorPatron();
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      expect(screen.getByText('4 / 5')).toBeInTheDocument();
    });

    it('boton "Atras" regresa al step 2 (cuestionario)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarASelectorPatron();
      fireEvent.click(screen.getByTestId('dual-flow-back'));
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });
  });

  describe('step 4: checklist de senales (DangerSignalsChecklist)', () => {
    async function avanzarAChecklist() {
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByText(/Saltar todo/i));
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
    }

    it('muestra el DangerSignalsChecklist con 5 toggles', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAChecklist();
      const toggles = screen.getAllByRole('checkbox');
      expect(toggles.length).toBe(5);
    });

    it('boton "Continuar" esta habilitado por defecto (signals opcionales)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAChecklist();
      const cont = screen.getByTestId('dual-flow-continue');
      expect(cont).not.toBeDisabled();
    });

    it('click en "Continuar" avanza al step 5 (resumen)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAChecklist();
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      expect(screen.getByText('5 / 5')).toBeInTheDocument();
    });

    it('mostrar critical banner al activar exposedRebarSpalling', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAChecklist();
      fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
      expect(
        screen.getByText(/Peligro Estructural Detectado/i)
      ).toBeInTheDocument();
    });

    it('boton "Atras" regresa al step 3 (selector de patron)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAChecklist();
      fireEvent.click(screen.getByTestId('dual-flow-back'));
      expect(screen.getByText('3 / 5')).toBeInTheDocument();
    });
  });

  describe('step 5: resumen y submit', () => {
    async function avanzarAResumen() {
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByText(/Saltar todo/i));
      fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
    }

    it('muestra el resumen del patron seleccionado', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAResumen();
      expect(screen.getByText(/Corte Diagonal/i)).toBeInTheDocument();
    });

    it('muestra el resumen del label espanol del patron', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAResumen();
      const summary = screen.getByTestId('dual-flow-summary');
      expect(summary.textContent).toMatch(/Corte Diagonal/i);
    });

    it('muestra contador de senales activas en el resumen', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByText(/Saltar todo/i));
      fireEvent.click(screen.getByTestId('crack-pattern-structural_beam_column'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      // Activar 2 senales
      fireEvent.click(screen.getByTestId('danger-signal-jammedDoorsWindows'));
      fireEvent.click(screen.getByTestId('danger-signal-tiltedElements'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      const summary = screen.getByTestId('dual-flow-summary');
      expect(summary.textContent).toMatch(/2 de 5|2 \/ 5/i);
    });

    it('boton "Confirmar y Analizar con IA" invoca onComplete con todos los datos', async () => {
      const onComplete = vi.fn();
      render(<DualCaptureFlow onComplete={onComplete} />);
      await avanzarAResumen();
      fireEvent.click(screen.getByTestId('dual-flow-submit'));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });

      const payload = onComplete.mock.calls[0][0];
      expect(payload.detailImageBlob).toBeInstanceOf(Blob);
      expect(payload.pattern).toBe('diagonal_shear');
      expect(payload.structuralContext).toBeDefined();
      expect(payload.dangerSignals).toBeDefined();
      expect(payload.dangerSignals.exposedRebarSpalling).toBe(false);
    });

    it('onComplete incluye todas las senales activas seleccionadas', async () => {
      const onComplete = vi.fn();
      render(<DualCaptureFlow onComplete={onComplete} />);
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByText(/Saltar todo/i));
      fireEvent.click(screen.getByTestId('crack-pattern-spalling_corrosion'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
      fireEvent.click(screen.getByTestId('danger-signal-throughWallXCracks'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('dual-flow-submit'));

      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      const payload = onComplete.mock.calls[0][0];
      expect(payload.pattern).toBe('spalling_corrosion');
      expect(payload.dangerSignals.exposedRebarSpalling).toBe(true);
      expect(payload.dangerSignals.throughWallXCracks).toBe(true);
    });

    it('boton "Atras" regresa al step 4 (checklist)', async () => {
      render(<DualCaptureFlow onComplete={() => {}} />);
      await avanzarAResumen();
      fireEvent.click(screen.getByTestId('dual-flow-back'));
      expect(screen.getByText('4 / 5')).toBeInTheDocument();
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
    it('HTML renderizado sin emojis incluso con senales criticas activas', async () => {
      const { container } = render(<DualCaptureFlow onComplete={() => {}} />);
      await simularCaptura(FAKE_BLOB_DETAIL, 'detail.jpg');
      await simularCaptura(FAKE_BLOB_CONTEXT, 'context.jpg');
      fireEvent.click(screen.getByText(/Saltar todo/i));
      fireEvent.click(screen.getByTestId('crack-pattern-spalling_corrosion'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
      fireEvent.click(screen.getByTestId('dual-flow-continue'));
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });
  });

  void makeObjectUrlStub;
});