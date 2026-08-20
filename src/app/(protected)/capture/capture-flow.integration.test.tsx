/**
 * Integration Test: DualCaptureFlow (5 pasos) → AI Analysis → Sync → Report
 *
 * Flujo completo de triaje post-sismo:
 *   1. Captura dual: foto de detalle (Paso 1) + foto de contexto (Paso 2)
 *   2. Cuestionario estructural (elemento, cruce, escala)
 *   3. Selección de patrón de grieta (FEMA 306 / NSR-10)
 *   4. Checklist de señales de peligro
 *   5. Resumen, confirmación y análisis con IA + Sincronización
 *   6. Visualización de CaptureSuccessPanel (con guía de triaje 4-tier)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

// Mock de analyzeWithFallback
const mockAnalyzeWithFallback = vi.fn();
vi.mock('@/app/actions/analysis', () => ({
  analyzeWithFallback: (...args: unknown[]) => mockAnalyzeWithFallback(...args),
  analyze: vi.fn(),
}));

// Mock de syncCapture
const mockSyncCapture = vi.fn();
vi.mock('@/app/actions/sync', () => ({
  syncCapture: (...args: unknown[]) => mockSyncCapture(...args),
}));

// Mock del cliente Supabase
vi.mock('@/lib/db/supabase', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}));

// Mock de la IA key storage
vi.mock('@/lib/crypto/byokEncryption', () => ({
  hasStoredKey: () => false,
  retrieveEncryptedKey: () => Promise.resolve(null),
}));

function createMockBlob(): Blob {
  const buffer = new TextEncoder().encode('fake-jpeg').buffer;
  const blob = new Blob(['fake-jpeg'], { type: 'image/jpeg' });
  (blob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
    Promise.resolve(buffer);
  return blob;
}

// Mock de camera
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
        onCapture(createMockBlob());
        onCaptureComplete();
      }, 0);
    }
    return <div data-testid="camera-viewfinder" />;
  },
}));

// Mock de stripExifData
vi.mock('@/lib/exif/strip', () => ({
  stripExifData: vi.fn((blob: Blob) => Promise.resolve(blob)),
}));

// Mock de captureService
const mockCapture = vi.fn();
vi.mock('@/lib/capture/captureService', () => {
  return {
    captureService: {
      capture: (...args: unknown[]) => mockCapture(...args),
      getServerTimestamp: () =>
        Promise.resolve({ value: '2024-01-15T10:30:00.000Z', verified: true }),
      getCurrentPosition: () =>
        Promise.resolve({ available: false, reliable: false }),
      getDeviceOrientation: () =>
        Promise.resolve({
          available: false,
          alpha: null,
          beta: null,
          gamma: null,
        }),
    },
  };
});

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = vi.fn();
}

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

import CapturePage from './page';

const HUD_CAPTURE_BUTTON = 'dual-hud-capture-button';
const FLOW_SUBMIT_BUTTON = 'dual-flow-submit';
const SUCCESS_TITLE = 'Ver Reporte Completo';

async function simularCaptura() {
  fireEvent.click(screen.getByTestId(HUD_CAPTURE_BUTTON));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function completarFlujo5Pasos() {
  // Paso 1: Detalle + Contexto
  await simularCaptura();
  await simularCaptura();

  // Paso 2: Cuestionario
  fireEvent.click(screen.getByText(/Saltar todo/i));

  // Paso 3: Patrón
  fireEvent.click(screen.getByTestId('crack-pattern-diagonal_shear'));
  // `MotionButton` se carga con next/dynamic, así que en su primer montaje
  // renderiza el fallback (null) hasta que resuelve el chunk: hay que esperarlo
  // en vez de consultarlo de forma síncrona.
  fireEvent.click(await screen.findByTestId('dual-flow-continue'));

  // Paso 4: Señales de peligro
  fireEvent.click(await screen.findByTestId('dual-flow-continue'));

  // Paso 5: Confirmar y analizar
  fireEvent.click(screen.getByTestId(FLOW_SUBMIT_BUTTON));
}

describe('Capture Page — Flujo DualCaptureFlow guiado de 5 pasos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    mockCapture.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      imageBlob: createMockBlob(),
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
          'Patrón: Corte Diagonal\nUbicación: Columna\nSeveridad: Daño severo por cortante\nRecomendación: No habitar',
        confidence: 0.87,
        provider: 'nvidia-nim',
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

  it('renders DualCaptureFlow and HUD capture button initially', () => {
    render(<CapturePage />);

    expect(screen.getByTestId('camera-viewfinder')).toBeInTheDocument();
    expect(screen.getByTestId(HUD_CAPTURE_BUTTON)).toBeInTheDocument();
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
  });

  it('completa el flujo de 5 pasos y muestra el panel de éxito con guía de triaje', async () => {
    render(<CapturePage />);

    await completarFlujo5Pasos();

    await waitFor(() => {
      expect(mockAnalyzeWithFallback).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockSyncCapture).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    });

    const reportLink = screen.getByRole('link', { name: /Ver Reporte Completo/i });
    expect(reportLink).toBeInTheDocument();
    expect(reportLink).toHaveAttribute('href', '/reports/report-abc-123');
  });

  it('activa motor heurístico de emergencia cuando el análisis del servidor falla', async () => {
    mockAnalyzeWithFallback.mockResolvedValueOnce({
      success: false,
      error: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Servidor no disponible',
        },
      },
    });

    render(<CapturePage />);

    await completarFlujo5Pasos();

    // El motor heurístico offline se activa automáticamente y muestra el resultado de emergencia
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /Monitoreo Requerido|No Habitar|Evacuaci/i,
        })
      ).toBeInTheDocument();
    });
  });

  it('permite nueva captura después de reporte exitoso', async () => {
    render(<CapturePage />);

    await completarFlujo5Pasos();

    await waitFor(() => {
      expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    });

    const newCaptureBtn = await screen.findByRole('button', { name: /Nueva Captura/i });
    fireEvent.click(newCaptureBtn);

    await waitFor(() => {
      expect(screen.getByTestId(HUD_CAPTURE_BUTTON)).toBeInTheDocument();
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });
  });
});