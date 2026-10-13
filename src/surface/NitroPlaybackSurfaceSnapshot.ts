import type { onLoadData } from '../player/events';
import type { NitroPlayerStatus } from '../player/types/NitroPlayerStatus';
import type { PlaybackState } from '../player/types/PlaybackState';
import type { PlaybackError } from '../support/errors/PlaybackError';

export type NitroPlaybackSurfaceSnapshot = Readonly<{
  key: string;
  sourceKey: string;
  status: NitroPlayerStatus;
  isAttached: boolean;
  isReady: boolean;
  isVisualReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  error: PlaybackError | null;
}>;

export type NitroPlaybackSurfaceSnapshotEvent =
  | Readonly<{ type: 'attached'; state: PlaybackState | null }>
  | Readonly<{ type: 'detached' }>
  | Readonly<{ type: 'load'; data: onLoadData }>
  | Readonly<{ type: 'playbackState'; state: PlaybackState }>
  | Readonly<{ type: 'error'; error: PlaybackError }>;

export type NitroPlaybackSurfaceSnapshotReduction = Readonly<{
  snapshot: NitroPlaybackSurfaceSnapshot;
  shouldNotify: boolean;
}>;

export const createNitroPlaybackSurfaceSnapshot = (key: string, sourceKey: string): NitroPlaybackSurfaceSnapshot => ({
  key,
  sourceKey,
  status: 'idle',
  isAttached: false,
  isReady: false,
  isVisualReady: false,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  error: null
});

export const reduceNitroPlaybackSurfaceSnapshot = (
  previous: NitroPlaybackSurfaceSnapshot,
  event: NitroPlaybackSurfaceSnapshotEvent
): NitroPlaybackSurfaceSnapshotReduction => {
  let next: NitroPlaybackSurfaceSnapshot;

  switch (event.type) {
    case 'attached':
      next = event.state === null ? { ...previous, isAttached: true } : {
        ...previous,
        status: event.state.status,
        isAttached: true,
        isReady: event.state.isVisualReady,
        isVisualReady: event.state.isVisualReady,
        isPlaying: event.state.isPlaying,
        isBuffering: event.state.isBuffering,
        currentTime: event.state.currentTime,
        duration: event.state.duration > 0 ? event.state.duration : previous.duration,
        error: event.state.error ?? null
      };
      break;
    case 'detached':
      next = {
        ...previous,
        isAttached: false,
        isReady: false,
        isVisualReady: false,
        isPlaying: false,
        isBuffering: false,
        error: null
      };
      break;
    case 'load':
      next = {
        ...previous,
        isReady: true,
        currentTime: event.data.currentTime,
        duration: event.data.duration,
        error: null
      };
      break;
    case 'playbackState': {
      const isVisualReady = previous.isAttached ? event.state.isVisualReady : false;
      next = {
        ...previous,
        status: event.state.status,
        isReady: isVisualReady ? true : previous.isReady,
        isVisualReady,
        isPlaying: event.state.isPlaying,
        isBuffering: event.state.isBuffering,
        currentTime: event.state.currentTime,
        duration: event.state.duration > 0 ? event.state.duration : previous.duration,
        error: event.state.status === 'error' ? event.state.error ?? previous.error : event.state.error ?? null
      };
      break;
    }
    case 'error':
      next = {
        ...previous,
        status: 'error',
        isPlaying: false,
        isBuffering: false,
        error: event.error
      };
      break;
  }

  if (
    next.key === previous.key &&
    next.sourceKey === previous.sourceKey &&
    next.status === previous.status &&
    next.isAttached === previous.isAttached &&
    next.isReady === previous.isReady &&
    next.isVisualReady === previous.isVisualReady &&
    next.isPlaying === previous.isPlaying &&
    next.isBuffering === previous.isBuffering &&
    next.currentTime === previous.currentTime &&
    next.duration === previous.duration &&
    next.error === previous.error
  ) {
    return { snapshot: previous, shouldNotify: false };
  }

  const statusTransitionIsTerminal = next.status !== previous.status && (
    next.status === 'ended' ||
    next.status === 'error' ||
    previous.status === 'ended' ||
    previous.status === 'error'
  );

  return {
    snapshot: next,
    shouldNotify: next.key !== previous.key ||
      next.sourceKey !== previous.sourceKey ||
      next.isAttached !== previous.isAttached ||
      next.isReady !== previous.isReady ||
      next.isVisualReady !== previous.isVisualReady ||
      next.isPlaying !== previous.isPlaying ||
      next.isBuffering !== previous.isBuffering ||
      next.duration !== previous.duration ||
      next.error !== previous.error ||
      statusTransitionIsTerminal
  };
};
