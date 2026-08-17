/**
 * Tests para Report Detail Page — Slice 4 (seismic-triage-upgrade).
 *
 * Contrato:
 *   - Renderiza PostTriageActionGuide al inicio cuando hay pattern +
 *     dangerSignals + AI risk level disponibles (R8, R9).
 *   - Renderiza 4-tier banner con triage tokens semanticos.
 *   - Renderiza Llamar 123 en niveles unsafe/evacuate.
 *   - Renderiza patron de la grieta con diagrama SVG si PatternMetadata
 *     esta presente (R1, R2).
 *   - Renderiza lista de senales de peligro activas si dangerSignals
 *     esta presente (R3).
 *   - Renderiza dual foto (Detalle + Contexto) si contextImageStoragePath
 *     esta presente (R5, R6).
 *   - Mantiene retro-compatibilidad: reportes pre-slice-4 se renderizan
 *     sin PostTriageActionGuide, sin patron, sin senales, sin foto de
 *     contexto.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import ReportDetailPage from './page';

/** Regex de emoji equivalente al usado en otros tests del proyecto. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

/** Mock de la fila de la tabla 'reports' con datos del slice 4. */
const FULL_REPORT_ROW = {
  id: 'report-abc-123',
  risk_level: 'high',
  analysis_text: 'Grieta diagonal en columna de concreto.',
  analysis_confidence: 0.87,
  analysis_provider: 'openrouter',
  created_at: '2024-01-15T10:30:00.000Z',
  gps_latitude: 3.451647,
  gps_longitude: -76.531985,
  gps_accuracy: 12.5,
  gps_reliable: true,
  sensor_metadata: {
    orientation: { alpha: 180, beta: 45, gamma: 0, available: true },
    deviceInfo: { userAgent: 'test', platform: 'test' },
    pattern: 'diagonal_shear',
    dangerSignals: {
      jammedDoorsWindows: true,
      unleveledFloors: false,
      tiltedElements: false,
      exposedRebarSpalling: false,
      throughWallXCracks: false,
    },
    contextImageStoragePath: 'user-id/report-abc-123-context.jpg',
    inspectionReportId: 'user-id/report-abc-123',
  },
  server_timestamp: '2024-01-15T10:30:01.000Z',
  local_timestamp: '2024-01-15T10:30:00.000Z',
  timestamp_verified: true,
  image_storage_path: 'user-id/report-abc-123.jpg',
  pdf_storage_path: null,
  integrity_hash: null,
  status: 'analyzed',
};

/** Mock de la fila de la tabla 'reports' sin datos del slice 4 (legacy). */
const LEGACY_REPORT_ROW = {
  ...FULL_REPORT_ROW,
  sensor_metadata: {
    orientation: { alpha: 0, beta: 0, gamma: 0, available: false },
    deviceInfo: { userAgent: 'test', platform: 'test' },
  },
};

// Mock chainable Supabase client
const mockSignedUrlFactory = vi.fn((path: string) =>
  Promise.resolve({
    data: { signedUrl: `https://signed.example/${path}` },
  })
);

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'reports') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockRowData,
          error: null,
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }),
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: mockSignedUrlFactory,
    })),
  },
};

let mockRowData: typeof FULL_REPORT_ROW | typeof LEGACY_REPORT_ROW = FULL_REPORT_ROW;

