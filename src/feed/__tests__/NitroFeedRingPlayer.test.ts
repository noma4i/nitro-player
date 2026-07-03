const createNativePlayer = () => ({
  eventEmitter: {
    clearAllListeners: jest.fn()
  },
  playbackState: {
    status: 'idle',
    currentTime: 0,
    duration: Number.NaN,
    isPlaying: false,
    isBuffering: false,
    isVisualReady: false,
    bufferDuration: 0,
    bufferedPosition: 0,
    rate: 1
  },
  memorySnapshot: {
    isAttachedToView: false,
    retentionState: 'metadata'
  },
  source: null,
  clearSourceAsync: jest.fn(() => Promise.resolve()),
  release: jest.fn()
});

const createNativeRing = () => ({
  replaceCatalog: jest.fn(),
  commitViewport: jest.fn(),
  getPlayer: jest.fn(() => createNativePlayer()),
  snapshot: jest.fn(() => ({
    catalogRevision: 0,
    viewportRevision: 0,
    catalogSize: 0,
    playbackAllowed: false,
    muted: false,
    released: false,
    slots: []
  })),
  addSlotStateListener: jest.fn(() => ({
    remove: jest.fn()
  })),
  release: jest.fn()
});

type FeedRingModule = typeof import('../NitroFeedRingPlayer');
type CatalogPayloadItem = {
  sourceKey?: string;
  source?: {
    uri: string;
  };
};

const loadModule = () => {
  const nativeRing = createNativeRing();
  const createRingPlayer = jest.fn(() => nativeRing);
  const createHybridObject = jest.fn(() => ({
    createRingPlayer
  }));
  const updateMemorySize = jest.fn();
  const getNetworkThroughputEstimate = jest.fn<Promise<StreamNetworkThroughputEstimate | null>, []>(async () => null);

  jest.resetModules();
  jest.doMock('react-native', () => ({
    Platform: { OS: 'ios' }
  }));
  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: {
      createHybridObject,
      updateMemorySize
    }
  }));
  jest.doMock('../../streaming/streamCache', () => ({
    streamCache: {
      getNetworkThroughputEstimate
    }
  }));

  const module = require('../NitroFeedRingPlayer') as FeedRingModule;
  return { ...module, nativeRing, createRingPlayer, createHybridObject, updateMemorySize, getNetworkThroughputEstimate };
};

const getCatalogPayloadItems = (nativeRing: ReturnType<typeof createNativeRing>): CatalogPayloadItem[] => nativeRing.replaceCatalog.mock.calls[0][0].items as CatalogPayloadItem[];

