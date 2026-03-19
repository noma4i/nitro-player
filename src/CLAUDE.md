# src/ - TypeScript Layer

> **Правила:** max 500 строк, БЕЗ истории, для AI

## Overview
- **Цель**: TypeScript public API для видеоплеера
- **Принцип**: `<VideoView source={} />` - единственный public component, player внутри

## Файлы

| Файл | Назначение | API |
|------|------------|-----|
| `index.tsx` | Re-exports | VideoView, VideoPlayer, useEvent, usePlaybackState, hlsCacheProxy, types |
| `core/video-view/VideoView.tsx` | Main component | `<VideoView source={} setup={} />`, player через ref |
| `core/hooks/useVideoPlayer.ts` | Internal hook | Вызывается из VideoView; stable identity key через getSourceIdentityKey |
| `core/hooks/useEvent.ts` | Event subscription | `useEvent(player, event, callback)` |
| `core/hooks/usePlaybackState.ts` | Playback UI hook | Native snapshot + 60fps JS interpolation (performance.now, NaN-safe) |
| `core/hooks/useManagedInstance.ts` | Instance lifecycle | Internal |
| `core/video-view/NativeVideoView.tsx` | Fabric native component | Internal |
| `core/VideoPlayer.ts` | Player class | play/pause/seek + sync `playbackState` / `memorySnapshot` |
| `core/VideoPlayerEvents.ts` | Event emitter base class | addEventListener/clearAll, typed callbacks |
| `core/utils/playerFactory.ts` | Nitro player factory | Internal |
| `core/utils/sourceFactory.ts` | Source factory + HLS auto-proxy + identity key | Internal |

## Types (core/types/)

| Файл | Экспорт |
|------|---------|
| `VideoConfig.ts` | `VideoConfig` (uri, headers, bufferConfig?, memoryConfig?, metadata?, initializeOnCreation?, useHlsProxy?), `VideoSource`, `NativeVideoConfig` |
| `MemoryConfig.ts` | `MemoryConfig`, `MemoryProfile`, `PreloadLevel`, `OffscreenRetention` |
| `MemorySnapshot.ts` | `MemorySnapshot`, `MemoryRetentionState` |
| `VideoError.ts` | `VideoError`, `VideoRuntimeError`, `VideoComponentError`, error code types, `NATIVE_ERROR_REGEX` |
| `VideoPlayerStatus.ts` | idle / loading / buffering / playing / paused / ended / error |
| `PlaybackState.ts` | status, currentTime, duration, bufferDuration, bufferedPosition, rate, isPlaying, isBuffering, isReadyToDisplay, nativeTimestampMs |
| `VideoPlayerBase.ts` | `VideoPlayerBase` interface - player API contract (без text tracks, без notification controls) |
| `BufferConfig.ts` | `BufferConfig`, `LivePlaybackParams` |
| `ResizeMode.ts` | none / cover / contain / stretch |
| `MixAudioMode.ts` | auto / mixWithOthers / doNotMix / duckOthers |
| `IgnoreSilentSwitchMode.ts` | auto / ignore / obey |
| `VideoOrientation.ts` | `VideoOrientation` |
| `VideoInformation.ts` | `VideoInformation` |
| `Events.ts` | `AllPlayerEvents` (6 events), `VideoViewEvents` (3 events), `BandwidthData`, `onLoadData`, `onLoadStartData`, `onVolumeChangeData`, `SourceType` |
| `Utils.ts` | `NoAutocomplete` |

## Удалены

- `DrmParams.ts` - DRM не поддерживается
- `TextTrack.ts` - subtitles не поддерживаются

## Правила

1. `VideoView` принимает `source` prop - создаёт player внутри
2. `useVideoPlayer` - internal, НЕ экспортируется
3. Player доступен через `ref.current.player`
4. sourceFactory авто-проксирует HLS manifest URLs через hlsCacheProxy
5. sourceFactory НЕ мутирует входной `source`/`VideoConfig`
6. Nitro specs в `spec/nitro/` - контракт с нативом; `npm run codegen` при изменении
7. `setup` в `VideoView` реактивный: смена callback обновляет существующий player
8. `release()` делает JS player немедленно unusable
9. Playback UI source of truth = `player.playbackState` или `usePlaybackState()`
10. usePlaybackState interpolation: 60fps default, performance.now() для monotonic clock, NaN-safe
11. Identity key для source: getSourceIdentityKey() - stable, учитывает uri/useHlsProxy/memoryConfig
