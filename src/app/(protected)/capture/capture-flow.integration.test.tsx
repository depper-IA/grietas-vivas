/**
 * Integration Test: Capture → DualCaptureFlow → AI Analysis → Sync → Report
 *
 * Tests the full end-to-end flow of the capture page using the slice 4
 * DualCaptureFlow (4-step: captura dual, patron, senales, submit).
 *
 * Migration slice 4:
 *   - Analizar button ahora se llama "Clasificar y Analizar" y abre
 *     DualCaptureFlow en lugar de StructuralQuestionnaire.
 *   - DualCaptureFlow sustituye el flujo del cuestionario estructural
 *     con captura dual + patron + senales.
 *   - PostTriageActionGuide (R8/R9) se renderiza despues de la sincronizacion.
 *   - evaluateSafetyOverride garantiza pisos de seguridad (R4).
 *
 * Validates: Requirements 1.2, 2.5, 5.3, 6.4, 7.1, 8.4, R5-R9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

// Use vi.hoisted to define mock functions that vi.mock factories can reference
const { mockAnalyzeWithFallback, mockSyncCapture } = vi.hoisted(() => ({
  mockAnalyzeWithFallback: vi.fn(),
  mockSyncCapture: vi.fn(),
}));

// --- Mock modules (hoisted to top by vitest) ---

vi.mock('@/lib/capture/captureService', () => ({
  captureService: {
    capture: vi.fn().mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      imageBlob: new Blob(['fake-jpeg-data'], { type: 'image/jpeg' }),
      metadata: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: {
          local: '2024-01-15T10:30:00.000Z',
          server: '2024-01-15T10:30:01.000Z',
          verified: true,
        },
        gps: {
          latitude: 3.451647,
          longitude: -76.531985,
          accuracy: 12.5,
          available: true,
          reliable: true,
        },
        orientation: {
          alpha: 180,
          beta: 45,
          gamma: 0,
          available: true,
        },
        deviceInfo: {
          userAgent: 'test-agent',
          platform: 'test-platform',
        },
      },
      status: 'pending_sync',
      retryCount: 0,
      createdAt: '2024-01-15T10:30:00.000Z',
    }),
  },
}));

vi.mock('@/lib/exif/strip', () => ({
  stripExifData: vi.fn().mockImplementation(async (blob: Blob) => blob),
  ExifStripError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@/lib/crypto/byokEncryption', () => ({
  hasStoredKey: vi.fn().mockReturnValue(false),
  retrieveEncryptedKey: vi.fn().mockResolvedValue(null),
  storeEncryptedKey: vi.fn(),
  clearStoredKey: vi.fn(),
}));

vi.mock('@/lib/db/supabase', () => ({
  createBrowserSupabaseClient: vi.fn().mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
  }),
}));

vi.mock('@/app/actions/analysis', () => ({
  analyzeWithFallback: (...args: unknown[]) => mockAnalyzeWithFallback(...args),
}));

vi.mock('@/app/actions/sync', () => ({
  syncCapture: (...args: unknown[]) => mockSyncCapture(...args),
}));

vi.mock('@/hooks/useAIAnalysis', () => ({
  useAIAnalysis: () => ({
    analyze: vi.fn(),
    isAnalyzing: false,
    analysisState: 'idle',
    result: null,
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock('@/lib/connectivity/monitor', () => ({
  connectivityMonitor: {
    getState: vi.fn().mockReturnValue('online'),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('@/components/capture/CameraViewfinder', () => ({
  CameraViewfinder: ({ captureRequested, onCapture, onCaptureComplete }: {
    captureRequested: boolean;
    onCapture: (blob: Blob) => void;
    onCaptureComplete: () => void;
  }) => {
    if (captureRequested) {
      setTimeout(() => {
        onCapture(new Blob(['fake-jpeg'], { type: 'image/jpeg' }));
        onCaptureComplete();
      }, 0);
    }
    return <div data-testid="camera-viewfinder">Camera Viewfinder</div>;
  },
}));

vi.mock('@/components/capture/CapturePreview', () => ({
  CapturePreview: ({ onDismiss }: { imageUrl: string; metadata: unknown; onDismiss: () => void }) => (
    <div data-testid="capture-preview">
      <button onClick={onDismiss} data-testid="dismiss-preview">Dismiss</button>
    </div>
  ),
}));

vi.mock('@/components/capture/MetadataIndicators', () => ({
  MetadataIndicators: () => <div data-testid="metadata-indicators" />,
}));

vi.mock('@/components/capture/GpsWarningBanner', () => ({
  GpsWarningBanner: () => null,
}));

// Mock navigator.geolocation
Object.defineProperty(navigator, 'geolocation', {
  value: {
    watchPosition: vi.fn().mockReturnValue(1),
    clearWatch: vi.fn(),
  },
  writable: true,
});

// Mock URL methods
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-url');
global.URL.revokeObjectURL = vi.fn();

// Mock Blob.arrayBuffer since jsdom doesn't support it
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

// Now import the component under test
import CapturePage from './page';

/** Texto del boton de captura (sin emojis) que vive dentro del HUD. */
const HUD_CAPTURE_BUTTON = 'hud-capture-button';
/** Texto del boton de inicio del flujo de triaje (sin emojis). */
const ANALYZE_BUTTON_TEXT = 'Clasificar y Analizar';
/** Boton de captura dentro del DualCaptureHUD. */
const DUAL_HUD_CAPTURE_BUTTON = 'dual-hud-capture-button';
/** Texto del titulo de exito (sin emojis). */
const SUCCESS_TITLE = 'Ver Reporte Completo';
/** Texto del error de sincronizacion (sin emojis). */
const SYNC_ERROR_TITLE = 'Error al sincronizar';

