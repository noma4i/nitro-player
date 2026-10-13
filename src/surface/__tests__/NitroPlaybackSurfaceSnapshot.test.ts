import { describe, expect, it } from '@jest/globals';
import type { PlaybackState } from '../../player/types/PlaybackState';
import {
  createNitroPlaybackSurfaceSnapshot,
  reduceNitroPlaybackSurfaceSnapshot
} from '../NitroPlaybackSurfaceSnapshot';

const state = (overrides: Partial<PlaybackState> = {}): PlaybackState =>
  ({
    status: 'playing',
    isPlaying: true,
    isBuffering: false,
    isVisualReady: true,
    currentTime: 1,
    duration: 10,
    error: undefined,
    ...overrides
  }) as PlaybackState;

const attached = () =>
  reduceNitroPlaybackSurfaceSnapshot(createNitroPlaybackSurfaceSnapshot('k', 's'), { type: 'attached', state: null }).snapshot;

describe('reduceNitroPlaybackSurfaceSnapshot', () => {
  it('notifies when attachment changes and keeps the previous object for a no-op event', () => {
    const initial = createNitroPlaybackSurfaceSnapshot('k', 's');
    const first = reduceNitroPlaybackSurfaceSnapshot(initial, { type: 'attached', state: null });
    const second = reduceNitroPlaybackSurfaceSnapshot(first.snapshot, { type: 'attached', state: null });

    expect(first.shouldNotify).toBe(true);
    expect(first.snapshot.isAttached).toBe(true);
    expect(second.shouldNotify).toBe(false);
    expect(second.snapshot).toBe(first.snapshot);
  });

  it('does not notify for currentTime-only progress', () => {
    const playing = reduceNitroPlaybackSurfaceSnapshot(attached(), { type: 'playbackState', state: state() }).snapshot;

    const tick = reduceNitroPlaybackSurfaceSnapshot(playing, { type: 'playbackState', state: state({ currentTime: 2 }) });

    expect(tick.snapshot.currentTime).toBe(2);
    expect(tick.shouldNotify).toBe(false);
  });

  it('reports visual readiness only while attached', () => {
    const detached = createNitroPlaybackSurfaceSnapshot('k', 's');

    const whileDetached = reduceNitroPlaybackSurfaceSnapshot(detached, { type: 'playbackState', state: state() });
    const whileAttached = reduceNitroPlaybackSurfaceSnapshot(attached(), { type: 'playbackState', state: state() });

    expect(whileDetached.snapshot.isVisualReady).toBe(false);
    expect(whileAttached.snapshot.isVisualReady).toBe(true);
    expect(whileAttached.snapshot.isReady).toBe(true);
  });

  it('detach clears visual state and keeps duration', () => {
    const playing = reduceNitroPlaybackSurfaceSnapshot(attached(), { type: 'playbackState', state: state() }).snapshot;

    const detached = reduceNitroPlaybackSurfaceSnapshot(playing, { type: 'detached' }).snapshot;

    expect(detached).toMatchObject({ isAttached: false, isReady: false, isVisualReady: false, isPlaying: false, duration: 10 });
  });

  it('notifies on a terminal status change even when flags stay equal', () => {
    const paused = reduceNitroPlaybackSurfaceSnapshot(attached(), {
      type: 'playbackState',
      state: state({ status: 'paused', isPlaying: false })
    }).snapshot;

    const ended = reduceNitroPlaybackSurfaceSnapshot(paused, {
      type: 'playbackState',
      state: state({ status: 'ended', isPlaying: false })
    });

    expect(ended.shouldNotify).toBe(true);
  });

  it('error event stops playback and records the error', () => {
    const playing = reduceNitroPlaybackSurfaceSnapshot(attached(), { type: 'playbackState', state: state() }).snapshot;
    const error = { code: 'x', message: 'boom' } as never;

    const failed = reduceNitroPlaybackSurfaceSnapshot(playing, { type: 'error', error });

    expect(failed.snapshot).toMatchObject({ status: 'error', isPlaying: false, isBuffering: false, error });
    expect(failed.shouldNotify).toBe(true);
  });
});
