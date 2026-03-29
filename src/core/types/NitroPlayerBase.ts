import type { IgnoreSilentSwitchMode } from './IgnoreSilentSwitchMode';
import type { MemorySnapshot } from './MemorySnapshot';
import type { MixAudioMode } from './MixAudioMode';
import type { PlaybackState } from './PlaybackState';
import type { NitroSourceConfig } from './NitroPlayerConfig';
import type { NitroPlayerSourceBase } from './NitroPlayerSourceBase';
import type { NitroPlayerStatus } from './NitroPlayerStatus';

export interface NitroPlayerBase {
  readonly source: NitroPlayerSourceBase;
  readonly playbackState: PlaybackState;
  readonly memorySnapshot: MemorySnapshot;
  readonly status: NitroPlayerStatus;
  readonly duration: number;
  volume: number;
  currentTime: number;
  readonly bufferDuration: number;
  readonly bufferedPosition: number;
  muted: boolean;
  loop: boolean;
  rate: number;
  mixAudioMode: MixAudioMode;
  ignoreSilentSwitchMode: IgnoreSilentSwitchMode;
  playInBackground: boolean;
  playWhenInactive: boolean;
  readonly isPlaying: boolean;
  readonly isBuffering: boolean;
  readonly isReadyToDisplay: boolean;

  initialize(): Promise<void>;
  preload(): Promise<void>;
  play(): void;
  pause(): void;
  seekBy(time: number): void;
  seekTo(time: number): void;
  replaceSourceAsync(source: NitroSourceConfig | NitroPlayerSourceBase): Promise<void>;
  clearSourceAsync(): Promise<void>;
}
