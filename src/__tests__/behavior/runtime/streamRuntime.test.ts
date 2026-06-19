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
const nativePeekThumbnailUrl = jest.fn(async () => 'file:///tmp/cached-frame.jpg');
const nativeClearCache = jest.fn(async () => true);
const nativeClearPreview = jest.fn(async () => true);

jest.mock('react-native', () => ({
  NativeModules: {
    NitroPlayStreamRuntime: {
      prefetchFirstSegment: nativePrefetchFirstSegment,
      getCacheStats: nativeGetCacheStats,
      getStreamCacheStats: nativeGetStreamCacheStats,
      getThumbnailUrl: nativeGetThumbnailUrl,
      peekThumbnailUrl: nativePeekThumbnailUrl,
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
    nativePeekThumbnailUrl.mockReset();
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
    nativePeekThumbnailUrl.mockResolvedValue('file:///tmp/cached-frame.jpg');
    nativeClearCache.mockResolvedValue(true);
    nativeClearPreview.mockResolvedValue(true);
  });

  it('delegates prefetch(source) to native prefetchFirstSegment', async () => {
    const { streamCache } = require('../../../transport/streamCache');

    await streamCache.prefetch({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' }
    });

    expect(nativePrefetchFirstSegment).toHaveBeenCalledWith(
      'https://cdn.example.com/live.m3u8',
      { Authorization: 'Bearer token' }
    );
  });

  it('prefetches HLS manifest URLs with query strings and second-arg headers', async () => {
    const { streamCache } = require('../../../transport/streamCache');

    await streamCache.prefetch('https://cdn.example.com/live.m3u8?token=abc', {
      Authorization: 'Bearer token',
      'X-Variant': 'home'
    });

    expect(nativePrefetchFirstSegment).toHaveBeenCalledWith(
      'https://cdn.example.com/live.m3u8?token=abc',
      { Authorization: 'Bearer token', 'X-Variant': 'home' }
    );
  });

  it('does not prefetch non-HLS sources', async () => {
    const { streamCache } = require('../../../transport/streamCache');

    await streamCache.prefetch({
      uri: 'https://cdn.example.com/movie.mp4',
      headers: { Authorization: 'Bearer token' }
    });

    expect(nativePrefetchFirstSegment).not.toHaveBeenCalled();
  });

  it('getStats() returns total cache stats when source is omitted', async () => {
    const { streamCache } = require('../../../transport/streamCache');

    const stats = await streamCache.getStats();

    expect(nativeGetCacheStats).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      totalSize: 0,
      fileCount: 0,
      maxSize: 5_368_709_120
    });
  });

  it('getStats(source) returns per-stream stats', async () => {
    const { streamCache } = require('../../../transport/streamCache');

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

  it('keeps cache stats identity scoped by source headers', async () => {
    const { streamCache } = require('../../../transport/streamCache');

    await streamCache.getStats({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { 'X-Feed': 'home' }
    });
    await streamCache.getStats({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { 'X-Feed': 'creator' }
    });

    expect(nativeGetStreamCacheStats).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example.com/live.m3u8',
      { 'X-Feed': 'home' }
    );
    expect(nativeGetStreamCacheStats).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/live.m3u8',
      { 'X-Feed': 'creator' }
    );
  });

  it('getStats(source) falls back to defaults when native throws', async () => {
    nativeGetStreamCacheStats.mockRejectedValueOnce(new Error('fail'));
    const { streamCache } = require('../../../transport/streamCache');

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
    const { streamCache } = require('../../../transport/streamCache');

    const result = await streamCache.clear();

    expect(nativeClearCache).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});

describe('videoPreview', () => {
  beforeEach(() => {
    jest.resetModules();
    nativeGetThumbnailUrl.mockReset();
    nativePeekThumbnailUrl.mockReset();
    nativeClearPreview.mockReset();
    nativeGetThumbnailUrl.mockResolvedValue('file:///tmp/frame.jpg');
    nativePeekThumbnailUrl.mockResolvedValue('file:///tmp/cached-frame.jpg');
    nativeClearPreview.mockResolvedValue(true);
  });

  it('delegates getFirstFrame(source) to native thumbnail lookup', async () => {
    const { videoPreview } = require('../../../preview/videoPreview');

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

  it('preserves header identity for repeated getFirstFrame calls on the same URL', async () => {
    const { videoPreview } = require('../../../preview/videoPreview');

    await videoPreview.getFirstFrame({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { 'X-Feed': 'home' }
    });
    await videoPreview.getFirstFrame({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { 'X-Feed': 'creator' }
    });

    expect(nativeGetThumbnailUrl).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example.com/live.m3u8',
      { 'X-Feed': 'home' }
    );
    expect(nativeGetThumbnailUrl).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/live.m3u8',
      { 'X-Feed': 'creator' }
    );
  });

  it('returns null when native preview lookup fails', async () => {
    nativeGetThumbnailUrl.mockRejectedValueOnce(new Error('fail'));
    const { videoPreview } = require('../../../preview/videoPreview');

    const frame = await videoPreview.getFirstFrame('https://cdn.example.com/live.m3u8');

    expect(frame).toBeNull();
  });

  it('delegates peekFirstFrame(source) to native cached thumbnail lookup', async () => {
    const { videoPreview } = require('../../../preview/videoPreview');

    const frame = await videoPreview.peekFirstFrame({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' }
    });

    expect(nativePeekThumbnailUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/live.m3u8',
      { Authorization: 'Bearer token' }
    );
    expect(nativeGetThumbnailUrl).not.toHaveBeenCalled();
    expect(frame).toBe('file:///tmp/cached-frame.jpg');
  });

  it('preserves header identity for cache-only preview peeks', async () => {
    const { videoPreview } = require('../../../preview/videoPreview');

    await videoPreview.peekFirstFrame('https://cdn.example.com/live.m3u8', {
      'X-Feed': 'home'
    });
    await videoPreview.peekFirstFrame('https://cdn.example.com/live.m3u8', {
      'X-Feed': 'creator'
    });

    expect(nativePeekThumbnailUrl).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example.com/live.m3u8',
      { 'X-Feed': 'home' }
    );
    expect(nativePeekThumbnailUrl).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/live.m3u8',
      { 'X-Feed': 'creator' }
    );
    expect(nativeGetThumbnailUrl).not.toHaveBeenCalled();
  });

  it('clear() delegates to native preview cleanup when available', async () => {
    const { videoPreview } = require('../../../preview/videoPreview');

    const result = await videoPreview.clear();

    expect(nativeClearPreview).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});
