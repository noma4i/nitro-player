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
- The proxy starts eagerly when the library/native module is registered
- Playback requests may only self-heal an already registered runtime if the server died after lifecycle changes
- Read-only maintenance methods are not startup triggers

Manifest responses always fresh (`Cache-Control: no-cache`). Segments cached to disk with SHA-256 filename.

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `start(port?)` | `void` | Manual restart/override for the native proxy (default: 18181) |
| `stop()` | `void` | Explicitly stop proxy singleton instance |
| `getProxiedUrl(url, headers?)` | `string` | Get proxied URL for HLS stream using the already registered runtime |
| `prefetchFirstSegment(url, headers?)` | `Promise<void>` | Pre-download init + first segment using the registered runtime |
| `getCacheStats()` | `Promise<HlsCacheStats>` | Total cache stats |
| `getStreamCacheStats(url)` | `Promise<HlsStreamCacheStats>` | Per-stream cache stats |
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

## Disabling the Proxy

Non-HLS sources (`.mp4`, etc.) are never proxied regardless of this setting.
