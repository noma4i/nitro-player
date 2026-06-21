import type { HybridObject } from 'react-native-nitro-modules';
import type { IgnoreSilentSwitchMode } from '../../player/types/IgnoreSilentSwitchMode';
import type { MemorySnapshot } from '../../player/types/MemorySnapshot';
import type { MixAudioMode } from '../../player/types/MixAudioMode';
import type { PlaybackState } from '../../player/types/PlaybackState';
import type { NitroPlayerStatus } from '../../player/types/NitroPlayerStatus';
import type { NitroPlayerEventEmitter } from './NitroPlayerEventEmitter.nitro';
import type { NitroPlayerSource } from './NitroPlayerSource.nitro';

export interface NitroPlayer extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  readonly source: NitroPlayerSource;
  readonly eventEmitter: NitroPlayerEventEmitter;
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
  readonly isVisualReady: boolean;

  initialize(): Promise<void>;
  preload(): Promise<void>;
  play(): void;
  pause(): void;
  seekBy(time: number): void;
  seekTo(time: number): void;
  replaceSourceAsync(source: NitroPlayerSource): Promise<void>;
  clearSourceAsync(): Promise<void>;
  release(): void;
}

export interface NitroPlayerFactory extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createPlayer(source: NitroPlayerSource): NitroPlayer;
}
