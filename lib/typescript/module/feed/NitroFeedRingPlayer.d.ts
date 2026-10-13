import type { FeedRingCommandEvent, FeedRingSlotState, NitroFeedRingPlayer as NativeNitroFeedRingPlayer } from '../bridge/nitro/NitroFeedRingPlayer.nitro.js';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro.js';
import { NitroPlayer } from '../player/NitroPlayer.js';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig.js';
import type { NitroPlaybackPolicy } from '../surface/NitroPlaybackPolicy.js';
export type NitroFeedRingSlotId = 0 | 1 | 2;
export interface NitroFeedRingCatalogItem {
    index: number;
    itemId?: string | null;
    source?: NitroSourceInput | null;
}
export interface NitroFeedRingSlotSnapshot {
    slotId: NitroFeedRingSlotId;
    assignedIndex?: number;
    itemId?: string;
    sourceKey?: string;
    generation: number;
    desiredPlay: boolean;
    attached: boolean;
    prepared: boolean;
    ready: boolean;
    playing: boolean;
    buffering: boolean;
    currentTime: number;
    duration: number;
    bufferDuration?: number;
    bufferedPosition?: number;
    rate?: number;
    wantsToPlay?: boolean;
    retentionState?: string;
    hasLoadedSource?: boolean;
    watchdogAttempts?: number;
    watchdogPending?: boolean;
    nativePlaybackState?: string;
    status?: string;
    lastTransition: string;
    lastError?: string;
}
export interface NitroFeedRingSnapshot {
    catalogRevision: number;
    viewportRevision: number;
    catalogSize: number;
    windowCenterIndex?: number;
    playbackIndex?: number;
    playbackAllowed: boolean;
    muted: boolean;
    released: boolean;
    slots: NitroFeedRingSlotSnapshot[];
}
export interface NitroFeedRingPlayerOptions {
    playbackKey: string;
    policy: NitroPlaybackPolicy;
}
export declare class NitroFeedRingPlayer {
    private readonly nativeRing;
    private readonly players;
    private released;
    constructor(options: NitroFeedRingPlayerOptions);
    constructor(nativeRing: NativeNitroFeedRingPlayer, options: NitroFeedRingPlayerOptions);
    get isReleased(): boolean;
    get ringToken(): number;
    applyProjection(state: {
        revision: number;
        activationId: number;
        catalog?: {
            revision: number;
            items: readonly NitroFeedRingCatalogItem[];
        };
        windowCenterIndex: number;
        playbackIndex: number;
        playbackAllowed: boolean;
        muted: boolean;
    }): void;
    private mapNativeCatalogItems;
    getSlotPlayer(slotId: NitroFeedRingSlotId): NitroPlayer | null;
    snapshot(): NitroFeedRingSnapshot;
    addSlotStateListener(listener: (state: FeedRingSlotState) => void): ListenerSubscription;
    addCommandEventListener(listener: (event: FeedRingCommandEvent) => void): ListenerSubscription;
    release(): void;
}
//# sourceMappingURL=NitroFeedRingPlayer.d.ts.map