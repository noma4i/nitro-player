# HLS Cache Proxy

Localhost HTTP proxy (port `18181`) that caches HLS segments to disk. HLS proxying is enabled by default for `.m3u8` sources unless `advanced.transport.useHlsProxy` is set to `false`.

## Architecture

```
App -> NitroPlayerView -> localhost:18181 -> CDN
                              |
                         HlsCacheStore (disk)
```

- iOS: GCDWebServer + `~/Library/Caches/hls-cache/`
- Android: NanoHTTPD + `context.cacheDir/hls-cache/`
- One native singleton runtime per app process owns proxy startup, shutdown, and prefetch deduplication on both platforms
- The proxy starts lazily on the first playback-facing operation (`getProxiedUrl()` or `prefetchFirstSegment()`) unless it was explicitly stopped
- Foreground lifecycle may self-heal a previously auto-started runtime if the server died after app state changes
- Read-only maintenance methods (`getCacheStats()`, `getStreamCacheStats()`, `getThumbnail()`, `clearCache()`) are not startup triggers

Manifest responses always fresh (`Cache-Control: no-cache`). Segments cached to disk with SHA-256 filename.

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `start(port?)` | `void` | Manual restart/override for the native proxy (default: 18181) |
| `stop()` | `void` | Explicitly stop proxy singleton instance |
| `getProxiedUrl(url, headers?)` | `string` | Lazily start the runtime if needed and return a proxied HLS manifest URL |
| `prefetchFirstSegment(url, headers?)` | `Promise<void>` | Lazily start the runtime if needed and pre-download init + first segment |
| `getCacheStats()` | `Promise<HlsCacheStats>` | Total cache stats |
| `getStreamCacheStats(url)` | `Promise<HlsStreamCacheStats>` | Per-stream cache stats |
| `getThumbnail(url, headers?)` | `Promise<string \| null>` | Return cached/generated thumbnail path without starting the proxy runtime |
| `clearCache()` | `Promise<boolean>` | Delete all cached segments from the current cache store |

## Types

| Type | Fields |
|------|--------|
| `HlsCacheStats` | `totalSize`, `fileCount`, `maxSize` |
| `HlsStreamCacheStats` | `streamSize`, `streamFileCount`, plus `HlsCacheStats` fields |

## Cache Policy

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max size | 5 GB | Hardcoded |
| TTL | 7 days | From creation time |
| Eviction trigger | 80% full (4 GB) | Stream-based LRU |
| Eviction unit | Whole stream | All chunks of oldest stream removed at once |
| Index | `index.json` in cache dir | Debounced save (5s) |
| Filename | `SHA256(url).seg` | Collision-safe |

## Eviction Strategy

1. **TTL** - entries older than 7 days removed lazily (on access or stats)
2. **Size threshold** - when total cache > 80% of max (4 GB):
   - Group all entries by `streamKey` (playlist URL)
   - Sort streams by oldest `lastAccess`
   - Remove entire oldest stream (all its chunks)
   - Repeat until under threshold

Streams are always removed as a whole unit - no partial cleanup that would leave broken playlists on disk.

## Prefetch Deduplication

`prefetchFirstSegment()` deduplicates calls within 60 seconds for the same URL inside the native runtime. Safe to call on every feed item mount.

## Thumbnails

`getThumbnail()` first checks `HlsCacheStore` for an existing thumbnail. If none exists, each platform extracts frame 0 directly from the source URL and stores it as `SHA256(url).thumb` inside the same cache root. Thumbnail lookup and generation do not auto-start the proxy server.

## Disabling the Proxy

Non-HLS sources (`.mp4`, etc.) are never proxied regardless of this setting.
