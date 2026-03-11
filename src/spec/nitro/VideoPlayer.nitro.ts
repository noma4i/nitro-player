import type { HybridObject } from 'react-native-nitro-modules';
import type { MemorySnapshot } from '../../core/types/MemorySnapshot';
import type { PlaybackState } from '../../core/types/PlaybackState';
import type { VideoPlayerBase } from '../../core/types/VideoPlayerBase';
import type { VideoPlayerEventEmitter } from './VideoPlayerEventEmitter.nitro';
import type { VideoPlayerSource } from './VideoPlayerSource.nitro';

export interface VideoPlayer
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }>,
    VideoPlayerBase {
  readonly source: VideoPlayerSource;
  readonly eventEmitter: VideoPlayerEventEmitter;
  readonly playbackState: PlaybackState;
  readonly memorySnapshot: MemorySnapshot;

  replaceSourceAsync(source: VideoPlayerSource | null): Promise<void>;
  release(): void;
}

export interface VideoPlayerFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createPlayer(source: VideoPlayerSource): VideoPlayer;
}
