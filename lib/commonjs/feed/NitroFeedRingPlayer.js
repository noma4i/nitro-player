"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroFeedRingPlayer = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayer = require("../player/NitroPlayer.js");
var _prepareSource = require("../source/prepareSource.js");
var _adaptiveQuality = require("../source/adaptiveQuality.js");
var _streamCache = require("../streaming/streamCache.js");
const NitroFeedRingPlayerFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroFeedRingPlayerFactory');
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
const buildFeedRingCacheUriKey = (momentId, uri) => `${momentId ?? ''}|${uri}`;
const resolveAdaptiveFeedBufferOverride = (decision, config) => decision === 'high' ? {
  preferredPeakBitRate: config.highMaxBitrate
} : undefined;
const mergeFeedRingBufferOverride = (explicitBuffer, adaptiveBuffer) => {
  if (!adaptiveBuffer) {
    return explicitBuffer;
  }
  return {
    ...adaptiveBuffer,
    ...explicitBuffer
  };
};
const normalizeFeedRingSourceInput = (source, adaptiveBuffer) => {
  if ((0, _prepareSource.isPreparedSource)(source)) {
    return {
      uri: source.uri,
      headers: source.headers,
      metadata: source.metadata,
      startup: source.startup,
      buffer: mergeFeedRingBufferOverride(source.buffer, adaptiveBuffer),
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
    buffer: mergeFeedRingBufferOverride(source.buffer, adaptiveBuffer),
    retention: {
      ...source.retention,
      preload: FEED_RING_PRELOAD_LEVEL
    }
  };
};
const isNativeFeedRingPlayer = value => Boolean(value && typeof value === 'object' && 'replaceCatalog' in value && 'commitViewport' in value);
class NitroFeedRingPlayer {
  players = new Map();
  sourceObjectIds = new WeakMap();
  preparedCatalogItemCache = new Map();
  nextSourceObjectId = 1;
  released = false;
  adaptiveEnabled = false;
  adaptiveDecision = 'low';
  adaptiveConfig = (0, _adaptiveQuality.resolveAdaptiveQualityConfig)();
  adaptiveThroughputInFlight = false;
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
    const adaptiveVariant = this.adaptiveEnabled ? this.adaptiveDecision : undefined;
    const adaptiveBuffer = adaptiveVariant ? resolveAdaptiveFeedBufferOverride(adaptiveVariant, this.adaptiveConfig) : undefined;
    const nextCache = new Map();
    const currentItemIdentities = new Set();
    const catalog = {
      revision: this.resolveNativeCatalogRevision(state.revision, forceNextRevision),
      items: state.items.map(item => {
        const preparedItem = item.source ? this.resolvePreparedCatalogItem(item, adaptiveVariant, adaptiveBuffer, nextCache, currentItemIdentities) : null;
        return {
          index: item.index,
          momentId: item.momentId ?? undefined,
          sourceKey: preparedItem?.sourceKey,
          source: preparedItem?.nativeSource
        };
      })
    };
    this.retainPreparedCatalogEntries(currentItemIdentities, nextCache);
    this.preparedCatalogItemCache = nextCache;
    this.nativeRing.replaceCatalog(catalog);
  }
  resolvePreparedCatalogItem(item, variant, adaptiveBuffer, nextCache, currentItemIdentities) {
    if (!item.source) {
      return null;
    }
    const itemIdentityKey = this.resolveCatalogItemIdentityKey(item);
    currentItemIdentities.add(itemIdentityKey);
    const cacheKey = this.buildPreparedCatalogItemCacheKey(itemIdentityKey, variant);
    const cached = this.preparedCatalogItemCache.get(cacheKey);
    if (cached) {
      nextCache.set(cacheKey, cached);
      return cached;
    }
    const preparedSource = (0, _prepareSource.prepareSource)(normalizeFeedRingSourceInput(item.source, adaptiveBuffer));
    const entry = {
      itemIdentityKey,
      variant,
      preparedSource,
      nativeSource: (0, _prepareSource.toNativeSourceConfig)(preparedSource),
      sourceKey: buildFeedRingSourceKey(item.momentId, preparedSource.uri)
    };
    nextCache.set(cacheKey, entry);
    return entry;
  }
  retainPreparedCatalogEntries(currentItemIdentities, nextCache) {
    for (const [cacheKey, entry] of this.preparedCatalogItemCache) {
      if (currentItemIdentities.has(entry.itemIdentityKey) && this.isAllowedPreparedCatalogVariant(entry.variant)) {
        nextCache.set(cacheKey, entry);
      }
    }
  }
  isAllowedPreparedCatalogVariant(variant) {
    return this.adaptiveEnabled ? variant === 'low' || variant === 'high' : variant === undefined;
  }
  resolveCatalogItemIdentityKey(item) {
    const source = item.source;
    if (source && typeof source === 'object') {
      return `ref:${this.resolveSourceObjectId(source)}`;
    }
    if (typeof source === 'string') {
      return `uri:${buildFeedRingCacheUriKey(item.momentId, source)}`;
    }
    return `asset:${item.momentId ?? ''}|${String(source)}`;
  }
  resolveSourceObjectId(source) {
    const cached = this.sourceObjectIds.get(source);
    if (cached !== undefined) {
      return cached;
    }
    const next = this.nextSourceObjectId++;
    this.sourceObjectIds.set(source, next);
    return next;
  }
  buildPreparedCatalogItemCacheKey(itemIdentityKey, variant) {
    return `${itemIdentityKey}|variant:${variant ?? 'default'}`;
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
    this.adaptiveConfig = (0, _adaptiveQuality.resolveAdaptiveQualityConfig)(options?.adaptiveConfig);
    if (!this.adaptiveEnabled) {
      this.adaptiveDecision = 'low';
      this.lastEstimate = null;
    }
  }
  updateAdaptiveDecision() {
    if (!this.adaptiveEnabled || this.released || this.adaptiveThroughputInFlight) {
      return;
    }
    this.adaptiveThroughputInFlight = true;
    void _streamCache.streamCache.getNetworkThroughputEstimate().then(estimate => {
      if (!estimate || this.released) {
        return;
      }
      const previous = this.adaptiveDecision;
      const decision = (0, _adaptiveQuality.resolveAdaptiveDecision)({
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
    }).catch(() => undefined).finally(() => {
      this.adaptiveThroughputInFlight = false;
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
      const player = _NitroPlayer.NitroPlayer.__fromNativePlayer(nativePlayer);
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
exports.NitroFeedRingPlayer = NitroFeedRingPlayer;
//# sourceMappingURL=NitroFeedRingPlayer.js.map