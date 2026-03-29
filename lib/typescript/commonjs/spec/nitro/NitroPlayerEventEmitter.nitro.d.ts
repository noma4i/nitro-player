import type { HybridObject } from 'react-native-nitro-modules';
import type { BandwidthData, onLoadData, onLoadStartData, onVolumeChangeData } from '../../core/types/Events';
import type { PlaybackState } from '../../core/types/PlaybackState';
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
    addOnPlaybackStateListener(listener: (state: PlaybackState) => void): ListenerSubscription;
    addOnVolumeChangeListener(listener: (data: onVolumeChangeData) => void): ListenerSubscription;
    clearAllListeners(): void;
}
//# sourceMappingURL=NitroPlayerEventEmitter.nitro.d.ts.map