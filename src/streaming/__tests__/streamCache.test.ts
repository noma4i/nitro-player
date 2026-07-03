import { afterEach, describe, expect, it, jest } from '@jest/globals';

type StreamCacheModule = typeof import('../streamCache');
type NativeRuntimeMock = {
  prefetchLeadingSegments: ReturnType<typeof jest.fn>;
  getCacheStats: ReturnType<typeof jest.fn>;
  getStreamCacheStats: ReturnType<typeof jest.fn>;
  configureCache: ReturnType<typeof jest.fn>;
  clearCache: ReturnType<typeof jest.fn>;
  getPlayersDiagnostics?: ReturnType<typeof jest.fn>;
  getStreamVariants?: ReturnType<typeof jest.fn>;
  getNetworkThroughputEstimate?: ReturnType<typeof jest.fn>;
};

const createNativeRuntime = (): NativeRuntimeMock => ({
  prefetchLeadingSegments: jest.fn(async (_url: string, _headers?: Record<string, string>) => undefined),
  getCacheStats: jest.fn(),
  getStreamCacheStats: jest.fn(),
  configureCache: jest.fn(async (_options?: Record<string, number>) => true),
  clearCache: jest.fn()
});

const loadModule = () => {
  const nativeRuntime = createNativeRuntime();

  jest.resetModules();
  jest.doMock('react-native', () => ({
    NativeModules: {
      NitroPlayStreamRuntime: nativeRuntime
    }
  }));

  const module = require('../streamCache') as StreamCacheModule;
  return { ...module, nativeRuntime };
};

describe('streamCache', () => {
  afterEach(() => {
    jest.dontMock('react-native');
  });

  it('prefetches HLS manifests through the leading segment native method', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    const headers = { Authorization: 'Bearer token' };

    await streamCache.prefetch({ uri: 'https://cdn.example/video.m3u8', headers });

    expect(nativeRuntime.prefetchLeadingSegments).toHaveBeenCalledWith('https://cdn.example/video.m3u8', headers);
  });

  it('normalizes stream cache config per key', async () => {
    const { streamCache, nativeRuntime } = loadModule();

    await streamCache.configure({
      maxBytes: Number.NaN,
      prefetchSegments: 9.8
    });
    await streamCache.configure({
      maxBytes: 4096.9,
      prefetchSegments: Number.NaN
    });

    expect(nativeRuntime.configureCache).toHaveBeenNthCalledWith(1, { prefetchSegments: 6 });
    expect(nativeRuntime.configureCache).toHaveBeenNthCalledWith(2, { maxBytes: 4096 });
  });

  it('clamps finite prefetch segment counts to the native range', async () => {
    const { streamCache, nativeRuntime } = loadModule();

    await streamCache.configure({ prefetchSegments: -4.2 });
    await streamCache.configure({ prefetchSegments: 2.9 });

    expect(nativeRuntime.configureCache).toHaveBeenNthCalledWith(1, { prefetchSegments: 1 });
    expect(nativeRuntime.configureCache).toHaveBeenNthCalledWith(2, { prefetchSegments: 2 });
  });

  it('returns player diagnostics when the native runtime exposes them', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    const diagnostics = { capturedAt: 100, players: [], proxyLedger: [] };
    nativeRuntime.getPlayersDiagnostics = jest.fn(async () => diagnostics);

    await expect(streamCache.getPlayersDiagnostics()).resolves.toBe(diagnostics);
  });

  it('returns null when player diagnostics are unavailable', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    delete nativeRuntime.getPlayersDiagnostics;

    await expect(streamCache.getPlayersDiagnostics()).resolves.toBeNull();
  });

  it('returns network throughput estimates when the native runtime exposes them', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    const estimate = { bps: 24_000_000, samples: 5, newestAgeMs: 120 };
    nativeRuntime.getNetworkThroughputEstimate = jest.fn(async () => estimate);

    await expect(streamCache.getNetworkThroughputEstimate()).resolves.toBe(estimate);
  });

  it('returns null when network throughput estimate is unavailable', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    delete nativeRuntime.getNetworkThroughputEstimate;

    await expect(streamCache.getNetworkThroughputEstimate()).resolves.toBeNull();
  });

  it('returns stream variants from the native runtime', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    const variants = [
      {
        bandwidth: 4_200_000,
        averageBandwidth: 3_900_000,
        width: 720,
        height: 1280,
        codecs: 'avc1.64001f,mp4a.40.2',
        uri: 'https://cdn.example/720p.m3u8'
      }
    ];
    nativeRuntime.getStreamVariants = jest.fn(async () => variants);

    await expect(streamCache.getStreamVariants('https://cdn.example/master.m3u8')).resolves.toBe(variants);
    expect(nativeRuntime.getStreamVariants).toHaveBeenCalledWith('https://cdn.example/master.m3u8', undefined);
  });

  it('returns an empty variant list for non-HLS sources', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    nativeRuntime.getStreamVariants = jest.fn();

    await expect(streamCache.getStreamVariants('https://cdn.example/video.mp4')).resolves.toEqual([]);
    expect(nativeRuntime.getStreamVariants).not.toHaveBeenCalled();
  });

  it('returns null when stream variant discovery is unavailable', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    delete nativeRuntime.getStreamVariants;

    await expect(streamCache.getStreamVariants('https://cdn.example/master.m3u8')).resolves.toBeNull();
  });
});
