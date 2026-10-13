"use strict";

import { NitroModules } from 'react-native-nitro-modules';
import { feedRingHostArbiter } from "../feed/FeedRingHostArbiter.js";
import { prepareSource } from "../source/prepareSource.js";
const nitroPlaybackRuntime = NitroModules.createHybridObject('NitroPlaybackRuntime');
nitroPlaybackRuntime.resetClientSuspensions();
let nextSuspensionId = 0;
const MINIMUM_NITRO_PLAYBACK_CACHE_BYTES = 64 * 1024 * 1024;
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const runtime = globalThis;
  runtime.__NITRO_PLAY_RUNTIME_DIAGNOSTICS__ = {
    snapshot: () => JSON.parse(nitroPlaybackRuntime.debugSnapshot())
  };
}
export const acquireExternalAudioSession = () => {
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
export const addNitroOutputDeviceLostListener = listener => nitroPlaybackRuntime.addOnOutputDeviceLostListener(listener);
export const addNitroForegroundListener = listener => nitroPlaybackRuntime.addOnForegroundListener(listener);
export const addNitroPrefetchSettledListener = listener => nitroPlaybackRuntime.addOnPrefetchSettledListener(listener);
export const getNitroPlaybackCacheStats = () => nitroPlaybackRuntime.getCacheStats();
export const clearNitroPlaybackCache = () => nitroPlaybackRuntime.clearCache();

/** Configures the HLS disk cache before the first cache operation, prefetch, or playback. */
export const configureNitroPlaybackCache = ({
  maxBytes
}) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < MINIMUM_NITRO_PLAYBACK_CACHE_BYTES) {
    throw new RangeError(`Nitro playback cache maxBytes must be an integer of at least ${MINIMUM_NITRO_PLAYBACK_CACHE_BYTES}`);
  }
  nitroPlaybackRuntime.configureCache(maxBytes);
};
export const prefetchNitroPlaybackSource = (source, options) => {
  try {
    const preparedSource = prepareSource(source);
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
export const cancelNitroPlaybackPrefetch = source => {
  try {
    const preparedSource = prepareSource(source);
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
export const suspendNitroPlayback = (reason, allowGroups) => {
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
export const resetNitroPlayback = () => {
  nitroPlaybackRuntime.stopAll();
  nitroPlaybackRuntime.resetClientSuspensions();
  feedRingHostArbiter.releaseAll();
};
//# sourceMappingURL=nativePlaybackRuntime.js.map