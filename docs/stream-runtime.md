# Stream Cache and Video Preview

NitroPlay keeps a shared native transport runtime for HLS playback and exposes two public utility surfaces: `streamCache` and `videoPreview`.

## Public API

| Surface        | Method                    | Returns                           | Purpose                              |
| -------------- | ------------------------- | --------------------------------- | ------------------------------------ |
| `streamCache`  | `prefetch(source)`        | `Promise<void>`                   | Warm first segment cache             |
| `streamCache`  | `getStats()`              | `Promise<StreamCacheStats>`       | Total cache stats                    |
| `streamCache`  | `getStats(source)`        | `Promise<StreamSourceCacheStats>` | Per-source cache stats, header-aware |
| `streamCache`  | `configure({ maxBytes })` | `Promise<boolean>`                | Override stream cache disk budget    |
| `streamCache`  | `clear()`                 | `Promise<boolean>`                | Clear stream cache                   |
| `videoPreview` | `getFirstFrame(source)`   | `Promise<string \| null>`         | Return cached/generated first frame  |
| `videoPreview` | `peekFirstFrame(source)`  | `Promise<string \| null>`         | Return only cached first frame       |
| `videoPreview` | `clear()`                 | `Promise<boolean>`                | Clear stored preview artifacts       |

`source` can be a URL string or `{ uri, headers }`. Header-bearing sources are treated as distinct transport and preview identities.

## Canonical usage

```ts
await streamCache.prefetch({
  uri: 'https://example.com/live.m3u8',
  headers: { Authorization: 'Bearer alpha' }
});

const stats = await streamCache.getStats({
  uri: 'https://example.com/live.m3u8',
  headers: { Authorization: 'Bearer alpha' }
});

await streamCache.configure({ maxBytes: 2 * 1024 * 1024 * 1024 });

const previewUri = await videoPreview.getFirstFrame({
  uri: 'https://example.com/live.m3u8',
  headers: { Authorization: 'Bearer alpha' }
});

const cachedPreviewUri = await videoPreview.peekFirstFrame({
  uri: 'https://example.com/live.m3u8',
  headers: { Authorization: 'Bearer alpha' }
});
```

## Transport model

| Area               | Behavior                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Runtime ownership  | One native singleton runtime per app process                                                          |
| Startup            | Lazy on first playback-facing use                                                                     |
| Direct fallback    | Allowed in `transport.mode='auto'` when proxy is unavailable                                          |
| Read-only methods  | `getStats`, `getFirstFrame`, `peekFirstFrame`, `clear` do not start playback or lazily boot the proxy |
| Startup recovery   | One bounded recovery attempt before first successful `onLoad`                                         |
| Request validation | Empty or invalid manifests are treated as failures                                                    |
| iOS backend        | Private vendored KTVHTTPCache; NitroPlay owns lifecycle, per-URL headers, and public stats shape      |

## Cache policy

| Parameter        | Value                                 | Notes                                             |
| ---------------- | ------------------------------------- | ------------------------------------------------- |
| Default max size | 4 GiB                                 | Public `maxSize` default                          |
| Override         | `streamCache.configure({ maxBytes })` | Applies to current runtime and future lazy starts |
| Minimum max size | 64 MiB                                | Smaller JS values are clamped natively            |
| TTL              | 7 days                                | From creation time                                |
| Eviction trigger | Above max size                        | Sweep targets 90% of max                          |
| Eviction unit    | Whole stream                          | Prevents half-broken playlists                    |
| Stream identity  | URL + request context                 | Used for stream-level accounting                  |

For stream cache accounting, request context currently means the normalized header set associated with the source.
Legacy or corrupt cache records are self-healed on read: corrupt indexes, unsafe
file names, zero-byte files, missing files, and size mismatches are removed and
fall back to network playback instead of surfacing a stale file to the player.

## First-frame model

| Area                      | Behavior                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Automatic delivery        | `onFirstFrame` is emitted by the player for the active source generation                                                       |
| Sticky replay             | Late listeners receive the latest first frame immediately                                                                      |
| Manual lookup             | `videoPreview.getFirstFrame(source)` reads the same preview artifact                                                           |
| Cache-only lookup         | `videoPreview.peekFirstFrame(source)` reads only an existing preview artifact and never starts generation                      |
| Listener mode             | Auto-generation starts for attached views by default and also satisfies `onFirstFrame` listeners                               |
| Always mode               | Capture starts automatically after visual readiness even without listeners                                                     |
| Manual mode               | No background auto-warmup; attached views still use native auto-thumbnail unless `autoThumbnail=false`                         |
| Auto-thumbnail opt-out    | `preview.autoThumbnail=false` disables native mounted-view placeholder generation                                              |
| Mounted playback surfaces | Native attached-view placeholder/reveal is owned by the library; JS poster swapping is optional fallback, not the primary path |
| Isolation                 | Preview failures do not change playback status                                                                                 |
| Identity                  | Preview entries are keyed by URL, headers, and preview profile                                                                 |

> **Emulator caveat (Android):** HLS first-frame extraction decodes the first media
> segment off-player. On emulators with a software GPU (SwiftShader/goldfish) the
> decoded MPEG-TS frame reads back black, even though playback renders the real video
> on the hardware overlay — an emulator readback limitation, not a library bug. First
> frames are real on physical devices; progressive (MP4) previews read back correctly
> even on the emulator.

## Operational notes

| Case                              | Expected behavior                                                              |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Repeated `prefetch()`             | Safe; native runtime deduplicates work                                         |
| Multiple players with same source | Shared transport and preview jobs must coalesce                                |
| Different headers                 | Cache and preview identity remain isolated                                     |
| Invalid old cache                 | Entry is purged and playback falls back to network                             |
| Clear before playback             | `streamCache.clear()` clears persisted stream cache even when the HLS proxy has not started |
| Clear completion                  | `await streamCache.clear()` resolves only after native stream cache state has been cleared |
| Foreground self-heal              | iOS KTV foreground ping is bounded; a stuck ping times out and triggers restart |
| Preview cleanup                   | `videoPreview.clear()` removes preview artifacts without touching stream cache |
| `replaceSourceAsync()`            | Old transport and preview work cannot leak into the new source generation      |

The internal native module is named `NitroPlayStreamRuntime`, and the supported JS utility surfaces are `streamCache` and `videoPreview`.
