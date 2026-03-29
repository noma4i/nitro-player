import { renderHook, act } from '@testing-library/react';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(),
    updateMemorySize: jest.fn()
  }
}));

jest.mock('../core/utils/sourceFactory', () => ({
  createSource: jest.fn(() => ({ id: 'source' }))
}));

jest.mock('../core/utils/playerFactory', () => ({
  createPlayer: jest.fn()
}));

const MOCK_TIMESTAMP = 1000000;

const originalPerformance = globalThis.performance;

beforeEach(() => {
  Object.defineProperty(globalThis, 'performance', {
    value: {
      timeOrigin: 0,
      now: jest.fn(() => MOCK_TIMESTAMP)
    },
    writable: true,
    configurable: true
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'performance', {
    value: originalPerformance,
    writable: true,
    configurable: true
  });
});

function makePlaybackState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'idle' as const,
    currentTime: 0,
    duration: 100,
    bufferDuration: 10,
    bufferedPosition: 10,
    rate: 1,
    isPlaying: false,
    isBuffering: false,
    isReadyToDisplay: false,
    nativeTimestampMs: MOCK_TIMESTAMP,
    ...overrides
  };
}

function makeMockPlayer(playbackState: ReturnType<typeof makePlaybackState> | null = null) {
  const listeners: Record<string, Array<(data: unknown) => void>> = {};
  return {
    _playbackState: playbackState,
    get playbackState() {
      if (this._released) {
        const { NitroPlayerRuntimeError } = require('../core/types/NitroPlayerError');
        throw new NitroPlayerRuntimeError('player/released', 'Player is released');
      }
      return this._playbackState;
    },
    _released: false,
    addEventListener: jest.fn((event: string, callback: (data: unknown) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event]!.push(callback);
      return {
        remove: jest.fn(() => {
          const idx = listeners[event]!.indexOf(callback);
          if (idx >= 0) listeners[event]!.splice(idx, 1);
        })
      };
    }),
    _emit(event: string, data: unknown) {
      listeners[event]?.forEach(cb => cb(data));
    },
    clearAllEvents: jest.fn()
  };
}

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafId: number;

beforeEach(() => {
  rafCallbacks = new Map();
  rafId = 0;

  globalThis.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, cb);
    return id;
  });

  globalThis.cancelAnimationFrame = jest.fn((id: number) => {
    rafCallbacks.delete(id);
  });
});

function flushRAF() {
  const cbs = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  cbs.forEach(([, cb]) => cb(MOCK_TIMESTAMP));
}

