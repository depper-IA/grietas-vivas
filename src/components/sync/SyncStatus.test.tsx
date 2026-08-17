/**
 * Tests para SyncStatus — invariante de cero emojis + iconos Lucide.
 *
 * Contrato:
 *   - No contiene emojis en HTML renderizado (REGLAS §9)
 *   - Iconos Lucide visibles por estado (Database, AlertTriangle, Upload)
 *   - aria-label en espanol para cada estado
 *
 * Ref: spec `visual-redesign-core` (No Emojis in UI).
 * Ref: REGLAS_IMPORTANTES.md §9.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SyncStatus } from './SyncStatus';

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

// Mocks estables para los hooks de polling/suscripcion
vi.mock('@/lib/connectivity/monitor', () => ({
  connectivityMonitor: {
    getState: vi.fn().mockReturnValue('online'),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('@/lib/sync/queue', () => ({
  getQueueStatusCounts: vi.fn(),
}));

import { getQueueStatusCounts } from '@/lib/sync/queue';

const mockGetQueueStatusCounts = getQueueStatusCounts as unknown as ReturnType<
  typeof vi.fn
>;

/**
 * Helper: renderiza el SyncStatus y espera a que el estado async del
 * useEffect se asiente. Asi los asserts no disparan warnings de act().
 */
async function renderSyncStatus() {
  const result = render(<SyncStatus />);
  // Esperar a que el estado se actualice al menos una vez.
  await waitFor(() => {
    expect(mockGetQueueStatusCounts).toHaveBeenCalled();
  });
  return result;
}

describe('SyncStatus', () => {
  beforeEach(() => {
    cleanup();
    mockGetQueueStatusCounts.mockReset();
    // Default: cola vacia (no renderiza nada)
    mockGetQueueStatusCounts.mockResolvedValue({
      pending: 0,
      syncing: 0,
      failed: 0,
      conflicts: 0,
      total: 0,
      isFull: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('invariante cero emojis', () => {
    it('no renderiza nada cuando la cola esta vacia y sana', async () => {
      const { container } = await renderSyncStatus();
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene emojis cuando hay items pendientes', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 3,
        syncing: 0,
        failed: 0,
        conflicts: 0,
        total: 3,
        isFull: false,
      });

      const { container } = await renderSyncStatus();
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene emojis cuando hay items fallidos', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 0,
        syncing: 0,
        failed: 2,
        conflicts: 0,
        total: 2,
        isFull: false,
      });

      const { container } = await renderSyncStatus();
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene emojis cuando hay almacenamiento lleno', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 0,
        syncing: 0,
        failed: 0,
        conflicts: 0,
        total: 0,
        isFull: true,
      });

      const { container } = await renderSyncStatus();
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });

    it('ningun aria-label contiene emojis en ningun estado', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 1,
        syncing: 1,
        failed: 1,
        conflicts: 1,
        total: 4,
        isFull: true,
      });

      const { container } = await renderSyncStatus();
      const elements = container.querySelectorAll('[aria-label]');
      elements.forEach((el) => {
        expect(el.getAttribute('aria-label') ?? '').not.toMatch(EMOJI_REGEX);
      });
    });
  });

  describe('iconos Lucide por estado', () => {
    it('usa Database (lucide-database) para almacenamiento lleno', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 0,
        syncing: 0,
        failed: 0,
        conflicts: 0,
        total: 0,
        isFull: true,
      });

      const { container } = await renderSyncStatus();
      expect(
        container.querySelector('svg.lucide-database')
      ).not.toBeNull();
    });

    it('usa AlertTriangle (lucide-triangle-alert) para items fallidos', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 0,
        syncing: 0,
        failed: 1,
        conflicts: 0,
        total: 1,
        isFull: false,
      });

      const { container } = await renderSyncStatus();
      expect(
        container.querySelector('svg.lucide-triangle-alert')
      ).not.toBeNull();
    });

    it('usa Upload (lucide-upload) para items pendientes', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 2,
        syncing: 0,
        failed: 0,
        conflicts: 0,
        total: 2,
        isFull: false,
      });

      const { container } = await renderSyncStatus();
      expect(container.querySelector('svg.lucide-upload')).not.toBeNull();
    });

    it('usa AlertTriangle (lucide-triangle-alert) para conflictos', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 0,
        syncing: 0,
        failed: 0,
        conflicts: 1,
        total: 1,
        isFull: false,
      });

      const { container } = await renderSyncStatus();
      expect(
        container.querySelector('svg.lucide-triangle-alert')
      ).not.toBeNull();
    });
  });

  describe('etiquetas en espanol', () => {
    it('almacenamiento lleno expone texto "Almacenamiento lleno"', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 0,
        syncing: 0,
        failed: 0,
        conflicts: 0,
        total: 0,
        isFull: true,
      });

      await renderSyncStatus();
      expect(
        screen.getByText('Almacenamiento lleno')
      ).toBeInTheDocument();
    });

    it('items pendientes expone contador formateado', async () => {
      mockGetQueueStatusCounts.mockResolvedValue({
        pending: 3,
        syncing: 0,
        failed: 0,
        conflicts: 0,
        total: 3,
        isFull: false,
      });

      await renderSyncStatus();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});
