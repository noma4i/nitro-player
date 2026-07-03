import { NitroModules } from 'react-native-nitro-modules';
import type {
  FeedRingSlotState,
  NitroFeedRingPlayer as NativeNitroFeedRingPlayer,
  NitroFeedRingPlayerFactory as NativeNitroFeedRingPlayerFactory
} from '../bridge/nitro/NitroFeedRingPlayer.nitro';
import type { BufferConfig } from '../player/types/BufferConfig';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import { NitroPlayer } from '../player/NitroPlayer';
import { isPreparedSource, prepareSource, toNativeSourceConfig } from '../source/prepareSource';
import type { AdaptiveQualityConfig, AdaptiveQualityDecision, ResolvedAdaptiveQualityConfig } from '../source/adaptiveQuality';
import { resolveAdaptiveDecision, resolveAdaptiveQualityConfig } from '../source/adaptiveQuality';
import { resolveSourcePolicyDefaults } from '../source/sourcePolicy';
import type { NitroSourceConfig, NitroSourceInput } from '../source/types/NitroPlayerConfig';
import { streamCache } from '../streaming/streamCache';
import type { StreamNetworkThroughputEstimate } from '../streaming/types';

export type NitroFeedRingSlotId = 0 | 1 | 2;

export interface NitroFeedRingCatalogItem {
  index: number;
  momentId?: string | null;
  source?: NitroSourceInput | null;
}

export interface NitroFeedRingCatalogState {
  revision: number;
  items: NitroFeedRingCatalogItem[];
}

export interface NitroFeedRingViewportState {
  revision: number;
  centerIndex: number;
  playbackAllowed: boolean;
  muted: boolean;
}

export interface NitroFeedRingSlotSnapshot {
  slotId: NitroFeedRingSlotId;
  assignedIndex?: number;
  momentId?: string;
  sourceKey?: string;
  generation: number;
  desiredPlay: boolean;
  attached: boolean;
  prepared: boolean;
  ready: boolean;
  playing: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  bufferDuration?: number;
  bufferedPosition?: number;
  rate?: number;
  wantsToPlay?: boolean;
  retentionState?: string;
  hasLoadedSource?: boolean;
  watchdogAttempts?: number;
  watchdogPending?: boolean;
  nativePlaybackState?: string;
  status?: string;
  lastTransition: string;
  lastError?: string;
}

export interface NitroFeedRingSnapshot {
  catalogRevision: number;
  viewportRevision: number;
  catalogSize: number;
  centerIndex?: number;
  playbackAllowed: boolean;
  muted: boolean;
  released: boolean;
  slots: NitroFeedRingSlotSnapshot[];
}

export interface NitroFeedRingPlayerOptions {
  /**
   * Enables CDN-throughput based feed quality decisions. Defaults off, so feed
   * sources stay on the configured feed policy cap. Android currently returns
   * no throughput estimate, so the decision remains low there.
   *
   * Decision updates apply to subsequent source attaches. The currently playing
   * item is not mutated mid-play.
   */
  adaptiveQuality?: boolean;
  adaptiveConfig?: AdaptiveQualityConfig;
}

export interface NitroFeedRingAdaptiveSnapshot {
  enabled: boolean;
  decision: AdaptiveQualityDecision;
  lastEstimate: StreamNetworkThroughputEstimate | null;
  config: ResolvedAdaptiveQualityConfig;
}

const NitroFeedRingPlayerFactory = NitroModules.createHybridObject<NativeNitroFeedRingPlayerFactory>('NitroFeedRingPlayerFactory');

const FEED_RING_SOURCE_POLICY: NitroSourceConfig['policy'] = 'feed';
const FEED_RING_PRELOAD_LEVEL: NonNullable<NitroSourceConfig['retention']>['preload'] = 'buffered';

const stripVolatileUriParts = (uri: string): string => {
  const queryIndex = uri.indexOf('?');
  const fragmentIndex = uri.indexOf('#');
  const endIndexCandidates = [queryIndex, fragmentIndex].filter(index => index >= 0);
  const endIndex = endIndexCandidates.length > 0 ? Math.min(...endIndexCandidates) : uri.length;
  return uri.slice(0, endIndex);
};

const buildFeedRingSourceKey = (momentId: string | null | undefined, uri: string): string => `${momentId ?? ''}|${stripVolatileUriParts(uri)}`;

