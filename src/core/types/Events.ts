import type { PlaybackState } from './PlaybackState';
import type { NitroPlayerSource } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NitroPlayerRuntimeError } from './NitroPlayerError';
import type { NitroPlayerOrientation } from './NitroPlayerOrientation';

export interface NitroPlayerEvents {
  /**
   * Called when the bandwidth of the video changes.
   */
  onBandwidthUpdate: (data: BandwidthData) => void;
  /**
   * Called when the video is loaded.
   * @note onLoadStart -> initialize the player -> onLoad
   */
  onLoad: (data: onLoadData) => void;
  /**
   * Called when the video starts loading.
   * @note onLoadStart -> initialize the player -> onLoad
   */
  onLoadStart: (data: onLoadStartData) => void;
  /**
   * Called when the player playback snapshot changes.
   */
  onPlaybackState: (state: PlaybackState) => void;
  /**
   * Called when the volume of the player changes.
   */
  onVolumeChange: (data: onVolumeChangeData) => void;
}

export interface JSNitroPlayerEvents {
  onError: (error: NitroPlayerRuntimeError) => void;
}

export type AllNitroPlayerEvents = NitroPlayerEvents & JSNitroPlayerEvents;

export interface NitroPlayerViewEvents {
  /**
   * Called when the video view's fullscreen state changes.
   * @param fullscreen Whether the video view is in fullscreen mode.
   */
  onFullscreenChange: (fullscreen: boolean) => void;
  /**
   * Called when the video view will enter fullscreen mode.
   */
  willEnterFullscreen: () => void;
  /**
   * Called when the video view will exit fullscreen mode.
   */
  willExitFullscreen: () => void;
}

export interface BandwidthData {
  /**
   * The bitrate of the video in bits per second.
   */
  bitrate: number;
  /**
   * The width of the video in pixels.
   * @platform android
   */
  width?: number;
  /**
   * The height of the video in pixels.
   * @platform Android
   */
  height?: number;
}

export interface onLoadData {
  currentTime: number;
  duration: number;
  height: number;
  width: number;
  orientation: NitroPlayerOrientation;
}

export type SourceType = 'local' | 'network';

export interface onLoadStartData {
  sourceType: SourceType;
  source: NitroPlayerSource;
}

export interface onVolumeChangeData {
  volume: number;
  muted: boolean;
}

type CheckAllAndOnly<T, A extends readonly (keyof T)[]> =
  Exclude<keyof T, A[number]> extends never
    ? Exclude<A[number], keyof T> extends never
      ? A
      : ['Extra keys', Exclude<A[number], keyof T>]
    : ['Missing keys', Exclude<keyof T, A[number]>];

function allKeysOf<T>() {
  return <A extends readonly (keyof T)[]>(...arr: A): CheckAllAndOnly<T, A> => {
    return arr as CheckAllAndOnly<T, A>;
  };
}

export const ALL_PLAYER_EVENTS: (keyof AllNitroPlayerEvents)[] =
  allKeysOf<AllNitroPlayerEvents>()(
    'onBandwidthUpdate',
    'onError',
    'onLoad',
    'onLoadStart',
    'onPlaybackState',
    'onVolumeChange'
  );

export const ALL_VIEW_EVENTS: (keyof NitroPlayerViewEvents)[] =
  allKeysOf<NitroPlayerViewEvents>()(
    'onFullscreenChange',
    'willEnterFullscreen',
    'willExitFullscreen'
  );
