const nativePrefetchFirstSegment = jest.fn(async () => true);
const nativeGetCacheStats = jest.fn(async () => ({
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120
}));
const nativeGetStreamCacheStats = jest.fn(async () => ({
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120,
  streamSize: 0,
  streamFileCount: 0
}));
const nativeGetThumbnailUrl = jest.fn(async () => 'file:///tmp/frame.jpg');
const nativeClearCache = jest.fn(async () => true);
const nativeClearPreview = jest.fn(async () => true);

jest.mock('react-native', () => ({
  NativeModules: {
    NitroPlayStreamRuntime: {
      prefetchFirstSegment: nativePrefetchFirstSegment,
      getCacheStats: nativeGetCacheStats,
      getStreamCacheStats: nativeGetStreamCacheStats,
      getThumbnailUrl: nativeGetThumbnailUrl,
      clearCache: nativeClearCache,
      clearPreview: nativeClearPreview
    }
  }
}));

describe('streamCache', () => {
  beforeEach(() => {
    jest.resetModules();
    nativePrefetchFirstSegment.mockReset();
    nativeGetCacheStats.mockReset();
    nativeGetStreamCacheStats.mockReset();
    nativeGetThumbnailUrl.mockReset();
    nativeClearCache.mockReset();
    nativeClearPreview.mockReset();

    nativePrefetchFirstSegment.mockResolvedValue(true);
    nativeGetCacheStats.mockResolvedValue({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120
    });
    nativeGetStreamCacheStats.mockResolvedValue({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120,
      streamSize: 0,
      streamFileCount: 0
    });
    nativeGetThumbnailUrl.mockResolvedValue('file:///tmp/frame.jpg');
    nativeClearCache.mockResolvedValue(true);
    nativeClearPreview.mockResolvedValue(true);
  });

  it('delegates prefetch(source) to native prefetchFirstSegment', async () => {
    const { streamCache } = require('../transport/streamCache');

    await streamCache.prefetch({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' }
    });

    expect(nativePrefetchFirstSegment).toHaveBeenCalledWith(
      'https://cdn.example.com/live.m3u8',
      { Authorization: 'Bearer token' }
    );
  });

  it('getStats() returns total cache stats when source is omitted', async () => {
    const { streamCache } = require('../transport/streamCache');

    const stats = await streamCache.getStats();

    expect(nativeGetCacheStats).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120
    });
  });

  it('getStats(source) returns per-stream stats', async () => {
    const { streamCache } = require('../transport/streamCache');

    const stats = await streamCache.getStats({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' }
    });

    expect(nativeGetStreamCacheStats).toHaveBeenCalledWith(
      'https://cdn.example.com/live.m3u8',
      { Authorization: 'Bearer token' }
    );
    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120,
      streamSize: 0,
      streamFileCount: 0
    });
  });

  it('getStats(source) falls back to defaults when native throws', async () => {
    nativeGetStreamCacheStats.mockRejectedValueOnce(new Error('fail'));
    const { streamCache } = require('../transport/streamCache');

    const stats = await streamCache.getStats('https://cdn.example.com/live.m3u8', {
      Authorization: 'Bearer token'
    });

    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120,
      streamSize: 0,
      streamFileCount: 0
    });
  });

  it('clear() delegates to native clearCache', async () => {
    const { streamCache } = require('../transport/streamCache');

    const result = await streamCache.clear();

    expect(nativeClearCache).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});

describe('videoPreview', () => {
  beforeEach(() => {
    jest.resetModules();
    nativeGetThumbnailUrl.mockReset();
    nativeClearPreview.mockReset();
    nativeGetThumbnailUrl.mockResolvedValue('file:///tmp/frame.jpg');
    nativeClearPreview.mockResolvedValue(true);
  });

  it('delegates getFirstFrame(source) to native thumbnail lookup', async () => {
    const { videoPreview } = require('../preview/videoPreview');

    const frame = await videoPreview.getFirstFrame({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' }
    });

    expect(nativeGetThumbnailUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/live.m3u8',
      { Authorization: 'Bearer token' }
    );
    expect(frame).toBe('file:///tmp/frame.jpg');
  });

  it('returns null when native preview lookup fails', async () => {
    nativeGetThumbnailUrl.mockRejectedValueOnce(new Error('fail'));
    const { videoPreview } = require('../preview/videoPreview');

    const frame = await videoPreview.getFirstFrame('https://cdn.example.com/live.m3u8');

    expect(frame).toBeNull();
  });

  it('clear() delegates to native preview cleanup when available', async () => {
    const { videoPreview } = require('../preview/videoPreview');

    const result = await videoPreview.clear();

    expect(nativeClearPreview).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});
