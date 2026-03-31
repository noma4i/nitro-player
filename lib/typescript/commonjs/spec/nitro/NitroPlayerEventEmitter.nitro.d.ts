import type { HybridObject } from 'react-native-nitro-modules';
import type { BandwidthData, onFirstFrameData, onLoadData, onLoadStartData, onVolumeChangeData } from '../../core/types/Events';
import type { PlaybackError } from '../../core/types/PlaybackError';
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
    addOnFirstFrameListener(listener: (data: onFirstFrameData) => void): ListenerSubscription;
    addOnErrorListener(listener: (error: PlaybackError) => void): ListenerSubscription;
    addOnPlaybackStateListener(listener: (state: PlaybackState) => void): ListenerSubscription;
    addOnVolumeChangeListener(listener: (data: onVolumeChangeData) => void): ListenerSubscription;
    clearAllListeners(): void;
}
//# sourceMappingURL=NitroPlayerEventEmitter.nitro.d.ts.map