import { useEffect, useRef, useState } from 'react';
import { VideoPlayer } from '../VideoPlayer';
import type { PlaybackState } from '../types/PlaybackState';

type UsePlaybackStateOptions = {
  interpolate?: boolean;
  fps?: number;
};

const nowMs = () => Date.now();

const shouldInterpolate = (state: PlaybackState) =>
  state.status === 'playing' && state.isPlaying && !state.isBuffering;

const interpolatePlaybackState = (
  state: PlaybackState,
  currentTimestampMs: number
): PlaybackState => {
  if (!shouldInterpolate(state)) {
    return state;
  }

  const elapsedMs = Math.max(0, currentTimestampMs - state.nativeTimestampMs);
  const advancedTime = (elapsedMs / 1000) * state.rate;
  const nextCurrentTime = Math.min(
    state.duration,
    state.currentTime + advancedTime
  );

  return {
    ...state,
    currentTime: nextCurrentTime,
    bufferDuration: Math.max(0, state.bufferedPosition - nextCurrentTime),
  };
};

export const usePlaybackState = (
  player: VideoPlayer,
  options: UsePlaybackStateOptions = {}
) => {
  const { interpolate = true, fps = 30 } = options;
  const [state, setState] = useState<PlaybackState>(() => player.playbackState);
  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    setState(player.playbackState);

    const subscription = player.addEventListener('onPlaybackState', (next) => {
      latestStateRef.current = next;
      setState(next);
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  useEffect(() => {
    if (!interpolate) {
      return;
    }

    let frameId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const frameDurationMs = Math.max(1, Math.round(1000 / fps));

    const tick = () => {
      const latest = latestStateRef.current;
      if (shouldInterpolate(latest)) {
        setState(interpolatePlaybackState(latest, nowMs()));
      } else {
        setState(latest);
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
  }, [fps, interpolate]);

  return interpolate ? state : latestStateRef.current;
};
