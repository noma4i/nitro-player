import type { HybridObject } from 'react-native-nitro-modules';
import type { MemorySnapshot } from '../../core/types/MemorySnapshot';
import type { PlaybackState } from '../../core/types/PlaybackState';
import type { NitroPlayerBase } from '../../core/types/NitroPlayerBase';
import type { NitroPlayerEventEmitter } from './NitroPlayerEventEmitter.nitro';
import type { NitroPlayerSource } from './NitroPlayerSource.nitro';

export interface NitroPlayer
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }>,
    NitroPlayerBase {
  readonly source: NitroPlayerSource;
  readonly eventEmitter: NitroPlayerEventEmitter;
  readonly playbackState: PlaybackState;
  readonly memorySnapshot: MemorySnapshot;

  replaceSourceAsync(source: NitroPlayerSource | null): Promise<void>;
  release(): void;
}

export interface NitroPlayerFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createPlayer(source: NitroPlayerSource): NitroPlayer;
}
