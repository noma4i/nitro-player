import type { HybridObject } from 'react-native-nitro-modules';
import type { NativeNitroPlayerConfig } from '../../source/types/NitroPlayerConfig';
import type { ListenerSubscription } from './NitroPlayerEventEmitter.nitro';
import type { NitroPlayer } from './NitroPlayer.nitro';
export interface FeedRingCatalogItem {
    index: number;
    momentId?: string;
    sourceKey?: string;
    source?: NativeNitroPlayerConfig;
}
export interface FeedRingCatalog {
    revision: number;
    items: FeedRingCatalogItem[];
}
export interface FeedRingViewport {
    revision: number;
    centerIndex: number;
    playbackAllowed: boolean;
    muted: boolean;
}
export interface FeedRingSlotSnapshot {
    slotId: number;
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
export interface FeedRingSnapshot {
    catalogRevision: number;
    viewportRevision: number;
    catalogSize: number;
    centerIndex?: number;
    playbackAllowed: boolean;
    muted: boolean;
    released: boolean;
    slots: FeedRingSlotSnapshot[];
}
export interface FeedRingSlotState {
    slotId: number;
    generation: number;
    assignedIndex?: number;
    ready: boolean;
    playing: boolean;
    buffering: boolean;
    currentTime: number;
    duration: number;
}
export interface NitroFeedRingPlayer extends HybridObject<{
    ios: 'swift';
    android: 'kotlin';
}> {
    getPlayer(slotId: number): NitroPlayer;
    replaceCatalog(catalog: FeedRingCatalog): void;
    commitViewport(viewport: FeedRingViewport): void;
    snapshot(): FeedRingSnapshot;
    addSlotStateListener(listener: (state: FeedRingSlotState) => void): ListenerSubscription;
    release(): void;
}
export interface NitroFeedRingPlayerFactory extends HybridObject<{
    ios: 'swift';
    android: 'kotlin';
}> {
    createRingPlayer(): NitroFeedRingPlayer;
}
//# sourceMappingURL=NitroFeedRingPlayer.nitro.d.ts.map