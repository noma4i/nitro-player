# android/ - Android Native Layer

> **Правила:** max 500 строк, БЕЗ истории, для AI

## Overview
- **Цель**: ExoPlayer (Media3 1.9.3) видеоплеер для Android
- **Принцип**: Nitro Hybrids (Kotlin <-> C++ JNI bridge), singleton VideoManager

## Файлы

### core/

| Файл | Назначение |
|------|------------|
| `VideoManager.kt` | Singleton: view/player registry, lifecycle, feed hot pool. Все mutations через runOnMainThread |
| `VideoError.kt` | Error sealed classes |

### core/player/

| Файл | Назначение |
|------|------------|
| `DRMManagerSpec.kt` | Interface stub (используется в safe cast) |
| `DataSourceFactoryUtils.kt` | OkHttp DataSource factory |
| `MediaItemUtils.kt` | ExoPlayer MediaItem builder |
| `MediaSourceUtils.kt` | MediaSource factory |

### core/utils/

Threading (runOnMainThread/runOnMainThreadSync), SourceLoader, VideoFileHelper, VideoInformationUtils, VideoOrientationUtils

### hybrids/

| Файл | Назначение |
|------|------------|
| `videoplayer/HybridVideoPlayer.kt` | ExoPlayer wrapper: `createExoPlayer()` factory, native-first `PlaybackState` (250ms), `MemorySnapshot`, try-finally release, delayed offscreen trim |
| `videoplayersource/HybridVideoPlayerSource.kt` | Source retention states: cold / metadata / hot |
| `videoplayereventemitter/HybridVideoPlayerEventEmitter.kt` | JS event bridge (try/catch per listener, synchronized) |
| `videoviewviewmanager/HybridVideoViewViewManager.kt` | View props/events |

### view/

| Файл | Назначение |
|------|------------|
| `VideoView.kt` | FrameLayout: surface/texture, resize, fullscreen, try-finally onDetachedFromWindow |

### react/

| Файл | Назначение |
|------|------------|
| `VideoPackage.kt` | RN package: VideoView + HlsCacheProxyModule |
| `VideoViewViewManager.kt` | Fabric view manager |

### com/yupi/hls/ - HLS Cache Proxy

| Файл | Назначение |
|------|------------|
| `HlsCacheProxyModule.kt` | RCT bridge + native autostart + LifecycleEventListener self-heal |
| `HlsCacheProxyServer.kt` | NanoHTTPD server + routes + executor.shutdownNow() in stop() + manifest no-cache headers + Log.e error reporting |
| `HlsManifest.kt` | M3U8 parsing + rewriting + URI_REGEX cached + buildProxyQuery DRY |
| `HlsCacheStore.kt` | File cache: 5GB, 7d TTL, LRU O(n) eviction, ConcurrentHashMap |
| `HlsHeaderCodec.kt` | Base64 header encoding/decoding |

## QC фиксы (текущее состояние)

- `createExoPlayer()`: единый factory для initializePlayer + trimToMetadataRetention (LoadControl, RenderersFactory)
- `release()`: try-finally гарантирует player.release() даже при exception в cleanup
- `onDetachedFromWindow()`: try-finally гарантирует unregisterView
- `resumePlayersPausedForPip()`: try-catch per player (best-effort resume)
- `playersPausedForPip`: очищается в unregisterPlayer()
- HLS manifest: `Cache-Control: no-cache` + upstream `useCaches = false`
- HLS segments: кешируются нормально
- Executor: `shutdownNow()` в `stop()`
- Eviction: O(n) incremental total tracking
- Regex: `URI_REGEX` как object-level val (не per-call compilation)

## Build (build.gradle)

- Namespace: `com.twg.video`
- Kotlin: 2.1.20
- SDK: compile 36, target 36, min 24
- Media3: 1.9.3
- HLS proxy: nanohttpd 2.3.1

## Правила

1. `com.twg.video` namespace - НЕ менять
2. DRMManagerSpec.kt - interface stub, НЕ удалять
3. nitrogen/generated/android/ - НЕ редактировать
4. HLS proxy namespace: `com.yupi.hls`
5. HlsCacheProxyModule self-heals on onHostResume
6. VideoManager mutations - ТОЛЬКО через runOnMainThread
7. Playback state через unified `PlaybackState`
8. Удалены: AudioFocusManager, OnAudioFocusChangedListener, TextTrackUtils, SmallVideoPlayerOptimizer
