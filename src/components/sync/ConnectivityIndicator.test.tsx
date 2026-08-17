/**
 * Tests para ConnectivityIndicator — indicador persistente del estado de red.
 *
 * Contrato:
 *   - 3 estados: 'online' (En línea), 'offline' (Sin conexión), 'syncing' (Sincronizando)
 *   - Iconos Lucide: Wifi, WifiOff, RefreshCw
 *   - ARIA: role="status", aria-live="polite", aria-atomic="true"
 *   - Accesibilidad: span sr-only con texto descriptivo en español
 *   - Invariante: cero emojis en el HTML renderizado (REGLAS §9)
 *   - Ciclo de vida: inicializa connectivityMonitor, se suscribe y desuscribe al desmontar
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ConnectivityIndicator } from './ConnectivityIndicator';
import type { ConnectivityState } from '@/lib/connectivity/types';

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

// Mock para el singleton connectivityMonitor
let currentState: ConnectivityState = 'online';
let subscribers: Array<(state: ConnectivityState) => void> = [];

const mockInit = vi.fn();
const mockGetState = vi.fn(() => currentState);
const mockSubscribe = vi.fn((callback: (state: ConnectivityState) => void) => {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter((cb) => cb !== callback);
  };
});

vi.mock('@/lib/connectivity/monitor', () => ({
  connectivityMonitor: {
    init: () => mockInit(),
    getState: () => mockGetState(),
    subscribe: (cb: (state: ConnectivityState) => void) => mockSubscribe(cb),
  },
}));

describe('ConnectivityIndicator', () => {
  beforeEach(() => {
    cleanup();
    currentState = 'online';
    subscribers = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('estado "online"', () => {
    it('renderiza etiqueta en español "En línea"', () => {
      currentState = 'online';
      render(<ConnectivityIndicator />);
      expect(screen.getByText('En línea')).toBeInTheDocument();
    });

    it('usa icono Wifi (lucide-wifi)', () => {
      currentState = 'online';
      const { container } = render(<ConnectivityIndicator />);
      const icon = container.querySelector('svg.lucide-wifi');
      expect(icon).not.toBeNull();
    });

    it('incluye texto descriptivo para lectores de pantalla', () => {
      currentState = 'online';
      render(<ConnectivityIndicator />);
      expect(
        screen.getByText('Estado de red: conectado a internet')
      ).toHaveClass('sr-only');
    });
  });

  describe('estado "offline"', () => {
    it('renderiza etiqueta en español "Sin conexión"', () => {
      currentState = 'offline';
      render(<ConnectivityIndicator />);
      expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    });

    it('usa icono WifiOff (lucide-wifi-off)', () => {
      currentState = 'offline';
      const { container } = render(<ConnectivityIndicator />);
      const icon = container.querySelector('svg.lucide-wifi-off');
      expect(icon).not.toBeNull();
    });

    it('incluye texto descriptivo para lectores de pantalla', () => {
      currentState = 'offline';
      render(<ConnectivityIndicator />);
      expect(
        screen.getByText('Estado de red: sin conexión (modo local offline)')
      ).toHaveClass('sr-only');
    });
  });

  describe('estado "syncing"', () => {
    it('renderiza etiqueta en español "Sincronizando"', () => {
      currentState = 'syncing';
      render(<ConnectivityIndicator />);
      expect(screen.getByText('Sincronizando')).toBeInTheDocument();
    });

    it('usa icono RefreshCw (lucide-refresh-cw)', () => {
      currentState = 'syncing';
      const { container } = render(<ConnectivityIndicator />);
      const icon = container.querySelector('svg.lucide-refresh-cw');
      expect(icon).not.toBeNull();
    });

    it('incluye texto descriptivo para lectores de pantalla', () => {
      currentState = 'syncing';
      render(<ConnectivityIndicator />);
      expect(
        screen.getByText('Estado de red: sincronizando datos con el servidor')
      ).toHaveClass('sr-only');
    });
  });

  describe('accesibilidad y ARIA', () => {
    it('expone role="status", aria-live="polite" y aria-atomic="true"', () => {
      render(<ConnectivityIndicator />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
      expect(statusEl).toHaveAttribute('aria-atomic', 'true');
    });
  });

  describe('invariante cero emojis', () => {
    const states: ConnectivityState[] = ['online', 'offline', 'syncing'];

    it.each(states)('estado "%s" no contiene emojis en el HTML renderizado', (st) => {
      currentState = st;
      const { container } = render(<ConnectivityIndicator />);
      expect(container.innerHTML).not.toMatch(EMOJI_REGEX);
    });
  });

  describe('ciclo de vida y suscripciones', () => {
    it('llama a init() y subscribe() al montarse', () => {
      render(<ConnectivityIndicator />);
      expect(mockInit).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });

    it('actualiza la UI reactivamente cuando cambia el estado del monitor', () => {
      currentState = 'online';
      render(<ConnectivityIndicator />);
      expect(screen.getByText('En línea')).toBeInTheDocument();

      act(() => {
        subscribers.forEach((cb) => cb('offline'));
      });
      expect(screen.getByText('Sin conexión')).toBeInTheDocument();

      act(() => {
        subscribers.forEach((cb) => cb('syncing'));
      });
      expect(screen.getByText('Sincronizando')).toBeInTheDocument();
    });

    it('desuscribe la escucha al desmontarse el componente', () => {
      const { unmount } = render(<ConnectivityIndicator />);
      expect(subscribers).toHaveLength(1);

      unmount();
      expect(subscribers).toHaveLength(0);
    });
  });
});
