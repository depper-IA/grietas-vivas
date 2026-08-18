/**
 * Integration Test: Capture → AI Analysis → Sync → Report
 *
 * Flujo simplificado (post-rebrand):
 *   1. Capturar foto (camara o upload)
 *   2. Click "Analizar con IA" → la IA determina patron, riesgo, senales
 *   3. Sync al backend
 *   4. Mostrar PostTriageActionGuide
 *
 * ANTES (legacy): patron + dangerSignals + contextImageBlob se capturaban
 * manualmente via DualCaptureFlow (4 pasos). Ahora la IA hace todo eso
 * desde una sola foto.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

// Mock de analyzeWithFallback — el analisis IA real
const mockAnalyzeWithFallback = vi.fn();
vi.mock('@/app/actions/analysis', () => ({
  analyzeWithFallback: (...args: unknown[]) => mockAnalyzeWithFallback(...args),
  analyze: vi.fn(),
}));

// Mock de syncCapture — la sincronizacion al backend
const mockSyncCapture = vi.fn();
vi.mock('@/app/actions/sync', () => ({
  syncCapture: (...args: unknown[]) => mockSyncCapture(...args),
}));

// Mock del cliente Supabase (para auth)
vi.mock('@/lib/db/supabase', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}));

// Mock de la IA key storage (sin BYOK en tests → cae a fallback)
vi.mock('@/lib/crypto/byokEncryption', () => ({
  hasStoredKey: () => false,
  retrieveEncryptedKey: () => Promise.resolve(null),
}));

// Mock de camera — auto-fira `onCapture` cuando recibe `captureRequested=true`
const mockCameraCapture = vi.fn();
vi.mock('@/components/capture/CameraViewfinder', () => ({
  CameraViewfinder: ({
    captureRequested,
    onCapture,
    onCaptureComplete,
  }: {
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
    return <div data-testid="camera-viewfinder" />;
  },
}));

// Mock de captureService — en tests no hay GPS/IndexedDB/device orientation.
// El imageBlob devuelto debe tener .arrayBuffer() — JSDOM no lo implementa
// en Blob, así que lo proveemos explícitamente.
const mockCapture = vi.fn();
vi.mock('@/lib/capture/captureService', () => {
  const fakeBlob = {
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode('fake-jpeg').buffer),
  };
  return {
    captureService: {
      capture: (...args: unknown[]) => mockCapture(...args),
      getServerTimestamp: () => Promise.resolve({ value: '2024-01-15T10:30:00.000Z', verified: true }),
      getCurrentPosition: () => Promise.resolve({ available: false, reliable: false }),
      getDeviceOrientation: () =>
        Promise.resolve({ available: false, alpha: null, beta: null, gamma: null }),
    },
  };
});

// Mock URL.createObjectURL / revokeObjectURL — JSDOM no los implementa
// y handleImageCaptured los llama para crear la preview URL.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = vi.fn();
}

// Mock de hooks para que el flujo sea determinista
vi.mock('@/hooks/useDeviceOrientation', () => ({
  useDeviceOrientation: () => ({ pitch: 0, roll: 0, supported: false }),
}));

vi.mock('@/hooks/useAIAnalysis', () => ({
  useAIAnalysis: () => ({
    analyze: vi.fn(),
    isAnalyzing: false,
    analysisState: 'idle',
    result: null,
    error: null,
  }),
}));

// Now import the component under test (despues de los mocks)
import CapturePage from './page';

const HUD_CAPTURE_BUTTON = 'hud-capture-button';
const ANALYZE_BUTTON_TEXT = 'Analizar con IA';
const SUCCESS_TITLE = 'Ver Reporte Completo';
const SYNC_ERROR_TITLE = 'Error al sincronizar';

/**
 * Simula la captura de una foto desde el HUD principal.
 * El HUD usa CameraViewfinder; el click en el boton de captura
 * eleva el flag `captureRequested` que el mock de CameraViewfinder observa.
 */
