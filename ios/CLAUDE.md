# ios/ - iOS Native Layer

> **Правила:** max 500 строк, БЕЗ истории, для AI

## Overview
- **Цель**: AVPlayer-based видеоплеер для iOS
- **Принцип**: Nitro Hybrids (Swift <-> C++ bridge), singleton NitroPlayerManager

## Файлы

### core/

| Файл | Назначение |
|------|------------|
| `NitroPlayerManager.swift` | Singleton: player registry, app lifecycle (auto-pause/resume), feed hot pool. Thread-safe via onMainThread dispatch |
| `NitroPlayerObserver.swift` | KVO: player/playerItem transitions + periodic ticks (250ms). All KVO closures use [weak player] |
| `NitroPlayerError.swift` | Error types |
| `NitroPlayerFileHelper.swift` | Resolve file:// и bundle:// URLs |

### core/Extensions/

AVAsset memory, AVAssetTrack orientation, AVMetadataItem factory, AVPlayerItem buffering/config, NitroPlayerInformation, safe selector, ResizeMode gravity

### core/Spec/

| Файл | Назначение |
|------|------------|
| `NativeNitroPlayerSpec.swift` | Public protocol + typealias для player |
| `NativeNitroPlayerSourceSpec.swift` | Public protocol + typealias для source |

### hybrids/

| Файл | Назначение |
|------|------------|
| `NitroPlayer/HybridNitroPlayer.swift` | Player: play/pause/seek/volume/loop + native-first `PlaybackState` / `MemorySnapshot`. initTask + artworkTask cancellable. userVolume save/restore on mute. |
| `NitroPlayer/HybridNitroPlayer+Events.swift` | AVPlayer -> unified playback snapshot transitions |
| `NitroPlayerSource/HybridNitroPlayerSource.swift` | Source: URL -> AVURLAsset, retention state cold / metadata / hot |
| `NitroPlayerSource/SourceLoader.swift` | Async loader с cancellation |
| `NitroPlayerEmitter/HybridNitroPlayerEventEmitter.swift` | JS event bridge |
| `NitroPlayerViewManager/HybridNitroPlayerViewManager.swift` | View props/events, fullscreen (OSLog logging) |

### view/

| Файл | Назначение |
|------|------------|
| `NitroPlayerComponentView.swift` | Main UIView: player attachment, fullscreen, resize |
| `NitroPlayerComponentViewObserver.swift` | View-level KVO observers (isReadyForDisplay) |
| `fabric/` + `paper/` | Fabric/Paper bridges (RCTNitroPlayerComponentView, RCTNitroPlayerViewManager) |

### hls/ - HLS Cache Proxy

| Файл | Назначение |
|------|------------|
| `HlsCacheProxyModule.swift` | RCT bridge module + native autostart bootstrap |
| `HlsProxyServerController.swift` | GCDWebServer lifecycle + routes + AppState self-heal (isRunning check) + manifest no-cache headers |
| `HlsManifestRewriter.swift` | M3U8 parsing + URL rewriting (cached static regex) |
| `HlsCacheStore.swift` | File cache: 5GB max, 7d TTL, LRU eviction (OSLog on write errors) |
| `HlsNetworkClient` | Inline in HlsProxyServerController. cachePolicy parameter for manifest bypass |

## QC фиксы (текущее состояние)

- KVO closures: `[weak self, weak player]` во всех observers (no retain cycles)
- `observedPlayer` weak ref для safe periodicObserver cleanup
- `initTask` сохраняется как property, cancel в release() и replaceSourceAsync()
- `artworkTask` cancel в release() и replaceSourceAsync()
- `userVolume` save/restore при mute toggle (паритет с Android)
- NitroPlayerManager: `onMainThread` dispatch вместо dispatchPrecondition (safe для non-main callers)
- HLS manifest: `Cache-Control: no-cache` + upstream `reloadIgnoringLocalCacheData`
- HLS segments: кешируются нормально (no bypass)

## Правила

1. NitroPlayerManager.shared - singleton; audio session НЕ управляется библиотекой
2. wasAutoPaused - auto-resume в `applicationWillEnterForeground`
3. Progress interval = 250ms (паритет с Android)
4. nitrogen/generated/ios/ - НЕ редактировать
5. HLS proxy self-heals on didBecomeActive (server.isRunning check)
6. Logging через OSLog Logger (subsystem com.nitroplay.video / com.nitroplay.hls)
7. Удалены: PiP extension, timedMetadata/legibleOutput delegates, externalPlayback observer
