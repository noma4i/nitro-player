# android/streaming

> Module doc (local AI-context). Compact: таблицы.

## Назначение
HLS proxy runtime (NanoHTTPD), manifest rewrite, identity/header codec, prefetch dedup, lifecycle state machine, route resolution.

## Package
`com.nitroplay.video.streaming` (рукописный, без pinned-исключений).

## Файлы
| Файл | Назначение | Ключевое API |
| --- | --- | --- |
| `HlsProxyRuntime.kt` | Singleton-runtime: register/start/stop, route resolution, prefetch (dedup), cache stats/configure/clear, synchronized server owner/lifecycle state | `register`, `start/stop`, `onHostResume/onHostDestroy`, `resolvePlaybackRoute`, `getProxiedUrl`, `prefetchFirstSegment`, `getCacheStats/getStreamCacheStats/configureCache/clearCache`, `restartForPlaybackRecovery`, `PlaybackRouteResolution` |
| `HybridNitroStreamCache.kt` | Nitro adapter для public `streamCache`; registers runtime from `NitroModules.applicationContext`, maps `ReadableMap` stats to generated structs | `prefetchLeadingSegments`, `getCacheStats`, `getStreamCacheStats`, `getNetworkThroughputEstimate`, `configureCache`, `clearCache` |
| `HlsProxyServer.kt` | NanoHTTPD на 127.0.0.1: `/hls/manifest.m3u8` + `/hls/segment`, manifest fetch+retry, segment pass-through tee-cache, same-segment in-flight dedup, prefetch init/first segment | `HlsProxyServer`, `listeningPort`, `prefetch`, `cacheStore`, `NanoHttpdConfig.TIMEOUT_MS` |
| `HlsManifest.kt` | Парсинг/rewrite master+media manifest: variants, init/first segment, proxy-URL, resolve, content-type | `isMaster`, `extractVariants`, `extractInitAndFirstSegment`, `rewriteMaster/rewriteMedia`, `resolveUrl`, `guessContentType` |
| `HlsManifestUrl.kt` | Единый детектор `.m3u8` (DRY: runtime/factory/source) | `HlsManifestUrl.matches` |
| `HlsIdentity.kt` | Stable request/preview ключи (url + sorted headers + preview profile) | `HlsIdentity.requestKey`, `previewKey` |
| `HlsHeaderCodec.kt` | Base64-JSON encode/decode заголовков (Map/ReadableMap); normalize query param | `encode`, `decode`, `normalizeParam` |
| `HlsPrefetchDeduper.kt` | Окно дедупа prefetch (TTL + max entries, LRU trim) | `HlsPrefetchDeduper`, `shouldPrefetch`, `forget`, `clear` |

## Инварианты / threading
- Proxy биндит OS-assigned ephemeral порт (`DEFAULT_PORT = 0`); фактический читается `listeningPort()`/`getListeningPort()` — нет loopback-коллизий между инстансами.
- Implicit start committed только после успешного server-start; failed/no-context остаётся retryable.
- `onHostDestroy` гасит runtime без explicit-stop semantics; pending start не воскрешает после stop/destroy; concurrent start заменяет server через synchronized owner внутри `HlsProxyRuntime`.
- `requestKey` (заменил sourceKey/resourceKey) — единый stream identity для cache/dedup/proxy query.
- `normalizeParam` (заменил decodeUrl): NanoHTTPD уже URL-декодирует query — только убирает null/blank, НЕ декодирует.
- Всё mutable state под `lock`; manifest fetch и segment open retry только до первого байта (`RETRY_DELAYS_MS`), 4xx → `HttpStatusException` (не retry), ≥500 → retry.
- `/hls/segment` cache miss не full-buffer'ит upstream: первый downloader stream'ит response в клиент и tee'ит bytes в temp cache file; commit только после полного EOF/expected length, abort/short-read удаляет temp.
- Same-segment in-flight dedup: второй request ждёт latch первого downloader; после успешного commit отдаёт FileInputStream из cache, после failed/aborted первого становится downloader сам.
- Default cache budget 4 GiB; clamp до 64 MiB (см. streaming/cache).
- Android throughput estimate surface returns Nitro null until the runtime owns a native network ledger.
