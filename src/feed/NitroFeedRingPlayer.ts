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
   * Adaptive buffer precedence is item explicit buffer fields, then the adaptive
   * decision, then the selected source policy defaults. Explicit item
   * `preferredPeakBitRate` is never overwritten by adaptive quality.
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

type CatalogCacheVariant = AdaptiveQualityDecision | undefined;
type PreparedCatalogItemCacheEntry = {
  itemIdentityKey: string;
  variant: CatalogCacheVariant;
  preparedSource: ReturnType<typeof prepareSource>;
  nativeSource: ReturnType<typeof toNativeSourceConfig>;
  sourceKey: string;
};

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

const buildFeedRingCacheUriKey = (momentId: string | null | undefined, uri: string): string => `${momentId ?? ''}|${uri}`;

const resolveAdaptiveFeedBufferOverride = (decision: AdaptiveQualityDecision, config: ResolvedAdaptiveQualityConfig): BufferConfig | undefined =>
  decision === 'high'
    ? {
        preferredPeakBitRate: config.highMaxBitrate
      }
    : undefined;

const mergeFeedRingBufferOverride = (explicitBuffer: BufferConfig | undefined, adaptiveBuffer: BufferConfig | undefined): BufferConfig | undefined => {
  if (!adaptiveBuffer) {
    return explicitBuffer;
  }
  return {
    ...adaptiveBuffer,
    ...explicitBuffer
  };
};

const normalizeFeedRingSourceInput = (source: NitroSourceInput, adaptiveBuffer?: BufferConfig): NitroSourceConfig => {
  if (isPreparedSource(source)) {
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
      retention: { preload: FEED_RING_PRELOAD_LEVEL }
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

const isNativeFeedRingPlayer = (value: unknown): value is NativeNitroFeedRingPlayer =>
  Boolean(value && typeof value === 'object' && 'replaceCatalog' in value && 'commitViewport' in value);

export class NitroFeedRingPlayer {
  private readonly nativeRing: NativeNitroFeedRingPlayer;
  private readonly players = new Map<NitroFeedRingSlotId, NitroPlayer>();
  private readonly sourceObjectIds = new WeakMap<object, number>();
  private preparedCatalogItemCache = new Map<string, PreparedCatalogItemCacheEntry>();
  private nextSourceObjectId = 1;
  private released = false;
  private adaptiveEnabled = false;
  private adaptiveDecision: AdaptiveQualityDecision = 'low';
  private adaptiveConfig: ResolvedAdaptiveQualityConfig = resolveAdaptiveQualityConfig();
  private adaptiveThroughputInFlight = false;
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
    const adaptiveVariant: CatalogCacheVariant = this.adaptiveEnabled ? this.adaptiveDecision : undefined;
    const adaptiveBuffer = adaptiveVariant ? resolveAdaptiveFeedBufferOverride(adaptiveVariant, this.adaptiveConfig) : undefined;
    const nextCache = new Map<string, PreparedCatalogItemCacheEntry>();
    const currentItemIdentities = new Set<string>();
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

  private resolvePreparedCatalogItem(
    item: NitroFeedRingCatalogItem,
    variant: CatalogCacheVariant,
    adaptiveBuffer: BufferConfig | undefined,
    nextCache: Map<string, PreparedCatalogItemCacheEntry>,
    currentItemIdentities: Set<string>
  ): PreparedCatalogItemCacheEntry | null {
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

    const preparedSource = prepareSource(normalizeFeedRingSourceInput(item.source, adaptiveBuffer));
    const entry: PreparedCatalogItemCacheEntry = {
      itemIdentityKey,
      variant,
      preparedSource,
      nativeSource: toNativeSourceConfig(preparedSource),
      sourceKey: buildFeedRingSourceKey(item.momentId, preparedSource.uri)
    };
    nextCache.set(cacheKey, entry);
    return entry;
  }

  private retainPreparedCatalogEntries(currentItemIdentities: Set<string>, nextCache: Map<string, PreparedCatalogItemCacheEntry>): void {
    for (const [cacheKey, entry] of this.preparedCatalogItemCache) {
      if (currentItemIdentities.has(entry.itemIdentityKey) && this.isAllowedPreparedCatalogVariant(entry.variant)) {
        nextCache.set(cacheKey, entry);
      }
    }
  }

  private isAllowedPreparedCatalogVariant(variant: CatalogCacheVariant): boolean {
    return this.adaptiveEnabled ? variant === 'low' || variant === 'high' : variant === undefined;
  }

  private resolveCatalogItemIdentityKey(item: NitroFeedRingCatalogItem): string {
    const source = item.source;
    if (source && typeof source === 'object') {
      return `ref:${this.resolveSourceObjectId(source)}`;
    }
    if (typeof source === 'string') {
      return `uri:${buildFeedRingCacheUriKey(item.momentId, source)}`;
    }
    return `asset:${item.momentId ?? ''}|${String(source)}`;
  }

  private resolveSourceObjectId(source: object): number {
    const cached = this.sourceObjectIds.get(source);
    if (cached !== undefined) {
      return cached;
    }

    const next = this.nextSourceObjectId++;
    this.sourceObjectIds.set(source, next);
    return next;
  }

  private buildPreparedCatalogItemCacheKey(itemIdentityKey: string, variant: CatalogCacheVariant): string {
    return `${itemIdentityKey}|variant:${variant ?? 'default'}`;
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
    if (!this.adaptiveEnabled || this.released || this.adaptiveThroughputInFlight) {
      return;
    }

    this.adaptiveThroughputInFlight = true;
    void streamCache
      .getNetworkThroughputEstimate()
      .then(estimate => {
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
      })
      .catch(() => undefined)
      .finally(() => {
        this.adaptiveThroughputInFlight = false;
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
