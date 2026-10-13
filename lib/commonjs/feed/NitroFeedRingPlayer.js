"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroFeedRingPlayer = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayer = require("../player/NitroPlayer.js");
var _prepareSource = require("../source/prepareSource.js");
const assertSafeInteger = (value, field) => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Feed ring ${field} must be a safe integer: ${value}`);
  }
};
const NitroFeedRingPlayerFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroFeedRingPlayerFactory');
const FEED_RING_SOURCE_POLICY = 'feed';
const FEED_RING_PRELOAD_LEVEL = 'buffered';
const FEED_RING_OFFSCREEN_RETENTION = 'hot';
const FEED_RING_STARTUP = 'eager';
const normalizeFeedRingSourceInput = source => {
  if ((0, _prepareSource.isPreparedSource)(source)) {
    return {
      uri: source.uri,
      headers: source.headers,
      startup: FEED_RING_STARTUP,
      buffer: source.buffer,
      retention: {
        ...source.retention,
        preload: FEED_RING_PRELOAD_LEVEL,
        offscreen: FEED_RING_OFFSCREEN_RETENTION
      },
      transport: source.transport,
      policy: source.policy
    };
  }
  if (typeof source === 'string' || typeof source === 'number') {
    return {
      uri: source,
      startup: FEED_RING_STARTUP,
      policy: FEED_RING_SOURCE_POLICY,
      retention: {
        preload: FEED_RING_PRELOAD_LEVEL,
        offscreen: FEED_RING_OFFSCREEN_RETENTION
      }
    };
  }
  return {
    ...source,
    startup: FEED_RING_STARTUP,
    policy: source.policy ?? FEED_RING_SOURCE_POLICY,
    buffer: source.buffer,
    retention: {
      ...source.retention,
      preload: FEED_RING_PRELOAD_LEVEL,
      offscreen: FEED_RING_OFFSCREEN_RETENTION
    }
  };
};
const isNativeFeedRingPlayer = value => Boolean(value && typeof value === 'object' && 'applyProjection' in value);
class NitroFeedRingPlayer {
  players = new Map();
  released = false;
  constructor(nativeRingOrOptions, options) {
    const resolvedOptions = isNativeFeedRingPlayer(nativeRingOrOptions) ? options : nativeRingOrOptions;
    if (!resolvedOptions) {
      throw new TypeError('NitroFeedRingPlayer options are required');
    }
    if (isNativeFeedRingPlayer(nativeRingOrOptions)) {
      this.nativeRing = nativeRingOrOptions;
    } else {
      this.nativeRing = NitroFeedRingPlayerFactory.createRingPlayer();
    }
    this.nativeRing.configurePlayback(resolvedOptions.playbackKey, resolvedOptions.policy.group, resolvedOptions.policy.priority, resolvedOptions.policy.resume === 'automatic');
  }
  get isReleased() {
    return this.released;
  }
  get ringToken() {
    return this.nativeRing.ringToken;
  }
  applyProjection(state) {
    assertSafeInteger(state.revision, 'revision');
    assertSafeInteger(state.activationId, 'activationId');
    assertSafeInteger(state.windowCenterIndex, 'windowCenterIndex');
    assertSafeInteger(state.playbackIndex, 'playbackIndex');
    if (Math.abs(state.playbackIndex - state.windowCenterIndex) > 1) {
      throw new RangeError(`Feed ring playbackIndex must belong to the prepared window: ${state.playbackIndex}`);
    }
    const catalog = state.catalog ? {
      revision: state.catalog.revision,
      items: this.mapNativeCatalogItems(state.catalog.items)
    } : undefined;
    this.nativeRing.applyProjection({
      ...state,
      catalog
    });
  }
  mapNativeCatalogItems(items) {
    return items.flatMap(item => {
      try {
        assertSafeInteger(item.index, 'catalog.index');
        const preparedSource = item.source ? (0, _prepareSource.prepareSource)(normalizeFeedRingSourceInput(item.source)) : null;
        return [{
          index: item.index,
          itemId: item.itemId ?? undefined,
          sourceKey: preparedSource?.identity.playbackKey,
          source: preparedSource ? (0, _prepareSource.toNativeSourceConfig)(preparedSource) : undefined
        }];
      } catch (error) {
        console.warn('[NitroFeedRingPlayer] Skipping invalid catalog item', item.index, error);
        return [];
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
  addCommandEventListener(listener) {
    return this.nativeRing.addCommandEventListener(listener);
  }
  release() {
    this.released = true;
    this.players.clear();
    this.nativeRing.release();
  }
}
exports.NitroFeedRingPlayer = NitroFeedRingPlayer;
//# sourceMappingURL=NitroFeedRingPlayer.js.map