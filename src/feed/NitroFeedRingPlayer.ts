import { NitroModules } from 'react-native-nitro-modules';
import type {
  FeedRingCatalogItem,
  FeedRingCommandEvent,
  FeedRingSlotState,
  NitroFeedRingPlayer as NativeNitroFeedRingPlayer,
  NitroFeedRingPlayerFactory as NativeNitroFeedRingPlayerFactory
} from '../bridge/nitro/NitroFeedRingPlayer.nitro';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import { NitroPlayer } from '../player/NitroPlayer';
import { isPreparedSource, prepareSource, toNativeSourceConfig } from '../source/prepareSource';
import type { NitroSourceConfig, NitroSourceInput } from '../source/types/NitroPlayerConfig';
import type { NitroPlaybackPolicy } from '../surface/NitroPlaybackPolicy';

const assertSafeInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Feed ring ${field} must be a safe integer: ${value}`);
  }
};

export type NitroFeedRingSlotId = 0 | 1 | 2;

export interface NitroFeedRingCatalogItem {
  index: number;
  itemId?: string | null;
  source?: NitroSourceInput | null;
}

export interface NitroFeedRingSlotSnapshot {
  slotId: NitroFeedRingSlotId;
  assignedIndex?: number;
  itemId?: string;
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
  windowCenterIndex?: number;
  playbackIndex?: number;
  playbackAllowed: boolean;
  muted: boolean;
  released: boolean;
  slots: NitroFeedRingSlotSnapshot[];
}

export interface NitroFeedRingPlayerOptions {
  playbackKey: string;
  policy: NitroPlaybackPolicy;
}

const NitroFeedRingPlayerFactory = NitroModules.createHybridObject<NativeNitroFeedRingPlayerFactory>('NitroFeedRingPlayerFactory');

const FEED_RING_SOURCE_POLICY: NitroSourceConfig['policy'] = 'feed';
const FEED_RING_PRELOAD_LEVEL: NonNullable<NitroSourceConfig['retention']>['preload'] = 'buffered';
const FEED_RING_OFFSCREEN_RETENTION: NonNullable<NitroSourceConfig['retention']>['offscreen'] = 'hot';
const FEED_RING_STARTUP: NonNullable<NitroSourceConfig['startup']> = 'eager';

const normalizeFeedRingSourceInput = (source: NitroSourceInput): NitroSourceConfig => {
  if (isPreparedSource(source)) {
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
      retention: { preload: FEED_RING_PRELOAD_LEVEL, offscreen: FEED_RING_OFFSCREEN_RETENTION }
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

const isNativeFeedRingPlayer = (value: unknown): value is NativeNitroFeedRingPlayer => Boolean(value && typeof value === 'object' && 'applyProjection' in value);

export class NitroFeedRingPlayer {
  private readonly nativeRing: NativeNitroFeedRingPlayer;
  private readonly players = new Map<NitroFeedRingSlotId, NitroPlayer>();
  private released = false;

  constructor(options: NitroFeedRingPlayerOptions);
  constructor(nativeRing: NativeNitroFeedRingPlayer, options: NitroFeedRingPlayerOptions);
  constructor(nativeRingOrOptions?: NativeNitroFeedRingPlayer | NitroFeedRingPlayerOptions, options?: NitroFeedRingPlayerOptions) {
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

  get isReleased(): boolean {
    return this.released;
  }

  get ringToken(): number {
    return this.nativeRing.ringToken;
  }

  applyProjection(state: {
    revision: number;
    activationId: number;
    catalog?: { revision: number; items: readonly NitroFeedRingCatalogItem[] };
    windowCenterIndex: number;
    playbackIndex: number;
    playbackAllowed: boolean;
    muted: boolean;
  }): void {
    assertSafeInteger(state.revision, 'revision');
    assertSafeInteger(state.activationId, 'activationId');
    assertSafeInteger(state.windowCenterIndex, 'windowCenterIndex');
    assertSafeInteger(state.playbackIndex, 'playbackIndex');
    if (Math.abs(state.playbackIndex - state.windowCenterIndex) > 1) {
      throw new RangeError(`Feed ring playbackIndex must belong to the prepared window: ${state.playbackIndex}`);
    }
    const catalog = state.catalog
      ? {
          revision: state.catalog.revision,
          items: this.mapNativeCatalogItems(state.catalog.items)
        }
      : undefined;
    this.nativeRing.applyProjection({ ...state, catalog });
  }

  private mapNativeCatalogItems(items: readonly NitroFeedRingCatalogItem[]): FeedRingCatalogItem[] {
    return items.flatMap(item => {
      try {
        assertSafeInteger(item.index, 'catalog.index');
        const preparedSource = item.source ? prepareSource(normalizeFeedRingSourceInput(item.source)) : null;
        return [
          {
            index: item.index,
            itemId: item.itemId ?? undefined,
            sourceKey: preparedSource?.identity.playbackKey,
            source: preparedSource ? toNativeSourceConfig(preparedSource) : undefined
          }
        ];
      } catch (error) {
        console.warn('[NitroFeedRingPlayer] Skipping invalid catalog item', item.index, error);
        return [];
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

  addCommandEventListener(listener: (event: FeedRingCommandEvent) => void): ListenerSubscription {
    return this.nativeRing.addCommandEventListener(listener);
  }

  release(): void {
    this.released = true;
    this.players.clear();
    this.nativeRing.release();
  }
}
