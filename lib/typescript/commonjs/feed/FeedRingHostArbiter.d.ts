import { type NitroFeedRingCatalogItem, NitroFeedRingPlayer, type NitroFeedRingSnapshot } from './NitroFeedRingPlayer';
export type FeedRingHostCatalogState = {
    revision: number;
    items: readonly NitroFeedRingCatalogItem[];
};
export type FeedRingHostDeclaredState = {
    focused: boolean;
    playbackAllowed: boolean;
    muted: boolean;
    catalog: FeedRingHostCatalogState;
    getViewport: () => {
        windowCenterIndex: number;
        playbackIndex: number;
    };
};
export type FeedRingHostBinding = {
    ring: NitroFeedRingPlayer;
    generation: number;
    activationId: number;
};
type FeedRingArbiterDebugSnapshot = {
    activeHostKey: string | null;
    ringGeneration: number;
    activationId: number;
    projectionRevision: number;
    lastProjectedCatalogKey: string | null;
    lastCreateError: string | null;
    lastCommandError: string | null;
    commandEventCounts: {
        accepted: number;
        rejected: number;
        applyError: number;
        sourceError: number;
    };
    ringAlive: boolean;
    hosts: Array<{
        hostKey: string;
        focused: boolean;
        playbackAllowed: boolean;
        focusSeq: number;
        catalogRevision: number;
    }>;
};
/**
 * Process-wide arbiter that owns the single native feed ring and projects the
 * declared state of exactly one active host onto it.
 *
 * Host mutations (`registerHost` / `updateHost` / `unregisterHost`) may only be
 * called from the React commit phase (effects), never from render. `getBinding`
 * is a pure read safe as a `useSyncExternalStore` snapshot.
 *
 * Native owns ring lifecycle and self-healing. The arbiter never recreates the
 * ring after command events; an empty host map parks the ring, and `releaseAll`
 * is the only explicit teardown.
 */
declare class FeedRingHostArbiter {
    private readonly hosts;
    private readonly listeners;
    private ring;
    private commandSubscription;
    private ringGeneration;
    private activationId;
    private projectionRevision;
    private lastProjectedCatalogKey;
    private lastProjectionState;
    private lastCreateError;
    private lastCommandError;
    private readonly commandEventCounts;
    private lastWindowCenterIndex;
    private lastPlaybackIndex;
    private lastMuted;
    private activeHostKey;
    private activeBinding;
    private focusCounter;
    private dirty;
    private converging;
    private foregroundSubscription;
    /**
     * Subscribes on first use rather than at module evaluation time. This module and
     * `nativePlaybackRuntime` import each other, so a listener attached while the module graph is
     * still being evaluated would depend on which side happens to load first.
     */
    private ensureForegroundSubscription;
    /** Commit phase only. */
    registerHost(hostKey: string, state: FeedRingHostDeclaredState): void;
    /** Commit phase only. */
    updateHost(hostKey: string, state: FeedRingHostDeclaredState): void;
    /** Imperative viewport signal (scroll subscriptions). Reads go through `getViewport`. */
    publishViewport(hostKey: string): void;
    /** Commit phase only. */
    unregisterHost(hostKey: string): void;
    /** Listeners live outside host entries so a subscription survives recreation. */
    subscribe(hostKey: string, listener: () => void): () => void;
    /** Pure read: never constructs, never mutates, stable identity between changes. */
    getBinding(hostKey: string): FeedRingHostBinding | null;
    /**
     * Releases the native ring without touching host registrations. This is the
     * only teardown path and is reserved for logout/reset; an empty host map parks
     * the ring. A host mutation recreates it lazily after an explicit release.
     */
    releaseAll(): void;
    getDebugSnapshot(): FeedRingArbiterDebugSnapshot;
    getRingSnapshot(): NitroFeedRingSnapshot | null;
    private markDirty;
    private convergeOnce;
    private resolveActiveHost;
    private projectParked;
    private projectActive;
    private applyProjection;
    private ensureRing;
    private handleCommandEvent;
    private releaseRing;
    private refreshBinding;
    private notify;
}
export declare const feedRingHostArbiter: FeedRingHostArbiter;
export {};
//# sourceMappingURL=FeedRingHostArbiter.d.ts.map