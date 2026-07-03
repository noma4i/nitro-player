import type { FeedRingSlotState, NitroFeedRingPlayer as NativeNitroFeedRingPlayer } from '../bridge/nitro/NitroFeedRingPlayer.nitro';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import { NitroPlayer } from '../player/NitroPlayer';
import type { AdaptiveQualityConfig, AdaptiveQualityDecision, ResolvedAdaptiveQualityConfig } from '../source/adaptiveQuality';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
import type { StreamNetworkThroughputEstimate } from '../streaming/types';
export type NitroFeedRingSlotId = 0 | 1 | 2;
export interface NitroFeedRingCatalogItem {
    index: number;
    momentId?: string | null;
    source?: NitroSourceInput | null;
}
export interface NitroFeedRingCatalogState {
    revision: number;
    items: NitroFeedRingCatalogItem[];
}
export interface NitroFeedRingViewportState {
    revision: number;
    centerIndex: number;
    playbackAllowed: boolean;
    muted: boolean;
}
export interface NitroFeedRingSlotSnapshot {
    slotId: NitroFeedRingSlotId;
    assignedIndex?: number;
    momentId?: string;
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
    centerIndex?: number;
    playbackAllowed: boolean;
    muted: boolean;
    released: boolean;
    slots: NitroFeedRingSlotSnapshot[];
}
export interface NitroFeedRingPlayerOptions {
    /**
     * Enables CDN-throughput based feed quality decisions. Defaults off, so feed
     * sources stay on the configured feed policy cap. Android currently returns
     * no throughput estimate, so the decision remains low there.
     *
     * Decision updates apply to subsequent source attaches. The currently playing
     * item is not mutated mid-play.
     */
    adaptiveQuality?: boolean;
    adaptiveConfig?: AdaptiveQualityConfig;
}
export interface NitroFeedRingAdaptiveSnapshot {
    enabled: boolean;
    decision: AdaptiveQualityDecision;
    lastEstimate: StreamNetworkThroughputEstimate | null;
    config: ResolvedAdaptiveQualityConfig;
}
export declare class NitroFeedRingPlayer {
    private readonly nativeRing;
    private readonly players;
    private released;
    private adaptiveEnabled;
    private adaptiveDecision;
    private adaptiveConfig;
    private lastEstimate;
    private lastCatalogState;
    private lastNativeCatalogRevision;
    constructor(options?: NitroFeedRingPlayerOptions);
    constructor(nativeRing?: NativeNitroFeedRingPlayer, options?: NitroFeedRingPlayerOptions);
    get isReleased(): boolean;
    replaceCatalog(state: NitroFeedRingCatalogState): void;
    commitViewport(state: NitroFeedRingViewportState): void;
    adaptiveSnapshot(): NitroFeedRingAdaptiveSnapshot;
    private replaceNativeCatalog;
    private resolveNativeCatalogRevision;
    private configureAdaptiveState;
    private updateAdaptiveDecision;
    getSlotPlayer(slotId: NitroFeedRingSlotId): NitroPlayer | null;
    snapshot(): NitroFeedRingSnapshot;
    addSlotStateListener(listener: (state: FeedRingSlotState) => void): ListenerSubscription;
    release(): void;
}
//# sourceMappingURL=NitroFeedRingPlayer.d.ts.map