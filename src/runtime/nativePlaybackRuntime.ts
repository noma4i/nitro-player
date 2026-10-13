import { NitroModules } from 'react-native-nitro-modules';
import type { NitroCacheStats, NitroPlaybackRuntime } from '../bridge/nitro/NitroPlaybackRuntime.nitro';
import { feedRingHostArbiter } from '../feed/FeedRingHostArbiter';
import { prepareSource } from '../source/prepareSource';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';

const nitroPlaybackRuntime = NitroModules.createHybridObject<NitroPlaybackRuntime>('NitroPlaybackRuntime');
nitroPlaybackRuntime.resetClientSuspensions();
let nextSuspensionId = 0;

const MINIMUM_NITRO_PLAYBACK_CACHE_BYTES = 64 * 1024 * 1024;

export type NitroPlaybackCacheConfig = Readonly<{
  maxBytes: number;
}>;

type NitroPlaybackRuntimeDebugSuspension = Readonly<{
  token: number;
  reason: string;
  allowGroups: readonly string[] | null;
}>;

type NitroPlaybackRuntimeDebugSession = Readonly<{
  key: string;
  leaseId: number;
  group: string;
  priority: number;
  resume: 'automatic' | 'manual';
  intent: 'play' | 'idle';
  intentSequence: number;
  effectiveState: 'playing' | 'paused';
}>;

type NitroPlaybackRuntimeDebugPlayer = Readonly<{
  isRingSlot: boolean;
}>;

type NitroPlaybackRuntimeDebugSnapshot = Readonly<{
  foreground: boolean;
  activeLeaseId: number | null;
  revision: number;
  audioSession: Readonly<{
    active: boolean;
    foreign: boolean;
    appliedProfile: string | null;
    lastApplyError: string | null;
    recoveryCount: number;
    applyCount: number;
  }>;
  suspensions: readonly NitroPlaybackRuntimeDebugSuspension[];
  sessions: readonly NitroPlaybackRuntimeDebugSession[];
  players: readonly NitroPlaybackRuntimeDebugPlayer[];
}>;

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const runtime = globalThis as typeof globalThis & {
    __NITRO_PLAY_RUNTIME_DIAGNOSTICS__?: {
      snapshot: () => NitroPlaybackRuntimeDebugSnapshot;
    };
  };
  runtime.__NITRO_PLAY_RUNTIME_DIAGNOSTICS__ = {
    snapshot: () => JSON.parse(nitroPlaybackRuntime.debugSnapshot()) as NitroPlaybackRuntimeDebugSnapshot
  };
}

export type NitroPlaybackSubscription = Readonly<{
  remove(): void;
}>;

export type NitroPlaybackSuspension = Readonly<{
  release(): void;
}>;

export type { NitroCacheStats } from '../bridge/nitro/NitroPlaybackRuntime.nitro';

export const acquireExternalAudioSession = (): Readonly<{ token: number; release(): void }> => {
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

export const addNitroOutputDeviceLostListener = (listener: () => void): NitroPlaybackSubscription => nitroPlaybackRuntime.addOnOutputDeviceLostListener(listener);

export const addNitroForegroundListener = (listener: () => void): NitroPlaybackSubscription => nitroPlaybackRuntime.addOnForegroundListener(listener);

export const addNitroPrefetchSettledListener = (listener: (uri: string) => void): NitroPlaybackSubscription => nitroPlaybackRuntime.addOnPrefetchSettledListener(listener);

export const getNitroPlaybackCacheStats = (): Promise<NitroCacheStats> => nitroPlaybackRuntime.getCacheStats();

export const clearNitroPlaybackCache = (): Promise<void> => nitroPlaybackRuntime.clearCache();

/** Configures the HLS disk cache before the first cache operation, prefetch, or playback. */
export const configureNitroPlaybackCache = ({ maxBytes }: NitroPlaybackCacheConfig): void => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < MINIMUM_NITRO_PLAYBACK_CACHE_BYTES) {
    throw new RangeError(`Nitro playback cache maxBytes must be an integer of at least ${MINIMUM_NITRO_PLAYBACK_CACHE_BYTES}`);
  }

  nitroPlaybackRuntime.configureCache(maxBytes);
};

export const prefetchNitroPlaybackSource = (source: NitroSourceInput, options?: { durationSeconds?: number }): void => {
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

export const cancelNitroPlaybackPrefetch = (source: NitroSourceInput): void => {
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

export const suspendNitroPlayback = (reason: string, allowGroups?: readonly string[]): NitroPlaybackSuspension => {
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

export const resetNitroPlayback = (): void => {
  nitroPlaybackRuntime.stopAll();
  nitroPlaybackRuntime.resetClientSuspensions();
  feedRingHostArbiter.releaseAll();
};
