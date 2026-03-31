import type { NitroPlayerStatus } from './NitroPlayerStatus';
import type { PlaybackError } from './PlaybackError';
export interface PlaybackState {
    status: NitroPlayerStatus;
    currentTime: number;
    duration: number;
    bufferDuration: number;
    bufferedPosition: number;
    rate: number;
    isPlaying: boolean;
    isBuffering: boolean;
    isVisualReady: boolean;
    error?: PlaybackError | null;
    nativeTimestampMs: number;
}
//# sourceMappingURL=PlaybackState.d.ts.map