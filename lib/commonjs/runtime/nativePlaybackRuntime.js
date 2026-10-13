"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.suspendNitroPlayback = exports.resetNitroPlayback = exports.prefetchNitroPlaybackSource = exports.getNitroPlaybackCacheStats = exports.configureNitroPlaybackCache = exports.clearNitroPlaybackCache = exports.cancelNitroPlaybackPrefetch = exports.addNitroPrefetchSettledListener = exports.addNitroOutputDeviceLostListener = exports.addNitroForegroundListener = exports.acquireExternalAudioSession = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _FeedRingHostArbiter = require("../feed/FeedRingHostArbiter.js");
var _prepareSource = require("../source/prepareSource.js");
const nitroPlaybackRuntime = _reactNativeNitroModules.NitroModules.createHybridObject('NitroPlaybackRuntime');
nitroPlaybackRuntime.resetClientSuspensions();
let nextSuspensionId = 0;
const MINIMUM_NITRO_PLAYBACK_CACHE_BYTES = 64 * 1024 * 1024;
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const runtime = globalThis;
  runtime.__NITRO_PLAY_RUNTIME_DIAGNOSTICS__ = {
    snapshot: () => JSON.parse(nitroPlaybackRuntime.debugSnapshot())
  };
}
const acquireExternalAudioSession = () => {
  const token = nitroPlaybackRuntime.beginExternalAudioSession();
  let released = false;
  return {
    token,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      nitroPlaybackRuntime.endExternalAudioSession(token);
    }
  };
};
exports.acquireExternalAudioSession = acquireExternalAudioSession;
const addNitroOutputDeviceLostListener = listener => nitroPlaybackRuntime.addOnOutputDeviceLostListener(listener);
exports.addNitroOutputDeviceLostListener = addNitroOutputDeviceLostListener;
const addNitroForegroundListener = listener => nitroPlaybackRuntime.addOnForegroundListener(listener);
exports.addNitroForegroundListener = addNitroForegroundListener;
const addNitroPrefetchSettledListener = listener => nitroPlaybackRuntime.addOnPrefetchSettledListener(listener);
exports.addNitroPrefetchSettledListener = addNitroPrefetchSettledListener;
const getNitroPlaybackCacheStats = () => nitroPlaybackRuntime.getCacheStats();
exports.getNitroPlaybackCacheStats = getNitroPlaybackCacheStats;
const clearNitroPlaybackCache = () => nitroPlaybackRuntime.clearCache();

/** Configures the HLS disk cache before the first cache operation, prefetch, or playback. */
exports.clearNitroPlaybackCache = clearNitroPlaybackCache;
const configureNitroPlaybackCache = ({
  maxBytes
}) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < MINIMUM_NITRO_PLAYBACK_CACHE_BYTES) {
    throw new RangeError(`Nitro playback cache maxBytes must be an integer of at least ${MINIMUM_NITRO_PLAYBACK_CACHE_BYTES}`);
  }
  nitroPlaybackRuntime.configureCache(maxBytes);
};
exports.configureNitroPlaybackCache = configureNitroPlaybackCache;
const prefetchNitroPlaybackSource = (source, options) => {
  try {
    const preparedSource = (0, _prepareSource.prepareSource)(source);
    if (!/^https?:\/\//i.test(preparedSource.uri)) {
      return;
    }
    nitroPlaybackRuntime.prefetchSource(preparedSource.uri, preparedSource.headers, options?.durationSeconds);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('Nitro playback prefetch failed', error);
    }
  }
};
exports.prefetchNitroPlaybackSource = prefetchNitroPlaybackSource;
const cancelNitroPlaybackPrefetch = source => {
  try {
    const preparedSource = (0, _prepareSource.prepareSource)(source);
    if (!/^https?:\/\//i.test(preparedSource.uri)) {
      return;
    }
    nitroPlaybackRuntime.cancelPrefetch(preparedSource.uri, preparedSource.headers);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('Nitro playback prefetch cancellation failed', error);
    }
  }
};
exports.cancelNitroPlaybackPrefetch = cancelNitroPlaybackPrefetch;
const suspendNitroPlayback = (reason, allowGroups) => {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new TypeError('Nitro playback suspension reason is required');
  }
  const key = `nitro-suspension:${++nextSuspensionId}:${normalizedReason}`;
  const copiedAllowGroups = allowGroups ? [...allowGroups] : undefined;
  nitroPlaybackRuntime.setSuspended(key, true, copiedAllowGroups);
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      nitroPlaybackRuntime.setSuspended(key, false);
    }
  };
};
exports.suspendNitroPlayback = suspendNitroPlayback;
const resetNitroPlayback = () => {
  nitroPlaybackRuntime.stopAll();
  nitroPlaybackRuntime.resetClientSuspensions();
  _FeedRingHostArbiter.feedRingHostArbiter.releaseAll();
};
exports.resetNitroPlayback = resetNitroPlayback;
//# sourceMappingURL=nativePlaybackRuntime.js.map