import { useEffect, useRef, useState } from 'react';
import { VideoPlayer } from '../VideoPlayer';
import type { PlaybackState } from '../types/PlaybackState';
import { VideoRuntimeError } from '../types/VideoError';

type UsePlaybackStateOptions = {
  interpolate?: boolean;
  fps?: number;
};

const nowMs = () => Date.now();

const shouldInterpolate = (state: PlaybackState) => state.status === 'playing' && state.isPlaying && !state.isBuffering;

const interpolatePlaybackState = (state: PlaybackState, currentTimestampMs: number): PlaybackState => {
  if (!shouldInterpolate(state)) {
    return state;
  }

  const elapsedMs = Math.max(0, currentTimestampMs - state.nativeTimestampMs);
  const advancedTime = (elapsedMs / 1000) * state.rate;
  const nextCurrentTime = Math.min(state.duration, state.currentTime + advancedTime);

  return {
    ...state,
    currentTime: nextCurrentTime,
    bufferDuration: Math.max(0, state.bufferedPosition - nextCurrentTime)
  };
};

const getPlaybackStateSafe = (player: VideoPlayer | null | undefined) => {
  if (!player) {
    return null;
  }

  try {
    return player.playbackState;
  } catch (error) {
    if (error instanceof VideoRuntimeError && error.code === 'player/released') {
      return null;
    }

    throw error;
  }
};

export const usePlaybackState = (player: VideoPlayer | null | undefined, options: UsePlaybackStateOptions = {}) => {
  const { interpolate = true, fps = 30 } = options;
  const [state, setState] = useState<PlaybackState | null>(() => getPlaybackStateSafe(player));
  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!player) {
      latestStateRef.current = null;
      setState(null);
      return;
    }

    const initialState = getPlaybackStateSafe(player);
    latestStateRef.current = initialState;
    setState(initialState);

    if (initialState === null) {
      return;
    }

    const subscription = player.addEventListener('onPlaybackState', next => {
      latestStateRef.current = next;
      setState(next);
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  useEffect(() => {
    if (!interpolate || !player) {
      return;
    }

    let frameId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const frameDurationMs = Math.max(1, Math.round(1000 / fps));

    const tick = () => {
      const latest = latestStateRef.current;
      if (latest && shouldInterpolate(latest)) {
        setState(interpolatePlaybackState(latest, nowMs()));
      } else {
        setState(latest ?? null);
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

  return interpolate ? state : latestStateRef.current;
};
