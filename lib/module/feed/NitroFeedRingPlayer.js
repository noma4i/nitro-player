"use strict";

import { NitroModules } from 'react-native-nitro-modules';
import { NitroPlayer } from "../player/NitroPlayer.js";
import { isPreparedSource, prepareSource, toNativeSourceConfig } from "../source/prepareSource.js";
import { resolveAdaptiveDecision, resolveAdaptiveQualityConfig } from "../source/adaptiveQuality.js";
import { resolveSourcePolicyDefaults } from "../source/sourcePolicy.js";
import { streamCache } from "../streaming/streamCache.js";
const NitroFeedRingPlayerFactory = NitroModules.createHybridObject('NitroFeedRingPlayerFactory');
const FEED_RING_SOURCE_POLICY = 'feed';
const FEED_RING_PRELOAD_LEVEL = 'buffered';
const stripVolatileUriParts = uri => {
  const queryIndex = uri.indexOf('?');
  const fragmentIndex = uri.indexOf('#');
  const endIndexCandidates = [queryIndex, fragmentIndex].filter(index => index >= 0);
  const endIndex = endIndexCandidates.length > 0 ? Math.min(...endIndexCandidates) : uri.length;
  return uri.slice(0, endIndex);
};
const buildFeedRingSourceKey = (momentId, uri) => `${momentId ?? ''}|${stripVolatileUriParts(uri)}`;
const resolveAdaptiveFeedBuffer = (decision, config) => {
  const policyBuffer = resolveSourcePolicyDefaults(FEED_RING_SOURCE_POLICY).buffer ?? {};
  return {
    ...policyBuffer,
    preferredPeakBitRate: decision === 'high' ? config.highMaxBitrate : policyBuffer.preferredPeakBitRate
  };
};
const normalizeFeedRingSourceInput = (source, adaptiveBuffer) => {
  if (isPreparedSource(source)) {
    return {
      uri: source.uri,
      headers: source.headers,
      metadata: source.metadata,
      startup: source.startup,
      buffer: adaptiveBuffer ?? source.buffer,
      retention: {
        ...source.retention,
        preload: FEED_RING_PRELOAD_LEVEL
      },
      transport: source.transport,
      preview: source.preview,
      policy: source.policy
    };
  }
  if (typeof source === 'string' || typeof source === 'number') {
    return {
      uri: source,
      policy: FEED_RING_SOURCE_POLICY,
      buffer: adaptiveBuffer,
      retention: {
        preload: FEED_RING_PRELOAD_LEVEL
      }
    };
  }
  return {
    ...source,
    policy: source.policy ?? FEED_RING_SOURCE_POLICY,
    buffer: adaptiveBuffer ?? source.buffer,
    retention: {
      ...source.retention,
      preload: FEED_RING_PRELOAD_LEVEL
    }
  };
};
const isNativeFeedRingPlayer = value => Boolean(value && typeof value === 'object' && 'replaceCatalog' in value && 'commitViewport' in value);
export class NitroFeedRingPlayer {
  players = new Map();
  released = false;
  adaptiveEnabled = false;
  adaptiveDecision = 'low';
  adaptiveConfig = resolveAdaptiveQualityConfig();
  lastEstimate = null;
  lastCatalogState = null;
  lastNativeCatalogRevision = -1;
  constructor(nativeRingOrOptions, options) {
    if (isNativeFeedRingPlayer(nativeRingOrOptions)) {
      this.nativeRing = nativeRingOrOptions;
      this.configureAdaptiveState(options);
      return;
    }
    this.nativeRing = NitroFeedRingPlayerFactory.createRingPlayer();
    this.configureAdaptiveState(nativeRingOrOptions);
  }
  get isReleased() {
    return this.released;
  }
  replaceCatalog(state) {
    this.lastCatalogState = state;
    this.replaceNativeCatalog(state, false);
  }
  commitViewport(state) {
    this.nativeRing.commitViewport(state);
    this.updateAdaptiveDecision();
  }
  adaptiveSnapshot() {
    return {
      enabled: this.adaptiveEnabled,
      decision: this.adaptiveDecision,
      lastEstimate: this.lastEstimate,
      config: this.adaptiveConfig
    };
  }
  replaceNativeCatalog(state, forceNextRevision) {
    const adaptiveBuffer = this.adaptiveEnabled ? resolveAdaptiveFeedBuffer(this.adaptiveDecision, this.adaptiveConfig) : undefined;
    const catalog = {
      revision: this.resolveNativeCatalogRevision(state.revision, forceNextRevision),
      items: state.items.map(item => {
        const preparedSource = item.source ? prepareSource(normalizeFeedRingSourceInput(item.source, adaptiveBuffer)) : null;
        return {
          index: item.index,
          momentId: item.momentId ?? undefined,
          sourceKey: preparedSource ? buildFeedRingSourceKey(item.momentId, preparedSource.uri) : undefined,
          source: preparedSource ? toNativeSourceConfig(preparedSource) : undefined
        };
      })
    };
    this.nativeRing.replaceCatalog(catalog);
  }
  resolveNativeCatalogRevision(requestedRevision, forceNextRevision) {
    if (!this.adaptiveEnabled && !forceNextRevision) {
      this.lastNativeCatalogRevision = requestedRevision;
      return requestedRevision;
    }
    const nextRevision = Math.max(requestedRevision, this.lastNativeCatalogRevision + 1);
    this.lastNativeCatalogRevision = nextRevision;
    return nextRevision;
  }
  configureAdaptiveState(options) {
    this.adaptiveEnabled = options?.adaptiveQuality === true;
    this.adaptiveConfig = resolveAdaptiveQualityConfig(options?.adaptiveConfig);
    if (!this.adaptiveEnabled) {
      this.adaptiveDecision = 'low';
      this.lastEstimate = null;
    }
  }
  updateAdaptiveDecision() {
    if (!this.adaptiveEnabled || this.released) {
      return;
    }
    void streamCache.getNetworkThroughputEstimate().then(estimate => {
      if (!estimate || this.released) {
        return;
      }
      const previous = this.adaptiveDecision;
      const decision = resolveAdaptiveDecision({
        estimateBps: estimate.bps,
        samples: estimate.samples,
        previous,
        config: this.adaptiveConfig
      });
      this.lastEstimate = estimate;
      this.adaptiveDecision = decision;
      if (decision !== previous && this.lastCatalogState) {
        this.replaceNativeCatalog(this.lastCatalogState, true);
      }
    });
  }
  getSlotPlayer(slotId) {
    if (this.released) {
      return null;
    }
    const cached = this.players.get(slotId);
    if (cached) {
      return cached;
    }
    try {
      const nativePlayer = this.nativeRing.getPlayer(slotId);
      const player = NitroPlayer.__fromNativePlayer(nativePlayer);
      this.players.set(slotId, player);
      return player;
    } catch {
      return null;
    }
  }
  snapshot() {
    return this.nativeRing.snapshot();
  }
  addSlotStateListener(listener) {
    return this.nativeRing.addSlotStateListener(listener);
  }
  release() {
    this.released = true;
    this.players.clear();
    this.nativeRing.release();
  }
}
//# sourceMappingURL=NitroFeedRingPlayer.js.map