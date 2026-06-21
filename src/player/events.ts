import type { PlaybackState } from './types/PlaybackState';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro';
import type { NitroPlayerOrientation } from '../view/types/NitroPlayerOrientation';
import type { PlaybackError } from '../support/errors/PlaybackError';
import { allKeysOf } from '../support/typeHelpers';

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
   * Called when the active source reaches its first visual frame.
   */
  onFirstFrame: (data: onFirstFrameData) => void;
  /**
   * Called when playback fails for the active source generation.
   */
  onError: (error: PlaybackError) => void;
  /**
   * Called when the volume of the player changes.
   */
  onVolumeChange: (data: onVolumeChangeData) => void;
}

export type AllNitroPlayerEvents = NitroPlayerEvents;

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
export type LoadEvent = onLoadData;

export type SourceType = 'local' | 'network';

export interface onLoadStartData {
  sourceType: SourceType;
  source: NitroPlayerSource;
}
export type LoadStartEvent = onLoadStartData;

export interface onVolumeChangeData {
  volume: number;
  muted: boolean;
}
export type VolumeChangeEvent = onVolumeChangeData;

export interface onFirstFrameData {
  uri: string;
  width: number;
  height: number;
  sourceUri: string;
  fromCache: boolean;
}
export type FirstFrameEvent = onFirstFrameData;

export const ALL_PLAYER_EVENTS: (keyof AllNitroPlayerEvents)[] = allKeysOf<AllNitroPlayerEvents>()(
  'onBandwidthUpdate',
  'onError',
  'onFirstFrame',
  'onLoad',
  'onLoadStart',
  'onPlaybackState',
  'onVolumeChange'
);
