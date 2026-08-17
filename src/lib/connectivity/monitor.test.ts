/**
 * Connectivity Monitor — Unit Tests
 *
 * Tests the Observer pattern, browser event handling,
 * and state management of the ConnectivityMonitor.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectivityMonitor } from './monitor';

describe('ConnectivityMonitor', () => {
  let monitor: ConnectivityMonitor;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    monitor = new ConnectivityMonitor();
  });

  afterEach(() => {
    monitor.destroy();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should reflect navigator.onLine as online', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      const m = new ConnectivityMonitor();
      expect(m.getState()).toBe('online');
    });

    it('should reflect navigator.onLine as offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const m = new ConnectivityMonitor();
      expect(m.getState()).toBe('offline');
    });
  });

  describe('init()', () => {
    it('should register online and offline event listeners', () => {
      monitor.init();
      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('should only register listeners once on multiple calls', () => {
      monitor.init();
      monitor.init();
      const onlineCalls = addEventListenerSpy.mock.calls.filter(
        ([event]) => event === 'online'
      );
      expect(onlineCalls).toHaveLength(1);
    });
  });

  describe('destroy()', () => {
    it('should remove event listeners and clear subscribers', () => {
      monitor.init();
      const callback = vi.fn();
      monitor.subscribe(callback);

      monitor.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('should allow re-initialization after destroy', () => {
      monitor.init();
      monitor.destroy();
      monitor.init();
      expect(addEventListenerSpy).toHaveBeenCalledTimes(4); // 2 from first init + 2 from second
    });
  });

  describe('subscribe()', () => {
    it('should notify subscriber on state change', () => {
      const callback = vi.fn();
      monitor.subscribe(callback);

      monitor.setState('offline');

      expect(callback).toHaveBeenCalledWith('offline');
    });

    it('should notify multiple subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      monitor.subscribe(cb1);
      monitor.subscribe(cb2);

      monitor.setState('offline');

      expect(cb1).toHaveBeenCalledWith('offline');
      expect(cb2).toHaveBeenCalledWith('offline');
    });

    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = monitor.subscribe(callback);

      unsubscribe();
      monitor.setState('offline');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not notify when state does not change', () => {
      const callback = vi.fn();
      monitor.subscribe(callback);

      // State is already 'online', setting it again should not notify
      monitor.setState('online');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle subscriber errors without breaking notification chain', () => {
      const errorCb = vi.fn(() => { throw new Error('subscriber error'); });
      const normalCb = vi.fn();
      monitor.subscribe(errorCb);
      monitor.subscribe(normalCb);

      monitor.setState('offline');

      expect(errorCb).toHaveBeenCalled();
      expect(normalCb).toHaveBeenCalledWith('offline');
    });
  });

  describe('setState()', () => {
    it('should update state to syncing', () => {
      monitor.setState('syncing');
      expect(monitor.getState()).toBe('syncing');
    });

    it('should update state to offline', () => {
      monitor.setState('offline');
      expect(monitor.getState()).toBe('offline');
    });

    it('should update state to online', () => {
      monitor.setState('offline');
      monitor.setState('online');
      expect(monitor.getState()).toBe('online');
    });
  });

  describe('browser events', () => {
    it('should transition to online on window online event', () => {
      monitor.init();
      monitor.setState('offline');

      window.dispatchEvent(new Event('online'));

      expect(monitor.getState()).toBe('online');
    });

    it('should transition to offline on window offline event', () => {
      monitor.init();

      window.dispatchEvent(new Event('offline'));

      expect(monitor.getState()).toBe('offline');
    });

    it('should not overwrite syncing state with online event', () => {
      monitor.init();
      monitor.setState('syncing');

      window.dispatchEvent(new Event('online'));

      expect(monitor.getState()).toBe('syncing');
    });

    it('should overwrite syncing state with offline event', () => {
      monitor.init();
      monitor.setState('syncing');

      window.dispatchEvent(new Event('offline'));

      expect(monitor.getState()).toBe('offline');
    });

    it('should notify subscribers on browser events', () => {
      monitor.init();
      const callback = vi.fn();
      monitor.subscribe(callback);

      window.dispatchEvent(new Event('offline'));

      expect(callback).toHaveBeenCalledWith('offline');
    });
  });

  describe('checkConnectivity()', () => {
    it('should return true when fetch succeeds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      const result = await monitor.checkConnectivity();

      expect(result).toBe(true);
    });

    it('should return false when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await monitor.checkConnectivity();

      expect(result).toBe(false);
    });

    it('should return false when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const result = await monitor.checkConnectivity();

      expect(result).toBe(false);
    });

    it('should update state to online when transitioning from offline', async () => {
      monitor.setState('offline');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      const callback = vi.fn();
      monitor.subscribe(callback);

      await monitor.checkConnectivity();

      expect(monitor.getState()).toBe('online');
      expect(callback).toHaveBeenCalledWith('online');
    });

    it('should update state to offline when transitioning from online', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const callback = vi.fn();
      monitor.subscribe(callback);

      await monitor.checkConnectivity();

      expect(monitor.getState()).toBe('offline');
      expect(callback).toHaveBeenCalledWith('offline');
    });

    it('should not change syncing state on fetch failure', async () => {
      monitor.setState('syncing');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

      await monitor.checkConnectivity();

      expect(monitor.getState()).toBe('syncing');
    });

    it('should use HEAD method with no-store cache', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await monitor.checkConnectivity();

      expect(mockFetch).toHaveBeenCalledWith('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      });
    });
  });
});