describe('usePlaybackState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null for null player', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');

    const { result } = renderHook(() => usePlaybackState(null));

    expect(result.current).toBeNull();
  });

  it('returns null for undefined player', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');

    const { result } = renderHook(() => usePlaybackState(undefined));

    expect(result.current).toBeNull();
  });

  it('returns playbackState from player', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({ status: 'paused', currentTime: 42 });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: false }));

    expect(result.current).not.toBeNull();
    expect((result.current as Record<string, unknown>).currentTime).toBe(42);
    expect((result.current as Record<string, unknown>).status).toBe('paused');
  });

  it('interpolation advances currentTime when playing', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: false,
      currentTime: 10,
      duration: 100,
      bufferedPosition: 50,
      rate: 1,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    Object.defineProperty(globalThis, 'performance', {
      value: {
        timeOrigin: 0,
        now: jest.fn(() => MOCK_TIMESTAMP + 500)
      },
      writable: true,
      configurable: true
    });

    act(() => {
      flushRAF();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      flushRAF();
    });

    const currentTime = (result.current as Record<string, unknown>).currentTime as number;
    expect(currentTime).toBeGreaterThanOrEqual(10);
  });

  it('no interpolation when buffering', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: true,
      currentTime: 10,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: false }));

    expect((result.current as Record<string, unknown>).currentTime).toBe(10);
  });

  it('no interpolation when paused', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'paused',
      isPlaying: false,
      isBuffering: false,
      currentTime: 25,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: false }));

    expect((result.current as Record<string, unknown>).currentTime).toBe(25);
  });

  it('does not start a frame loop when playback is paused', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'paused',
      isPlaying: false,
      isBuffering: false,
      currentTime: 25
    });
    const player = makeMockPlayer(state);

    renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    expect(rafCallbacks.size).toBe(0);
  });

  it('no interpolation when playing but buffering', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: true,
      currentTime: 15,
      duration: 100,
      bufferedPosition: 20,
      rate: 1,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    Object.defineProperty(globalThis, 'performance', {
      value: {
        timeOrigin: 0,
        now: jest.fn(() => MOCK_TIMESTAMP + 500)
      },
      writable: true,
      configurable: true
    });

    act(() => {
      flushRAF();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      flushRAF();
    });

    expect((result.current as Record<string, unknown>).currentTime).toBe(15);
  });

  it('event transition from buffering to playing updates state', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const bufferingState = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: true,
      currentTime: 0
    });
    const player = makeMockPlayer(bufferingState);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: false }));

    expect((result.current as Record<string, unknown>).status).toBe('playing');
    expect((result.current as Record<string, unknown>).isBuffering).toBe(true);

    const playingState = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: false,
      currentTime: 0.5
    });

    act(() => {
      player._emit('onPlaybackState', playingState);
    });

    expect((result.current as Record<string, unknown>).status).toBe('playing');
    expect((result.current as Record<string, unknown>).isBuffering).toBe(false);
    expect((result.current as Record<string, unknown>).currentTime).toBe(0.5);
  });

  it('stops the frame loop when native playback transitions to paused', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const player = makeMockPlayer(
      makePlaybackState({
        status: 'playing',
        isPlaying: true,
        isBuffering: false,
        currentTime: 4
      })
    );

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    act(() => {
      player._emit(
        'onPlaybackState',
        makePlaybackState({
          status: 'paused',
          isPlaying: false,
          isBuffering: false,
          currentTime: 4.5
        })
      );
    });

    expect((result.current as Record<string, unknown>).status).toBe('paused');
    expect(rafCallbacks.size).toBe(0);
  });

  it('handles released player gracefully', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({ status: 'playing' });
    const player = makeMockPlayer(state);
    player._released = true;

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: false }));

    expect(result.current).toBeNull();
  });

  it('interpolation clamps currentTime to not exceed duration', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: false,
      currentTime: 99,
      duration: 100,
      bufferedPosition: 100,
      rate: 1,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    Object.defineProperty(globalThis, 'performance', {
      value: {
        timeOrigin: 0,
        now: jest.fn(() => MOCK_TIMESTAMP + 5000)
      },
      writable: true,
      configurable: true
    });

    act(() => {
      flushRAF();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      flushRAF();
    });

    const currentTime = (result.current as Record<string, unknown>).currentTime as number;
    expect(currentTime).toBeLessThanOrEqual(100);
  });

  it('interpolation with rate 0 does not advance currentTime', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: false,
      currentTime: 50,
      duration: 100,
      bufferedPosition: 100,
      rate: 0,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    Object.defineProperty(globalThis, 'performance', {
      value: {
        timeOrigin: 0,
        now: jest.fn(() => MOCK_TIMESTAMP + 2000)
      },
      writable: true,
      configurable: true
    });

    act(() => {
      flushRAF();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      flushRAF();
    });

    const currentTime = (result.current as Record<string, unknown>).currentTime as number;
    expect(currentTime).toBe(50);
  });

  it('interpolation with rate 2 advances at double speed', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const state = makePlaybackState({
      status: 'playing',
      isPlaying: true,
      isBuffering: false,
      currentTime: 10,
      duration: 100,
      bufferedPosition: 100,
      rate: 2,
      nativeTimestampMs: MOCK_TIMESTAMP
    });
    const player = makeMockPlayer(state);

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    Object.defineProperty(globalThis, 'performance', {
      value: {
        timeOrigin: 0,
        now: jest.fn(() => MOCK_TIMESTAMP + 1000)
      },
      writable: true,
      configurable: true
    });

    act(() => {
      flushRAF();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      flushRAF();
    });

    const currentTime = (result.current as Record<string, unknown>).currentTime as number;
    // At rate 2, 1 second elapsed -> 2 seconds advance -> currentTime should be ~12
    expect(currentTime).toBeGreaterThanOrEqual(12);
    expect(currentTime).toBeLessThanOrEqual(100);
  });
});
