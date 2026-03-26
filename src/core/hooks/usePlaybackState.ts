import { useEffect, useRef, useState } from 'react';
import { NitroPlayer } from '../NitroPlayer';
import type { PlaybackState } from '../types/PlaybackState';
import { NitroPlayerRuntimeError } from '../types/NitroPlayerError';

type UsePlaybackStateOptions = {
  interpolate?: boolean;
  fps?: number;
};

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number') {
    return performance.timeOrigin + performance.now();
  }
  return Date.now();
};

const shouldInterpolate = (state: PlaybackState) => state.status === 'playing' && state.isPlaying && !state.isBuffering;

const interpolatePlaybackState = (state: PlaybackState, currentTimestampMs: number): PlaybackState => {
  if (!shouldInterpolate(state)) {
    return state;
  }

  const elapsedMs = Math.max(0, currentTimestampMs - state.nativeTimestampMs);
  if (elapsedMs > 1000) {
    return state;
  }
  const advancedTime = (elapsedMs / 1000) * state.rate;
  const duration = Number.isFinite(state.duration) ? state.duration : Infinity;
  const nextCurrentTime = Math.min(duration, state.currentTime + advancedTime);

  return {
    ...state,
    currentTime: Number.isFinite(nextCurrentTime) ? nextCurrentTime : state.currentTime,
    bufferDuration: Math.max(0, state.bufferedPosition - nextCurrentTime)
  };
};

const getPlaybackStateSafe = (player: NitroPlayer | null | undefined) => {
  if (!player) {
    return null;
  }

  try {
    return player.playbackState;
  } catch (error) {
    if (error instanceof NitroPlayerRuntimeError && error.code === 'player/released') {
      return null;
    }

    throw error;
  }
};

export const usePlaybackState = (player: NitroPlayer | null | undefined, options: UsePlaybackStateOptions = {}) => {
  const { interpolate = true, fps = 60 } = options;
  const [state, setState] = useState<PlaybackState | null>(() => getPlaybackStateSafe(player));
  const nativeStateRef = useRef<PlaybackState | null>(state);
  const lastEmittedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!player) {
      nativeStateRef.current = null;
      lastEmittedTimeRef.current = 0;
      setState(null);
      return;
    }

    const initialState = getPlaybackStateSafe(player);
    nativeStateRef.current = initialState;
    lastEmittedTimeRef.current = initialState?.currentTime ?? 0;
    setState(initialState);

    if (initialState === null) {
      return;
    }

    const subscription = player.addEventListener('onPlaybackState', next => {
      nativeStateRef.current = next;
      lastEmittedTimeRef.current = next.currentTime;
      if (!interpolate) {
        setState(next);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player, interpolate]);

  useEffect(() => {
    if (!interpolate || !player) {
      return;
    }

    let frameId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const frameDurationMs = Math.max(1, Math.round(1000 / fps));

    const tick = () => {
      const native = nativeStateRef.current;
      if (native && shouldInterpolate(native)) {
        const interpolated = interpolatePlaybackState(native, nowMs());
        const monotonicTime = Math.max(lastEmittedTimeRef.current, interpolated.currentTime);
        if (monotonicTime - lastEmittedTimeRef.current >= 0.05) {
          lastEmittedTimeRef.current = monotonicTime;
          setState({ ...interpolated, currentTime: monotonicTime });
        }
      } else {
        if (native) {
          lastEmittedTimeRef.current = native.currentTime;
        }
        setState(native ?? null);
      }

      timeoutId = setTimeout(() => {
        frameId = requestAnimationFrame(tick);
      }, frameDurationMs);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      cancelAnimationFrame(frameId);
    };
  }, [fps, interpolate, player]);

  return state;
};
