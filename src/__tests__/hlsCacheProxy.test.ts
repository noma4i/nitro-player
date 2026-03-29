const nativeStart = jest.fn();
const nativeStop = jest.fn();
const nativeGetProxiedUrl = jest.fn((url: string) => `proxied:${url}`);

jest.mock('react-native', () => ({
  NativeModules: {
    HlsCacheProxy: {
      start: nativeStart,
      stop: nativeStop,
      getProxiedUrl: nativeGetProxiedUrl,
      prefetchFirstSegment: jest.fn(async () => true),
      getCacheStats: jest.fn(async () => ({
        totalSize: 0,
        fileCount: 0,
        maxSize: 5_368_709_120
      })),
      getStreamCacheStats: jest.fn(async () => ({
        totalSize: 0,
        fileCount: 0,
        maxSize: 5_368_709_120,
        streamSize: 0,
        streamFileCount: 0
      })),
      clearCache: jest.fn(async () => true)
    }
  }
}));

describe('hlsCacheProxy', () => {
  beforeEach(() => {
    jest.resetModules();
    nativeStart.mockReset();
    nativeStop.mockReset();
    nativeGetProxiedUrl.mockReset();
    nativeGetProxiedUrl.mockImplementation((url: string) => `proxied:${url}`);
  });

  it('delegates getProxiedUrl directly to native', () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');

    const proxiedUrl = hlsCacheProxy.getProxiedUrl('https://cdn.example.com/live.m3u8');

    expect(nativeGetProxiedUrl).toHaveBeenCalledWith('https://cdn.example.com/live.m3u8', undefined);
    expect(proxiedUrl).toBe('proxied:https://cdn.example.com/live.m3u8');
  });

  it('delegates start and stop to native without JS-side orchestration', () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');

    hlsCacheProxy.start();
    hlsCacheProxy.stop();

    expect(nativeStart).toHaveBeenCalledTimes(1);
    expect(nativeStart).toHaveBeenCalledWith(undefined);
    expect(nativeStop).toHaveBeenCalledTimes(1);
  });

  it('prefetchFirstSegment delegates to native prefetchFirstSegment', async () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');
    const { NativeModules } = require('react-native');
    const nativePrefetch = NativeModules.HlsCacheProxy.prefetchFirstSegment;

    await hlsCacheProxy.prefetchFirstSegment('https://cdn.example.com/live.m3u8');

    expect(nativePrefetch).toHaveBeenCalledTimes(1);
    expect(nativePrefetch).toHaveBeenCalledWith('https://cdn.example.com/live.m3u8', undefined);
  });

  it('getCacheStats returns the result from native getCacheStats', async () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');

    const stats = await hlsCacheProxy.getCacheStats();

    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120
    });
  });

  it('clearCache delegates to native clearCache', async () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');
    const { NativeModules } = require('react-native');
    const nativeClearCache = NativeModules.HlsCacheProxy.clearCache;

    const result = await hlsCacheProxy.clearCache();

    expect(nativeClearCache).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('getStreamCacheStats delegates to native getStreamCacheStats', async () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');
    const { NativeModules } = require('react-native');
    const nativeGetStreamStats = NativeModules.HlsCacheProxy.getStreamCacheStats;

    const stats = await hlsCacheProxy.getStreamCacheStats('https://cdn.example.com/live.m3u8');

    expect(nativeGetStreamStats).toHaveBeenCalledTimes(1);
    expect(nativeGetStreamStats).toHaveBeenCalledWith('https://cdn.example.com/live.m3u8');
    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120,
      streamSize: 0,
      streamFileCount: 0
    });
  });

  it('getStreamCacheStats returns defaults when native throws', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.HlsCacheProxy.getStreamCacheStats.mockRejectedValueOnce(new Error('fail'));

    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');
    const stats = await hlsCacheProxy.getStreamCacheStats('https://cdn.example.com/live.m3u8');

    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120,
      streamSize: 0,
      streamFileCount: 0
    });
  });

  it('prefetchFirstSegment delegates every call to native', async () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');
    const { NativeModules } = require('react-native');
    const nativePrefetch = NativeModules.HlsCacheProxy.prefetchFirstSegment;

    const url = 'https://cdn.example.com/dedup.m3u8';

    await hlsCacheProxy.prefetchFirstSegment(url);
    await hlsCacheProxy.prefetchFirstSegment(url);
    await hlsCacheProxy.prefetchFirstSegment(url);

    expect(nativePrefetch).toHaveBeenCalledTimes(3);
  });
});
