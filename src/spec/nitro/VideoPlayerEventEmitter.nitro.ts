import type { HybridObject } from 'react-native-nitro-modules';
import type {
  BandwidthData,
  onLoadData,
  onLoadStartData,
  onVolumeChangeData,
} from '../../core/types/Events';
import type { PlaybackState } from '../../core/types/PlaybackState';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { VideoPlayerEvents } from '../../core/types/Events';

export interface ListenerSubscription {
  remove(): void;
}

export interface VideoPlayerEventEmitter
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  addOnBandwidthUpdateListener(
    listener: (data: BandwidthData) => void
  ): ListenerSubscription;

  addOnLoadListener(listener: (data: onLoadData) => void): ListenerSubscription;

  addOnLoadStartListener(
    listener: (data: onLoadStartData) => void
  ): ListenerSubscription;

  addOnPlaybackStateListener(
    listener: (state: PlaybackState) => void
  ): ListenerSubscription;

  addOnVolumeChangeListener(
    listener: (data: onVolumeChangeData) => void
  ): ListenerSubscription;

  clearAllListeners(): void;
}
