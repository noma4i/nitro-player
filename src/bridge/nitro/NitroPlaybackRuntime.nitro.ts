import type { HybridObject } from 'react-native-nitro-modules';
import type { ListenerSubscription } from './NitroPlayerEventEmitter.nitro';

export interface NitroCacheStats {
  totalBytes: number;
  fileCount: number;
  maxBytes: number;
}

export interface NitroPlaybackRuntime extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  debugSnapshot(): string;
  beginExternalAudioSession(): number;
  endExternalAudioSession(token: number): void;
  setSuspended(key: string, suspended: boolean, allowGroups?: string[]): void;
  resetClientSuspensions(): void;
  stopAll(): void;
  configureCache(maxBytes: number): void;
  prefetchSource(uri: string, headers?: Record<string, string>, durationSeconds?: number): void;
  cancelPrefetch(uri: string, headers?: Record<string, string>): void;
  getCacheStats(): Promise<NitroCacheStats>;
  clearCache(): Promise<void>;
  addOnPrefetchSettledListener(listener: (uri: string) => void): ListenerSubscription;
  addOnOutputDeviceLostListener(listener: () => void): ListenerSubscription;
  addOnForegroundListener(listener: () => void): ListenerSubscription;
}
