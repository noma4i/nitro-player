import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import type { NitroPlaybackContextName } from '../policy/playbackContexts';
import { feedRingHostArbiter, type FeedRingHostBinding, type FeedRingHostCatalogState, type FeedRingHostDeclaredState } from './FeedRingHostArbiter';
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

const toDeclaredState = (options: UseNitroFeedRingHostOptions): FeedRingHostDeclaredState => ({
  focused: options.focused,
  playbackAllowed: options.playbackAllowed ?? true,
  muted: options.muted,
  catalog: options.catalog,
  getViewport: options.getViewport
});

/**
 * Declarative feed ring host. The component publishes its state; the arbiter
 * owns activation, projection and recovery. All arbiter mutations happen in
 * the commit phase; render stays side-effect free.
 */
export function useNitroFeedRingHost(options: UseNitroFeedRingHostOptions): UseNitroFeedRingHostResult {
  const { hostKey } = options;

  if (typeof __DEV__ !== 'undefined' && __DEV__ && options.context !== 'ring') {
    throw new Error(`useNitroFeedRingHost supports only the 'ring' context, got '${options.context}'`);
  }

  useLayoutEffect(() => {
    feedRingHostArbiter.registerHost(hostKey, toDeclaredState(options));
    return () => {
      feedRingHostArbiter.unregisterHost(hostKey);
    };
  }, [hostKey]);

  useLayoutEffect(() => {
    feedRingHostArbiter.updateHost(hostKey, toDeclaredState(options));
  });

  const subscribe = useCallback((listener: () => void) => feedRingHostArbiter.subscribe(hostKey, listener), [hostKey]);
  const getBinding = useCallback(() => feedRingHostArbiter.getBinding(hostKey), [hostKey]);
  const binding = useSyncExternalStore(subscribe, getBinding, getBinding);

  const publishViewport = useCallback(() => {
    feedRingHostArbiter.publishViewport(hostKey);
  }, [hostKey]);

  const readSnapshot = useCallback((): NitroFeedRingSnapshot | null => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) {
      return null;
    }

    const ring = feedRingHostArbiter.getBinding(hostKey)?.ring;
    if (!ring || ring.isReleased) {
      return null;
    }

    try {
      return ring.snapshot();
    } catch {
      return null;
    }
  }, [hostKey]);

  return {
    binding,
    isActive: binding !== null,
    publishViewport,
    readSnapshot
  };
}