describe('NitroFeedRingPlayer', () => {
  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('react-native-nitro-modules');
    jest.dontMock('../../streaming/streamCache');
  });

  it('sends catalog payload with feed policy defaults owned by the library', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.replaceCatalog({
      revision: 11,
      items: [{ index: 2, momentId: 'moment-2', source: 'https://cdn.example/video.m3u8' }]
    });

    expect(nativeRing.replaceCatalog).toHaveBeenCalledTimes(1);
    const payload = nativeRing.replaceCatalog.mock.calls[0][0];

    expect(payload.revision).toBe(11);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      index: 2,
      momentId: 'moment-2'
    });
    expect(payload.items[0]).not.toHaveProperty('slotId');
    expect(payload.items[0]).not.toHaveProperty('assignedIndex');
    expect(payload.items[0].source).toMatchObject({
      uri: 'https://cdn.example/video.m3u8',
      startup: 'lazy',
      buffer: {
        preferredPeakBitRate: 6_000_000,
        preferredForwardBufferDurationMs: 12_000
      },
      transport: { mode: 'auto' },
      retention: {
        preload: 'buffered',
        offscreen: 'metadata',
        trimDelayMs: 4000,
        feedPoolEligible: true
      },
      preview: {
        mode: 'listener',
        autoThumbnail: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 72
      }
    });
    expect(payload.items[0].sourceKey).toEqual(expect.any(String));
  });

  it('uses configured feed policy buffer for subsequent catalog payloads', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const { configureSourcePolicy } = require('../../source/sourcePolicy') as typeof import('../../source/sourcePolicy');
    const ring = new NitroFeedRingPlayer();

    configureSourcePolicy('feed', {
      buffer: {
        preferredPeakBitRate: 10_000_000
      }
    });
    ring.replaceCatalog({
      revision: 12,
      items: [{ index: 3, momentId: 'moment-3', source: 'https://cdn.example/video.m3u8' }]
    });

    expect(nativeRing.replaceCatalog.mock.calls[0][0].items[0].source.buffer).toEqual({
      preferredPeakBitRate: 10_000_000,
      preferredForwardBufferDurationMs: 12_000
    });
  });

  it('keeps adaptive quality disabled by default', () => {
    const { NitroFeedRingPlayer, nativeRing, getNetworkThroughputEstimate } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.replaceCatalog({
      revision: 15,
      items: [{ index: 1, momentId: 'moment-1', source: 'https://cdn.example/video.m3u8' }]
    });
    ring.commitViewport({
      revision: 1,
      centerIndex: 1,
      playbackAllowed: true,
      muted: false
    });

    expect(getNetworkThroughputEstimate).not.toHaveBeenCalled();
    expect(nativeRing.replaceCatalog.mock.calls[0][0].revision).toBe(15);
    expect(nativeRing.replaceCatalog.mock.calls[0][0].items[0].source.buffer).toEqual({
      preferredPeakBitRate: 6_000_000,
      preferredForwardBufferDurationMs: 12_000
    });
  });

  it('replaces future adaptive catalog sources after a high throughput decision', async () => {
    const { NitroFeedRingPlayer, nativeRing, getNetworkThroughputEstimate } = loadModule();
    getNetworkThroughputEstimate.mockResolvedValue({ bps: 24_000_000, samples: 4, newestAgeMs: 20 });
    const ring = new NitroFeedRingPlayer({ adaptiveQuality: true });

    ring.replaceCatalog({
      revision: 16,
      items: [{ index: 1, momentId: 'moment-1', source: 'https://cdn.example/video.m3u8' }]
    });
    expect(nativeRing.replaceCatalog.mock.calls[0][0].items[0].source.buffer).toEqual({
      preferredPeakBitRate: 6_000_000,
      preferredForwardBufferDurationMs: 12_000
    });

    ring.commitViewport({
      revision: 2,
      centerIndex: 1,
      playbackAllowed: true,
      muted: false
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(getNetworkThroughputEstimate).toHaveBeenCalledTimes(1);
    expect(nativeRing.replaceCatalog).toHaveBeenCalledTimes(2);
    expect(nativeRing.replaceCatalog.mock.calls[1][0].revision).toBe(17);
    expect(nativeRing.replaceCatalog.mock.calls[1][0].items[0].source.buffer).toEqual({
      preferredPeakBitRate: 10_000_000,
      preferredForwardBufferDurationMs: 12_000
    });
    expect(ring.adaptiveSnapshot()).toMatchObject({
      enabled: true,
      decision: 'high',
      lastEstimate: { bps: 24_000_000, samples: 4, newestAgeMs: 20 }
    });
  });

  it('keys catalog sources by moment content identity without volatile URI parts', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.replaceCatalog({
      revision: 21,
      items: [
        { index: 0, momentId: 'moment-1', source: 'https://cdn.example/videos/clip.m3u8?token=one#frag' },
        { index: 1, momentId: 'moment-1', source: 'https://cdn.example/videos/clip.m3u8?token=two' },
        { index: 2, momentId: 'moment-1', source: 'https://cdn.example/videos/other.m3u8?token=one' },
        { index: 3, momentId: 'moment-2', source: 'https://cdn.example/videos/clip.m3u8?token=one' },
        { index: 4, source: 'https://cdn.example/videos/clip.m3u8?token=three#poster' },
        { index: 5, source: 'https://cdn.example/videos/clip.m3u8?token=four#other' },
        { index: 6, momentId: 'moment-fragment', source: 'https://cdn.example/videos/fragment.m3u8#section' }
      ]
    });

    const items = getCatalogPayloadItems(nativeRing);

    expect(items[0].sourceKey).toBe('moment-1|https://cdn.example/videos/clip.m3u8');
    expect(items[1].sourceKey).toBe(items[0].sourceKey);
    expect(items[2].sourceKey).toBe('moment-1|https://cdn.example/videos/other.m3u8');
    expect(items[2].sourceKey).not.toBe(items[0].sourceKey);
    expect(items[3].sourceKey).toBe('moment-2|https://cdn.example/videos/clip.m3u8');
    expect(items[3].sourceKey).not.toBe(items[0].sourceKey);
    expect(items[4].sourceKey).toBe('|https://cdn.example/videos/clip.m3u8');
    expect(items[5].sourceKey).toBe(items[4].sourceKey);
    expect(items[6].sourceKey).toBe('moment-fragment|https://cdn.example/videos/fragment.m3u8');
    expect(items[0].source?.uri).toBe('https://cdn.example/videos/clip.m3u8?token=one#frag');
  });

  it('preserves explicit source policy overrides in catalog payload', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.replaceCatalog({
      revision: 12,
      items: [{ index: 4, momentId: 'moment-4', source: { uri: 'https://cdn.example/hero.m3u8', policy: 'hero' } }]
    });

    const payload = nativeRing.replaceCatalog.mock.calls[0][0];

    expect(payload.items[0].source).toMatchObject({
      uri: 'https://cdn.example/hero.m3u8',
      startup: 'eager',
      retention: {
        preload: 'buffered',
        offscreen: 'hot',
        trimDelayMs: 15000,
        feedPoolEligible: false
      },
      preview: {
        mode: 'always',
        autoThumbnail: true,
        maxWidth: 640,
        maxHeight: 360,
        quality: 80
      }
    });
  });

  it('uses buffered preload for ring slots while preserving explicit retention fields', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.replaceCatalog({
      revision: 14,
      items: [
        {
          index: 6,
          momentId: 'moment-6',
          source: {
            uri: 'https://cdn.example/metadata-config.m3u8',
            retention: {
              preload: 'metadata',
              offscreen: 'cold',
              trimDelayMs: 1200,
              feedPoolEligible: false
            }
          }
        }
      ]
    });

    const payload = nativeRing.replaceCatalog.mock.calls[0][0];

    expect(payload.items[0].source).toMatchObject({
      uri: 'https://cdn.example/metadata-config.m3u8',
      retention: {
        preload: 'buffered',
        offscreen: 'cold',
        trimDelayMs: 1200,
        feedPoolEligible: false
      }
    });
  });

  it('preserves full native source config fields in catalog payload', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.replaceCatalog({
      revision: 13,
      items: [
        {
          index: 5,
          momentId: 'moment-5',
          source: {
            uri: 'https://cdn.example/full-config.m3u8',
            metadata: {
              title: 'Feed clip',
              artist: 'Yupi'
            },
            buffer: {
              minBufferMs: 1200,
              livePlayback: {
                targetOffsetMs: 5000
              },
              preferredMaximumResolution: {
                width: 1280,
                height: 720
              }
            }
          }
        }
      ]
    });

    const payload = nativeRing.replaceCatalog.mock.calls[0][0];

    expect(payload.items[0].source).toMatchObject({
      uri: 'https://cdn.example/full-config.m3u8',
      metadata: {
        title: 'Feed clip',
        artist: 'Yupi'
      },
      buffer: {
        minBufferMs: 1200,
        livePlayback: {
          targetOffsetMs: 5000
        },
        preferredMaximumResolution: {
          width: 1280,
          height: 720
        }
      }
    });
  });

  it('commits viewport separately from catalog without item window data', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    ring.commitViewport({
      revision: 7,
      centerIndex: 3,
      playbackAllowed: true,
      muted: true
    });

    expect(nativeRing.commitViewport).toHaveBeenCalledTimes(1);
    expect(nativeRing.commitViewport.mock.calls[0][0]).toEqual({
      revision: 7,
      centerIndex: 3,
      playbackAllowed: true,
      muted: true
    });
    expect(nativeRing.replaceCatalog).not.toHaveBeenCalled();
  });

  it('caches JS wrappers for native slot players and releases only the ring owner', () => {
    const { NitroFeedRingPlayer, nativeRing } = loadModule();
    const ring = new NitroFeedRingPlayer();

    const first = ring.getSlotPlayer(1);
    const second = ring.getSlotPlayer(1);
    ring.release();

    expect(first).toBe(second);
    expect(nativeRing.getPlayer).toHaveBeenCalledTimes(1);
    expect(nativeRing.getPlayer).toHaveBeenCalledWith(1);
    expect(nativeRing.release).toHaveBeenCalledTimes(1);
    expect(ring.getSlotPlayer(1)).toBeNull();
  });

  it('does not read slot player source while destroying a ring-owned wrapper', async () => {
    const { NitroFeedRingPlayer, nativeRing, updateMemorySize } = loadModule();
    const nativePlayer = createNativePlayer();
    Object.defineProperty(nativePlayer, 'source', {
      get() {
        throw new Error('source getter should not be read');
      }
    });
    nativeRing.getPlayer.mockReturnValueOnce(nativePlayer);
    const ring = new NitroFeedRingPlayer();

    const player = ring.getSlotPlayer(0);
    await player?.clearSourceAsync();
    expect(() => player?.__destroy()).not.toThrow();

    expect(nativePlayer.release).not.toHaveBeenCalled();
    expect(updateMemorySize).not.toHaveBeenCalledWith(nativePlayer);
  });
});

export {};
import type { StreamNetworkThroughputEstimate } from '../../streaming/types';
