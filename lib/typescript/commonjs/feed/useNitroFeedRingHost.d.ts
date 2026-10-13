import type { NitroPlaybackContextName } from '../policy/playbackContexts';
import { type FeedRingHostBinding, type FeedRingHostCatalogState, type FeedRingHostDeclaredState } from './FeedRingHostArbiter';
import type { NitroFeedRingSnapshot } from './NitroFeedRingPlayer';
export interface UseNitroFeedRingHostOptions {
    hostKey: string;
    context: NitroPlaybackContextName;
    focused: boolean;
    playbackAllowed?: boolean;
    muted: boolean;
    catalog: FeedRingHostCatalogState;
    getViewport: FeedRingHostDeclaredState['getViewport'];
}
export interface UseNitroFeedRingHostResult {
    binding: FeedRingHostBinding | null;
    isActive: boolean;
    publishViewport: () => void;
    readSnapshot: () => NitroFeedRingSnapshot | null;
}
/**
 * Declarative feed ring host. The component publishes its state; the arbiter
 * owns activation, projection and recovery. All arbiter mutations happen in
 * the commit phase; render stays side-effect free.
 */
export declare function useNitroFeedRingHost(options: UseNitroFeedRingHostOptions): UseNitroFeedRingHostResult;
//# sourceMappingURL=useNitroFeedRingHost.d.ts.map