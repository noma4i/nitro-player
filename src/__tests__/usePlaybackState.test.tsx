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
    isVisualReady: false,
    nativeTimestampMs: 1000000,
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
    }
  };
}

describe('usePlaybackState', () => {
  it('returns null for null player', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');

    const { result } = renderHook(() => usePlaybackState(null));

    expect(result.current).toBeNull();
  });

  it('returns current native playbackState from player', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const player = makeMockPlayer(makePlaybackState({ status: 'paused', currentTime: 42 }));

    const { result } = renderHook(() => usePlaybackState(player, { interpolate: true, fps: 60 }));

    expect(result.current).toEqual(expect.objectContaining({
      status: 'paused',
      currentTime: 42
    }));
  });

  it('updates state only from native playback events', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const player = makeMockPlayer(makePlaybackState({ status: 'idle', currentTime: 1 }));

    const { result } = renderHook(() => usePlaybackState(player));

    act(() => {
      player._emit('onPlaybackState', makePlaybackState({ status: 'playing', currentTime: 5 }));
    });

    expect(result.current).toEqual(expect.objectContaining({
      status: 'playing',
      currentTime: 5
    }));
  });

  it('returns null when player getter throws player/released', () => {
    const { usePlaybackState } = require('../core/hooks/usePlaybackState');
    const player = makeMockPlayer(makePlaybackState());
    player._released = true;

    const { result } = renderHook(() => usePlaybackState(player));

    expect(result.current).toBeNull();
  });
});