vi.mock('@/lib/db/supabase', () => ({
  createBrowserSupabaseClient: () => mockSupabase,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'report-abc-123' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock generateReport action (no usado en render estatico)
vi.mock('@/app/actions/report', () => ({
  generateReport: vi.fn(),
}));

// Mock navigator
Object.defineProperty(global.navigator, 'onLine', {
  value: true,
  writable: true,
  configurable: true,
});

describe('Report Detail Page — Slice 4 integration', () => {
  beforeEach(() => {
    cleanup();
    mockRowData = FULL_REPORT_ROW;
    mockSignedUrlFactory.mockClear();
    mockSignedUrlFactory.mockImplementation((path: string) =>
      Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` } })
    );
  });

  afterEach(() => {
    cleanup();
  });

  describe('PostTriageActionGuide (R8, R9)', () => {
    it('renderiza el banner de triaje cuando hay pattern + dangerSignals', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Evacuaci[oó]n Inmediata/i)).toBeInTheDocument();
      });
    });

    it('NO renderiza PostTriageActionGuide en reportes legacy', async () => {
      mockRowData = LEGACY_REPORT_ROW;

      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Análisis')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Monitoreo Requerido/i)).toBeNull();
      expect(screen.queryByText(/Habitable/i)).toBeNull();
      expect(screen.queryByText(/Evacuaci[oó]n Inmediata/i)).toBeNull();
    });

    it('evalua override de seguridad: diagonal_shear + jammedDoorsWindows -> evacuate_emergency', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Evacuaci[oó]n Inmediata/i)).toBeInTheDocument();
      });
    });

    it('boton "Llamar 123" en nivel evacuate_emergency', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('emergency-call-button')).toBeInTheDocument();
      });
    });

    it('renderiza "Monitoreo Requerido" cuando NO hay override y AI risk es high', async () => {
      mockRowData = {
        ...FULL_REPORT_ROW,
        sensor_metadata: {
          ...FULL_REPORT_ROW.sensor_metadata,
          pattern: 'horizontal_flexural',
          dangerSignals: {
            jammedDoorsWindows: false,
            unleveledFloors: false,
            tiltedElements: false,
            exposedRebarSpalling: false,
            throughWallXCracks: false,
          },
        },
      };

      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Monitoreo Requerido/i)).toBeInTheDocument();
      });
    });
  });

  describe('Patron de la grieta (R1, R2)', () => {
    it('renderiza el patron con su titulo en espanol', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Corte Diagonal/i)).toBeInTheDocument();
      });
    });

    it('renderiza el diagrama SVG del patron', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByTestId('report-pattern-diagram-diagonal_shear')
        ).toBeInTheDocument();
      });
    });

    it('NO renderiza la seccion de patron en reportes legacy', async () => {
      mockRowData = LEGACY_REPORT_ROW;

      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Análisis')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('report-pattern-section')).toBeNull();
    });
  });

  describe('Senales de peligro (R3)', () => {
    it('renderiza la senal activa (jammedDoorsWindows)', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('report-signals-section')).toBeInTheDocument();
      });

      expect(screen.getByText(/Puertas o ventanas atascadas/i)).toBeInTheDocument();
    });

    it('NO renderiza la seccion si no hay senales activas', async () => {
      mockRowData = {
        ...FULL_REPORT_ROW,
        sensor_metadata: {
          ...FULL_REPORT_ROW.sensor_metadata,
          dangerSignals: {
            jammedDoorsWindows: false,
            unleveledFloors: false,
            tiltedElements: false,
            exposedRebarSpalling: false,
            throughWallXCracks: false,
          },
        },
      };

      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Análisis')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('report-signals-section')).toBeNull();
    });
  });

  describe('Dual foto (R5, R6)', () => {
    it('renderiza ambas fotos (Detalle + Contexto) en grid', async () => {
      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Foto de Detalle/i)).toBeInTheDocument();
        expect(screen.getByText(/Foto de Contexto/i)).toBeInTheDocument();
      });
    });

    it('NO renderiza la foto de contexto en reportes legacy', async () => {
      mockRowData = LEGACY_REPORT_ROW;

      render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Análisis')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Foto de Contexto/i)).toBeNull();
    });
  });

  describe('invariante: cero emojis', () => {
    it('HTML renderizado sin emojis en reporte con datos del slice 4', async () => {
      const { container } = render(<ReportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Análisis')).toBeInTheDocument();
      });

      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });
  });
});
