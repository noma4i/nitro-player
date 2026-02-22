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
        maxSize: 5_368_709_120,
      })),
      getStreamCacheStats: jest.fn(async () => ({
        totalSize: 0,
        fileCount: 0,
        maxSize: 5_368_709_120,
        streamSize: 0,
        streamFileCount: 0,
      })),
      clearCache: jest.fn(async () => true),
    },
  },
}));

describe('hlsCacheProxy', () => {
  beforeEach(() => {
    jest.resetModules();
    nativeStart.mockReset();
    nativeStop.mockReset();
    nativeGetProxiedUrl.mockReset();
    nativeGetProxiedUrl.mockImplementation((url: string) => `proxied:${url}`);
  });

  it('auto-starts the native proxy before the first proxied URL lookup', () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');

    const proxiedUrl = hlsCacheProxy.getProxiedUrl('https://cdn.example.com/live.m3u8');

    expect(nativeStart).toHaveBeenCalledTimes(1);
    expect(nativeStart).toHaveBeenCalledWith(18181);
    expect(nativeGetProxiedUrl).toHaveBeenCalledWith('https://cdn.example.com/live.m3u8', undefined);
    expect(proxiedUrl).toBe('proxied:https://cdn.example.com/live.m3u8');
  });

  it('respects an explicit stop until start() is called again', () => {
    const { hlsCacheProxy } = require('../hls/hlsCacheProxy');

    hlsCacheProxy.stop();
    hlsCacheProxy.getProxiedUrl('https://cdn.example.com/live.m3u8');

    expect(nativeStop).toHaveBeenCalledTimes(1);
    expect(nativeStart).not.toHaveBeenCalled();

    hlsCacheProxy.start();
    hlsCacheProxy.getProxiedUrl('https://cdn.example.com/live-2.m3u8');

    expect(nativeStart).toHaveBeenCalledTimes(1);
    expect(nativeStart).toHaveBeenCalledWith(18181);
    expect(nativeGetProxiedUrl).toHaveBeenLastCalledWith('https://cdn.example.com/live-2.m3u8', undefined);
  });
});