async function simularCaptura() {
  fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('Capture Page — Flujo simplificado (IA hace todo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCapture.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      imageBlob: {
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('fake-jpeg').buffer),
      } as unknown as Blob,
      metadata: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: { value: '2024-01-15T10:30:00.000Z', verified: true },
        gps: { available: false, reliable: false },
        orientation: { available: false, alpha: null, beta: null, gamma: null },
        deviceInfo: { userAgent: 'test', platform: 'test' },
      },
      status: 'pending_sync',
      retryCount: 0,
      createdAt: '2024-01-15T10:30:00.000Z',
    });

    mockAnalyzeWithFallback.mockResolvedValue({
      success: true,
      data: {
        riskLevel: 'high',
        description:
          'Grieta diagonal de 3mm en columna de concreto. Requiere evaluación inmediata.',
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

  it('captures photo and shows preview with "Analizar con IA" button', async () => {
    render(<CapturePage />);

    await simularCaptura();

    await waitFor(() => {
      expect(screen.getByLabelText('Vista previa de captura')).toBeInTheDocument();
    });

    expect(screen.getByText(ANALYZE_BUTTON_TEXT)).toBeInTheDocument();
  });

  it('dispara analisis IA directo al pulsar "Analizar con IA" (sin DualCaptureFlow)', async () => {
    render(<CapturePage />);

    await simularCaptura();
    await waitFor(() => expect(screen.getByLabelText('Vista previa de captura')).toBeInTheDocument());

    // Use act() para que React flush antes del click (evita closure stale)
    await act(async () => {
      fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    });

    // La IA se llama directamente, sin pasos intermedios de patron/senales
    await waitFor(() => {
      expect(mockAnalyzeWithFallback).toHaveBeenCalledTimes(1);
    });
  });

  it('completa full flow: foto → IA → sync → PostTriageActionGuide', async () => {
    render(<CapturePage />);

    // 1. Capturar foto
    await simularCaptura();
    await waitFor(() => expect(screen.getByLabelText('Vista previa de captura')).toBeInTheDocument());

    // 2. Analizar con IA (un solo click, sin pasos intermedios)
    await act(async () => {
      fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    });

    // 3. Esperar analisis
    await waitFor(() => {
      expect(mockAnalyzeWithFallback).toHaveBeenCalledTimes(1);
    });

    // 4. Esperar sync
    await waitFor(() => {
      expect(mockSyncCapture).toHaveBeenCalledTimes(1);
    });

    // 5. Verificar link al reporte completo
    await waitFor(() => {
      expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    });

    const reportLink = screen.getByRole('link', { name: /Ver Reporte Completo/i });
    expect(reportLink).toBeInTheDocument();
    expect(reportLink).toHaveAttribute('href', '/reports/report-abc-123');
  });

  it('muestra error cuando el analisis IA falla', async () => {
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

    await simularCaptura();
    await waitFor(() => expect(screen.getByLabelText('Vista previa de captura')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    });

    await waitFor(() => {
      expect(
        screen.getByText('No AI analysis providers are currently configured')
      ).toBeInTheDocument();
    });

    // NO debe sincronizar si el analisis falla
    expect(mockSyncCapture).not.toHaveBeenCalled();
  });

  it('muestra error cuando sync falla', async () => {
    mockSyncCapture.mockResolvedValueOnce({
      success: false,
      error: {
        code: 'UPLOAD_FAILED',
        message: 'Failed to upload image. Please try again later.',
      },
    });

    render(<CapturePage />);

    await simularCaptura();
    await waitFor(() => expect(screen.getByLabelText('Vista previa de captura')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    });

    await waitFor(() => {
      expect(screen.getByText(SYNC_ERROR_TITLE)).toBeInTheDocument();
      expect(
        screen.getByText('Failed to upload image. Please try again later.')
      ).toBeInTheDocument();
    });
  });

  it('permite nueva captura después de reporte exitoso', async () => {
    render(<CapturePage />);

    await simularCaptura();
    await waitFor(() => expect(screen.getByLabelText('Vista previa de captura')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText(ANALYZE_BUTTON_TEXT));
    });

    // Esperar AMBOS: el link de exito Y el boton "Nueva Captura"
    await waitFor(() => {
      expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    });
    await screen.findByText(/Nueva Captura/);

    // Click "Nueva Captura"
    fireEvent.click(screen.getByText(/Nueva Captura/));

    // Debe volver al viewfinder
    await waitFor(() => {
      expect(screen.getByTestId('camera-viewfinder')).toBeInTheDocument();
      expect(screen.getByTestId(HUD_CAPTURE_BUTTON)).toBeInTheDocument();
    });
  });
});