import type { HybridObject } from 'react-native-nitro-modules';
import type { NativeNitroPlayerConfig } from '../../source/types/NitroPlayerConfig';
import type { NitroPlayer } from './NitroPlayer.nitro';
import type { ListenerSubscription } from './NitroPlayerEventEmitter.nitro';
export interface FeedRingCatalogItem {
    index: number;
    itemId?: string;
    sourceKey?: string;
    source?: NativeNitroPlayerConfig;
}
export interface FeedRingCatalog {
    revision: number;
    items: FeedRingCatalogItem[];
}
export interface FeedRingProjection {
    revision: number;
    activationId: number;
    catalog?: FeedRingCatalog;
    windowCenterIndex: number;
    playbackIndex: number;
    playbackAllowed: boolean;
    muted: boolean;
}
export interface FeedRingCommandEvent {
    ringToken: number;
    projectionRevision: number;
    kind: string;
    slotId?: number;
    assignedIndex?: number;
    error?: string;
}
export interface FeedRingSlotSnapshot {
    slotId: number;
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
export interface FeedRingSnapshot {
    catalogRevision: number;
    viewportRevision: number;
    catalogSize: number;
    windowCenterIndex?: number;
    playbackIndex?: number;
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
    readonly ringToken: number;
    getPlayer(slotId: number): NitroPlayer;
    configurePlayback(key: string, group: string, priority: number, resumeAutomatically: boolean): void;
    applyProjection(projection: FeedRingProjection): void;
    snapshot(): FeedRingSnapshot;
    addSlotStateListener(listener: (state: FeedRingSlotState) => void): ListenerSubscription;
    addCommandEventListener(listener: (event: FeedRingCommandEvent) => void): ListenerSubscription;
    release(): void;
}
export interface NitroFeedRingPlayerFactory extends HybridObject<{
    ios: 'swift';
    android: 'kotlin';
}> {
    createRingPlayer(): NitroFeedRingPlayer;
}
//# sourceMappingURL=NitroFeedRingPlayer.nitro.d.ts.map