/**
 * Simula la captura de una foto en el DualCaptureHUD.
 *
 * Antes (legacy): manipulaba el input file del HUD. Ahora el HUD usa
 * `CameraViewfinder` en vivo: el click en el boton de captura eleva el
 * flag `captureRequested` que el mock de CameraViewfinder observa para
 * auto-disparar `onCapture`. Solo esperamos al siguiente tick para que
 * el `setTimeout(0)` del mock se ejecute.
 */
async function simularCaptura(_fileName: string) {
  fireEvent.click(screen.getByTestId(DUAL_HUD_CAPTURE_BUTTON));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/**
 * Avanza el DualCaptureFlow desde el paso capture hasta el submit.
 * Captura ambas fotos, selecciona diagonal_shear, deja senales
 * default, y envia.
 */
async function completarDualCaptureFlow(pattern: string = 'diagonal_shear') {
  // Step 1: capturar detalle
  await simularCaptura('detail.jpg');
  await waitFor(() =>
    expect(screen.getByText(/Paso 2 de 2: Foto de Contexto/i)).toBeInTheDocument()
  );
  // Step 1 (cont.): capturar contexto
  await simularCaptura('context.jpg');
  // Step 2: seleccionar patron
  await waitFor(() => expect(screen.getByText('2 / 4')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId(`crack-pattern-${pattern}`));
  fireEvent.click(screen.getByTestId('dual-flow-continue'));
  // Step 3: dejar senales default, continuar
  await waitFor(() => expect(screen.getByText('3 / 4')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('dual-flow-continue'));
  // Step 4: submit
  await waitFor(() => expect(screen.getByText('4 / 4')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('dual-flow-submit'));
}

describe('Capture Page — Full E2E Flow (DualCaptureFlow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockAnalyzeWithFallback.mockResolvedValue({
      success: true,
      data: {
        riskLevel: 'high',
        description: 'Grieta diagonal de 3mm en columna de concreto. Requiere evaluación inmediata.',
        confidence: 0.87,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:30:05.000Z',
      },
    });

    mockSyncCapture.mockResolvedValue({
      success: true,
      reportId: 'report-abc-123',
      imageStoragePath: 'user-id/550e8400-e29b-41d4-a716-446655440000.jpg',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders camera viewfinder and HUD capture button initially', () => {
    render(<CapturePage />);

    expect(screen.getByTestId('camera-viewfinder')).toBeInTheDocument();
    expect(screen.getByTestId(HUD_CAPTURE_BUTTON)).toBeInTheDocument();
  });

  it('captures photo via HUD button and shows preview with classify button', async () => {
    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));

    await waitFor(() => {
      expect(screen.getByTestId('capture-preview')).toBeInTheDocument();
    });

    expect(screen.getByText(ANALYZE_BUTTON_TEXT)).toBeInTheDocument();
  });

  it('abre el DualCaptureFlow al pulsar "Clasificar y Analizar"', async () => {
    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());

    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));

    await waitFor(() => {
      // El DualCaptureFlow muestra "1 / 4" al inicio
      expect(screen.getByText('1 / 4')).toBeInTheDocument();
    });
  });

  it('completes full flow: photo → DualCaptureFlow → analysis → sync → PostTriageActionGuide', async () => {
    render(<CapturePage />);

    // 1. Capture photo via HUD
    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());

    // 2. Open DualCaptureFlow
    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());

    // 3. Avanzar el flow: fotos + patron + senales + submit
    await completarDualCaptureFlow('diagonal_shear');

    // 4. Wait for analysis to complete
    await waitFor(() => {
      expect(mockAnalyzeWithFallback).toHaveBeenCalledTimes(1);
    });

    // 5. Wait for sync to complete
    await waitFor(() => {
      expect(mockSyncCapture).toHaveBeenCalledTimes(1);
    });

    // 6. Verify link to full report (sin emojis en el texto visible)
    await waitFor(() => {
      expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    });

    const reportLink = screen.getByRole('link', { name: /Ver Reporte Completo/i });
    expect(reportLink).toBeInTheDocument();
    expect(reportLink).toHaveAttribute('href', '/reports/report-abc-123');
  });

  it('envia pattern, dangerSignals y contextImageBase64 al sync', async () => {
    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());

    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());

    // Activar una senal critica para verificar que se envia
    await simularCaptura('detail.jpg');
    await waitFor(() =>
      expect(screen.getByText(/Paso 2 de 2: Foto de Contexto/i)).toBeInTheDocument()
    );
    await simularCaptura('context.jpg');
    await waitFor(() => expect(screen.getByText('2 / 4')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('crack-pattern-spalling_corrosion'));
    fireEvent.click(screen.getByTestId('dual-flow-continue'));
    await waitFor(() => expect(screen.getByText('3 / 4')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
    fireEvent.click(screen.getByTestId('dual-flow-continue'));
    await waitFor(() => expect(screen.getByText('4 / 4')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dual-flow-submit'));

    await waitFor(() => expect(mockSyncCapture).toHaveBeenCalledTimes(1));

    const syncArgs = mockSyncCapture.mock.calls[0][0];
    expect(syncArgs.pattern).toBe('spalling_corrosion');
    expect(syncArgs.dangerSignals?.exposedRebarSpalling).toBe(true);
    expect(syncArgs.contextImageBase64).toBeDefined();
    expect(syncArgs.inspectionReportId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('evalua override de seguridad: senales criticas forzan evacuate_emergency', async () => {
    // Mock AI "low" pero el override debe elevar a evacuate_emergency
    mockAnalyzeWithFallback.mockResolvedValueOnce({
      success: true,
      data: {
        riskLevel: 'low',
        description: 'Grieta menor detectada.',
        confidence: 0.6,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:30:05.000Z',
      },
    });

    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());

    // Capturar + patron cosmetic + exposedRebarSpalling → override
    await simularCaptura('detail.jpg');
    await waitFor(() =>
      expect(screen.getByText(/Paso 2 de 2: Foto de Contexto/i)).toBeInTheDocument()
    );
    await simularCaptura('context.jpg');
    await waitFor(() => expect(screen.getByText('2 / 4')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('crack-pattern-hairline_cosmetic'));
    fireEvent.click(screen.getByTestId('dual-flow-continue'));
    await waitFor(() => expect(screen.getByText('3 / 4')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('danger-signal-exposedRebarSpalling'));
    fireEvent.click(screen.getByTestId('dual-flow-continue'));
    await waitFor(() => expect(screen.getByText('4 / 4')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dual-flow-submit'));

    // Debe renderizar el banner de Evacuacion Inmediata
    await waitFor(() => {
      expect(screen.getByText(/Evacuaci[oó]n Inmediata/i)).toBeInTheDocument();
    });
  });

  it('shows error state when analysis fails', async () => {
    mockAnalyzeWithFallback.mockResolvedValueOnce({
      success: false,
      error: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'No AI analysis providers are currently configured',
        },
      },
    });

    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());

    await completarDualCaptureFlow('diagonal_shear');

    // Should show error via captureError state
    await waitFor(() => {
      expect(screen.getByText('No AI analysis providers are currently configured')).toBeInTheDocument();
    });

    // Should NOT have synced
    expect(mockSyncCapture).not.toHaveBeenCalled();
  });

  it('shows sync error when sync fails', async () => {
    mockSyncCapture.mockResolvedValueOnce({
      success: false,
      error: {
        code: 'UPLOAD_FAILED',
        message: 'Failed to upload image. Please try again later.',
      },
    });

    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());

    await completarDualCaptureFlow('diagonal_shear');

    // Should show sync error (sin emojis)
    await waitFor(() => {
      expect(screen.getByText(SYNC_ERROR_TITLE)).toBeInTheDocument();
      expect(screen.getByText('Failed to upload image. Please try again later.')).toBeInTheDocument();
    });
  });

  it('allows new capture after successful report', async () => {
    render(<CapturePage />);

    fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
    await waitFor(() => expect(screen.getByTestId('capture-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());

    await completarDualCaptureFlow('diagonal_shear');

    // Wait for report
    await waitFor(() => expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument());

    // Click "Nueva Captura" (sin emojis, busqueda por regex)
    fireEvent.click(screen.getByText(/Nueva Captura/));

    // Should return to camera view
    await waitFor(() => {
      expect(screen.getByTestId('camera-viewfinder')).toBeInTheDocument();
      expect(screen.getByTestId(HUD_CAPTURE_BUTTON)).toBeInTheDocument();
    });
  });
});
