# ios/preview

> Module doc (local AI-context). Compact: таблицы, текущее состояние.

## Назначение

First-frame / preview-thumbnail runtime: генерация репрезентативного кадра (progressive MP4 через `AVAssetImageGenerator`, HLS manifest через `AVAssetImageGenerator` probe с fallback на `AVPlayer`+`AVPlayerItemVideoOutput`), coalesce/cancel дублей запросов, кэш-only peek, pure black-frame эвристики.

## Файлы

| Файл | Назначение | Ключевое API |
| --- | --- | --- |
| `VideoPreviewRuntime.swift` | Singleton: getFirstFrame/startFirstFrameRequest/peekFirstFrame, decode (direct + HLS generator probe + HLS-via-player), масштаб/JPEG persist в `HlsCacheStore`. `VideoPreviewProfile` (maxW/maxH/quality), `VideoPreviewResult` | `shared`, `getFirstFrame()`, `startFirstFrameRequest()`, `peekFirstFrame()` (cache-only), `clear()` |
| `HybridNitroVideoPreview.swift` | Nitro adapter для public `videoPreview`; nullable thumbnail paths через generated `Variant_NullType_String` | `getThumbnailUrl`, `peekThumbnailUrl`, `clearPreview` |
| `VideoPreviewDecodePlan.swift` | Pure decode ordering/execution policy seam for preview behavior tests | `VideoPreviewDecodePlan.make(isHls:)`, `HlsPreviewGrabExecutionPolicy.thumbnail` |
| `PreviewRequestCoordinator.swift` | Coalesce inflight по ключу (waiter-count), отмена когда последний waiter ушёл; `PreviewRequest`/`TaskPreviewJob`/`Entry` | `acquire(key:createJob:)`, `cached(_:)`, `cancelAll()`, `PreviewRequest.value()/cancel()`, `inflightCount` |
| `PreviewFrameHeuristics.swift` | Pure host-side: sample-offsets и black-frame детект (8x8 luma) | `frameSampleOffsets`, `isMostlyBlack(_:)` |

## Инварианты / заметки / threading

- HLS frame grab: `.m3u8` first probes `AVAssetImageGenerator` on iOS 16+; failure falls back to `AVPlayer`+`AVPlayerItemVideoOutput` (muted, off-screen, no layer) inside `HlsPreviewFrameDecoder` actor. Bare `.ts` still needs AVPlayer pipeline because `AVAssetImageGenerator` can fail with AVError -11828.
- Main-only preview work: only SDK-required `AVPlayer` mutators (`automaticallyWaitsToMinimizeStalling`, `play`, `pause`, `replaceCurrentItem`) hop through `MainActor`; route resolution, ledger drain wait, generator probe, pixel-buffer polling, CI conversion, and JPEG/cache persist stay outside main actor.
- Progressive (mp4/mov) — `decodeDirect` через `AVAssetImageGenerator` (infinite tolerance, nearest-keyframe).
- Coalesce: одинаковый `previewKey` (`HlsIdentity`) делит inflight Entry; cancel референ-считается, реальная отмена при `waiters==0`.
- `peekFirstFrame` читает только preview cache (тот же identity) и не запускает generation path.
- Preview side-jobs не меняют playback state (вызываются из `HybridNitroPlayerPreview`).
- `clear()` отменяет inflight + чистит thumbnail артефакты в store.
- `PreviewFrameHeuristics` зеркалит Android (`FRAME_SAMPLE_OFFSETS_US`, `isMostlyBlack`), изолирован для host-side unit-тестов.
- Профиль defaults: 480x480 @ quality 70; clamp в `VideoPreviewProfile.from`.
