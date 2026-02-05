import type { IgnoreSilentSwitchMode } from './IgnoreSilentSwitchMode';
import type { MemorySnapshot } from './MemorySnapshot';
import type { MixAudioMode } from './MixAudioMode';
import type { PlaybackState } from './PlaybackState';
import type { TextTrack } from './TextTrack';
import type { VideoPlayerSourceBase } from './VideoPlayerSourceBase';
import type { VideoPlayerStatus } from './VideoPlayerStatus';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { VideoConfig } from './VideoConfig';

export interface VideoPlayerBase {
  /**
   * The source of the video.
   * Source is immutable. To change the source, you need to call {@link replaceSourceAsync} method.
   * see {@link VideoPlayerSourceBase}
   */
  readonly source: VideoPlayerSourceBase;

  /**
   * Full playback snapshot. This is the single source of truth for JS playback UI.
   */
  readonly playbackState: PlaybackState;

  /**
   * Current native memory footprint snapshot for the player + source pair.
   */
  readonly memorySnapshot: MemorySnapshot;

  /**
   * Thin accessor over {@link playbackState.status}.
   */
  readonly status: VideoPlayerStatus;

  /**
   * Thin accessor over {@link playbackState.duration}.
   */
  readonly duration: number;

  /**
   * The volume of the video (0.0 = 0%, 1.0 = 100%).
   * @note If the player is {@link muted}, the volume will be 0.0.
   */
  volume: number;

  /**
   * Thin accessor over {@link playbackState.currentTime}.
   */
  currentTime: number;

  /**
   * Thin accessor over {@link playbackState.bufferDuration}.
   */
  readonly bufferDuration: number;

  /**
   * Thin accessor over {@link playbackState.bufferedPosition}.
   */
  readonly bufferedPosition: number;

  /**
   * Whether the player is muted.
   */
  muted: boolean;

  /**
   * Whether the player is looped.
   */
  loop: boolean;

  /**
   * Controls the speed at which the player should play.
   * @note if rate is = 0, it will pause video.
   */
  rate: number;

  /**
   * Controls the audio mixing mode of the player.
   *
   * - `mixWithOthers` - Mix with other players.
   * - `doNotMix` - Do not mix with other players.
   * - `duckOthers` - Duck other players.
   * - `auto` - uses default behavior for player.
   *
   * default is `auto`.
   */
  mixAudioMode: MixAudioMode;

  /**
   * Controls the silent switch mode of the player.
   * @note This is only supported on iOS.
   *
   * - `auto` - uses default behavior for player.
   * - `ignore` - ignore the silent switch.
   * - `obey` - obey the silent switch.
   */
  ignoreSilentSwitchMode: IgnoreSilentSwitchMode;

  /**
   * Whether the player should play in background.
   *
   * - `true` - play in background.
   * - `false` - pause in background (default).
   *
   * @note this can override {@link playWhenInactive}.
   */
  playInBackground: boolean;

  /**
   * Whether the player should play when the app is inactive (user opened control center).
   *
   * - `true` - play when the app is inactive.
   * - `false` - pause when the app is inactive (default).
   *
   * @note this can be overridden by {@link playInBackground}.
   * @note This is only supported on iOS.
   */
  playWhenInactive: boolean;

  /**
   * Thin accessor over {@link playbackState.isPlaying}.
   */
  readonly isPlaying: boolean;

  /**
   * Thin accessor over {@link playbackState.isBuffering}.
   */
  readonly isBuffering: boolean;

  /**
   * Thin accessor over {@link playbackState.isReadyToDisplay}.
   */
  readonly isReadyToDisplay: boolean;

  /**
   * Manually initialize the player. You don't need to call this method manually, unless you set `initializeOnCreation` to false in {@link VideoConfig}
   */
  initialize(): Promise<void>;

  /**
   * Preload the video.
   * This is useful to avoid delay when the user plays the video.
   * Preloading too many videos can lead to memory issues or performance issues.
   */
  preload(): Promise<void>;

  /**
   * Start playback of player.
   */
  play(): void;

  /**
   * Pause playback of player.
   */
  pause(): void;

  /**
   * Seek by given time.
   * If the time is negative, it will seek backward.
   * time will be clamped if it is out of range (0 ~ {@link duration}).
   * @param time - The time to seek from current time in seconds.
   */
  seekBy(time: number): void;

  /**
   * Seek to a specific time in the video.
   * @param time - The time to seek to in seconds.
   * @note This have same effect as {@link currentTime} setter.
   * @note time will be clamped if it is out of range (0 ~ {@link duration}).
   */
  seekTo(time: number): void;

  /**
   * Replace the current source of the player.
   * @param source - The new source of the video.
   * @note If you want to clear the source, you can pass null.
   * see {@link VideoPlayerSourceBase}
   */
  replaceSourceAsync(source: VideoPlayerSourceBase | null): Promise<void>;

  /**
   * Get all available text tracks for the current source.
   * @returns Array of available text tracks
   */
  getAvailableTextTracks(): TextTrack[];

  /**
   * Select a text track to display.
   * @param textTrack - Text track to select, or null to unselect current track
   */
  selectTextTrack(textTrack: TextTrack | null): void;

  /**
   * Get the currently selected text track.
   * @returns The currently selected text track, or undefined if none is selected
   */
  readonly selectedTrack?: TextTrack;
}
