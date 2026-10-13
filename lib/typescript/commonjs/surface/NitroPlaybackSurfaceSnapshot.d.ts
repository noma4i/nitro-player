import type { onLoadData } from '../player/events';
import type { NitroPlayerStatus } from '../player/types/NitroPlayerStatus';
import type { PlaybackState } from '../player/types/PlaybackState';
import type { PlaybackError } from '../support/errors/PlaybackError';
export type NitroPlaybackSurfaceSnapshot = Readonly<{
    key: string;
    sourceKey: string;
    status: NitroPlayerStatus;
    isAttached: boolean;
    isReady: boolean;
    isVisualReady: boolean;
    isPlaying: boolean;
    isBuffering: boolean;
    currentTime: number;
    duration: number;
    error: PlaybackError | null;
}>;
export type NitroPlaybackSurfaceSnapshotEvent = Readonly<{
    type: 'attached';
    state: PlaybackState | null;
}> | Readonly<{
    type: 'detached';
}> | Readonly<{
    type: 'load';
    data: onLoadData;
}> | Readonly<{
    type: 'playbackState';
    state: PlaybackState;
}> | Readonly<{
    type: 'error';
    error: PlaybackError;
}>;
export type NitroPlaybackSurfaceSnapshotReduction = Readonly<{
    snapshot: NitroPlaybackSurfaceSnapshot;
    shouldNotify: boolean;
}>;
export declare const createNitroPlaybackSurfaceSnapshot: (key: string, sourceKey: string) => NitroPlaybackSurfaceSnapshot;
export declare const reduceNitroPlaybackSurfaceSnapshot: (previous: NitroPlaybackSurfaceSnapshot, event: NitroPlaybackSurfaceSnapshotEvent) => NitroPlaybackSurfaceSnapshotReduction;
//# sourceMappingURL=NitroPlaybackSurfaceSnapshot.d.ts.map