const resolveAdaptiveFeedBuffer = (decision: AdaptiveQualityDecision, config: ResolvedAdaptiveQualityConfig): BufferConfig => {
  const policyBuffer = resolveSourcePolicyDefaults(FEED_RING_SOURCE_POLICY).buffer ?? {};
  return {
    ...policyBuffer,
    preferredPeakBitRate: decision === 'high' ? config.highMaxBitrate : policyBuffer.preferredPeakBitRate
  };
};

const normalizeFeedRingSourceInput = (source: NitroSourceInput, adaptiveBuffer?: BufferConfig): NitroSourceConfig => {
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
      retention: { preload: FEED_RING_PRELOAD_LEVEL }
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

const isNativeFeedRingPlayer = (value: unknown): value is NativeNitroFeedRingPlayer =>
  Boolean(value && typeof value === 'object' && 'replaceCatalog' in value && 'commitViewport' in value);

export class NitroFeedRingPlayer {
  private readonly nativeRing: NativeNitroFeedRingPlayer;
  private readonly players = new Map<NitroFeedRingSlotId, NitroPlayer>();
  private released = false;
  private adaptiveEnabled = false;
  private adaptiveDecision: AdaptiveQualityDecision = 'low';
  private adaptiveConfig: ResolvedAdaptiveQualityConfig = resolveAdaptiveQualityConfig();
  private lastEstimate: StreamNetworkThroughputEstimate | null = null;
  private lastCatalogState: NitroFeedRingCatalogState | null = null;
  private lastNativeCatalogRevision = -1;

  constructor(options?: NitroFeedRingPlayerOptions);
  constructor(nativeRing?: NativeNitroFeedRingPlayer, options?: NitroFeedRingPlayerOptions);
  constructor(nativeRingOrOptions?: NativeNitroFeedRingPlayer | NitroFeedRingPlayerOptions, options?: NitroFeedRingPlayerOptions) {
    if (isNativeFeedRingPlayer(nativeRingOrOptions)) {
      this.nativeRing = nativeRingOrOptions;
      this.configureAdaptiveState(options);
      return;
    }

    this.nativeRing = NitroFeedRingPlayerFactory.createRingPlayer();
    this.configureAdaptiveState(nativeRingOrOptions);
  }

  get isReleased(): boolean {
    return this.released;
  }

  replaceCatalog(state: NitroFeedRingCatalogState): void {
    this.lastCatalogState = state;
    this.replaceNativeCatalog(state, false);
  }

  commitViewport(state: NitroFeedRingViewportState): void {
    this.nativeRing.commitViewport(state);
    this.updateAdaptiveDecision();
  }

  adaptiveSnapshot(): NitroFeedRingAdaptiveSnapshot {
    return {
      enabled: this.adaptiveEnabled,
      decision: this.adaptiveDecision,
      lastEstimate: this.lastEstimate,
      config: this.adaptiveConfig
    };
  }

  private replaceNativeCatalog(state: NitroFeedRingCatalogState, forceNextRevision: boolean): void {
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

  private resolveNativeCatalogRevision(requestedRevision: number, forceNextRevision: boolean): number {
    if (!this.adaptiveEnabled && !forceNextRevision) {
      this.lastNativeCatalogRevision = requestedRevision;
      return requestedRevision;
    }

    const nextRevision = Math.max(requestedRevision, this.lastNativeCatalogRevision + 1);
    this.lastNativeCatalogRevision = nextRevision;
    return nextRevision;
  }

  private configureAdaptiveState(options?: NitroFeedRingPlayerOptions): void {
    this.adaptiveEnabled = options?.adaptiveQuality === true;
    this.adaptiveConfig = resolveAdaptiveQualityConfig(options?.adaptiveConfig);
    if (!this.adaptiveEnabled) {
      this.adaptiveDecision = 'low';
      this.lastEstimate = null;
    }
  }

  private updateAdaptiveDecision(): void {
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

  getSlotPlayer(slotId: NitroFeedRingSlotId): NitroPlayer | null {
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

  snapshot(): NitroFeedRingSnapshot {
    return this.nativeRing.snapshot() as NitroFeedRingSnapshot;
  }

  addSlotStateListener(listener: (state: FeedRingSlotState) => void): ListenerSubscription {
    return this.nativeRing.addSlotStateListener(listener);
  }

  release(): void {
    this.released = true;
    this.players.clear();
    this.nativeRing.release();
  }
}
