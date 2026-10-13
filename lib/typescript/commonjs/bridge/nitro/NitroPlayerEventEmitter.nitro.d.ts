import type { HybridObject } from 'react-native-nitro-modules';
import type { BandwidthData, onLoadData, onLoadStartData, onVolumeChangeData } from '../../player/events';
import type { PlaybackState } from '../../player/types/PlaybackState';
import type { PlaybackError } from '../../support/errors/PlaybackError';
export interface ListenerSubscription {
    remove(): void;
}
export interface NitroPlayerEventEmitter extends HybridObject<{
    ios: 'swift';
    android: 'kotlin';
}> {
    addOnBandwidthUpdateListener(listener: (data: BandwidthData) => void): ListenerSubscription;
    addOnLoadListener(listener: (data: onLoadData) => void): ListenerSubscription;
    addOnLoadStartListener(listener: (data: onLoadStartData) => void): ListenerSubscription;
    addOnErrorListener(listener: (error: PlaybackError) => void): ListenerSubscription;
    addOnPlaybackStateListener(listener: (state: PlaybackState) => void): ListenerSubscription;
    addOnPlaybackIntentIdledListener(listener: () => void): ListenerSubscription;
    addOnVolumeChangeListener(listener: (data: onVolumeChangeData) => void): ListenerSubscription;
    clearAllListeners(): void;
}
//# sourceMappingURL=NitroPlayerEventEmitter.nitro.d.ts.map