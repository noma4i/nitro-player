import { afterEach, describe, expect, it, jest } from '@jest/globals';

type StreamCacheModule = typeof import('../streamCache');
type NativeRuntimeMock = {
  prefetchLeadingSegments: ReturnType<typeof jest.fn>;
  getCacheStats: ReturnType<typeof jest.fn>;
  getStreamCacheStats: ReturnType<typeof jest.fn>;
  configureCache: ReturnType<typeof jest.fn>;
  clearCache: ReturnType<typeof jest.fn>;
  getNetworkThroughputEstimate: ReturnType<typeof jest.fn>;
};

const createNativeRuntime = (): NativeRuntimeMock => ({
  prefetchLeadingSegments: jest.fn(async (_url: string, _headers?: Record<string, string>) => undefined),
  getCacheStats: jest.fn(),
  getStreamCacheStats: jest.fn(),
  configureCache: jest.fn(async (_options?: Record<string, number>) => true),
  clearCache: jest.fn(),
  getNetworkThroughputEstimate: jest.fn(async () => null)
});

const loadModule = (nativeRuntime: NativeRuntimeMock | undefined = createNativeRuntime()) => {
  const createHybridObject = jest.fn((name: string) => {
    if (name !== 'NitroStreamCache' || !nativeRuntime) {
      throw new Error(`Unavailable hybrid object: ${name}`);
    }
    return nativeRuntime;
  });

  jest.resetModules();
  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: {
      createHybridObject
    }
  }));

  const module = require('../streamCache') as StreamCacheModule;
  return { ...module, nativeRuntime: nativeRuntime as NativeRuntimeMock, createHybridObject };
};

describe('streamCache', () => {
  afterEach(() => {
    jest.dontMock('react-native-nitro-modules');
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

  it('returns network throughput estimates when the native runtime exposes them', async () => {
    const { streamCache, nativeRuntime } = loadModule();
    const estimate = { bps: 24_000_000, samples: 5, newestAgeMs: 120 };
    nativeRuntime.getNetworkThroughputEstimate.mockResolvedValue(estimate);

    await expect(streamCache.getNetworkThroughputEstimate()).resolves.toBe(estimate);
  });

  it('returns null when the Nitro stream cache object is unavailable', async () => {
    const { streamCache, createHybridObject } = loadModule(undefined);

    await expect(streamCache.getNetworkThroughputEstimate()).resolves.toBeNull();
    expect(createHybridObject).toHaveBeenCalledWith('NitroStreamCache');
  });

});
