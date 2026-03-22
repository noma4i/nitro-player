# @noma4i/nitro-play

> **Правила:** max 500 строк, БЕЗ истории, для AI не для людей

## Overview
- **Цель**: Standalone видеоплеер + HLS cache proxy для React Native
- **Принцип**: `<NitroPlayerView source={{ uri }} />` - один компонент, player создается внутри. HLS auto-proxy встроен.

## Public API (src/index.tsx)

| Export | Тип | Назначение |
|--------|-----|-----------|
| `NitroPlayerView` | component | Рендер видео (player внутри) |
| `useEvent` | hook | Подписка на события |
| `usePlaybackState` | hook | Native-first playback snapshot + JS interpolation (60fps) |
| `NitroPlayer` | class | Доступ через ref.current.player |
| `hlsCacheProxy` | singleton | HLS cache proxy management |
| `HlsCacheStats`, `HlsStreamCacheStats` | type | Общая и per-stream статистика кэша |
| Types | type exports | NitroPlayerConfig, PlaybackState, MemoryConfig, MemorySnapshot, NitroPlayerError, BandwidthData, etc. |

## NitroPlayerView API

```tsx
<NitroPlayerView
  source={{ uri: 'https://example.com/video.m3u8' }}
  setup={(p) => { p.loop = true; }}
  resizeMode="cover"
/>
```

| Prop | Тип | Default |
|------|-----|---------|
| `source` | `NitroPlayerConfig \| NitroPlayerSource` | required |
| `setup` | `(player) => void` | - |
| `resizeMode` | `ResizeMode` | `'none'` |
| `controls` | `boolean` | `false` |
| `keepScreenAwake` | `boolean` | `true` |
| `surfaceType` | `'surface' \| 'texture'` | `'surface'` (Android only) |

Ref (`NitroPlayerViewRef`): `player`, `enterFullscreen()`, `exitFullscreen()`, `addEventListener()`

## NitroPlayer API

| Метод/Свойство | Описание |
|----------------|----------|
| `play()` / `pause()` | Управление воспроизведением |
| `seekTo(time)` / `seekBy(time)` | Перемотка |
| `volume` / `muted` | Громкость (mute сохраняет/восстанавливает volume) |
| `loop` / `rate` | Зацикливание и скорость |
| `playbackState` | Unified snapshot (status, currentTime, duration, bufferDuration, etc.) |
| `memorySnapshot` | Native RAM snapshot |
| `initialize()` / `preload()` | Ручная инициализация |
| `replaceSourceAsync(source)` | Замена source |
| `release()` | Освобождение ресурсов |

## Events (через useEvent / addEventListener)

| Event | Данные |
|-------|--------|
| `onPlaybackState` | PlaybackState (250ms native, 60fps JS interpolation) |
| `onLoad` | width, height, duration, orientation |
| `onLoadStart` | sourceType, source |
| `onBandwidthUpdate` | bitrate, width?, height? |
| `onVolumeChange` | volume, muted |
| `onError` | NitroPlayerRuntimeError (JS-only event) |
| `onFullscreenChange` | fullscreen (view event) |
| `willEnterFullscreen` / `willExitFullscreen` | void (view events) |

## HLS Cache Proxy

Встроен в sourceFactory. Все `.m3u8` URLs автоматически проксируются; proxy поднимается lazy/native-first внутри библиотеки.

| Метод | Назначение |
|-------|-----------|
| `start(port?)` | Опциональный override порта |
| `stop()` | Остановка |
| `getProxiedUrl(url, headers?)` | Авто-вызывается sourceFactory |
| `prefetchFirstSegment(url, headers?)` | Предзагрузка |
| `getCacheStats()` | `{ totalSize, fileCount, maxSize }` |
| `getStreamCacheStats(url)` | Per-stream статистика |
| `clearCache()` | Очистка кэша |

Кэш: 5 GB max, 7d TTL, LRU eviction, SHA256 filenames.
Manifest responses: `Cache-Control: no-cache` (always fresh для live streams).

### Self-heal

| Platform | Механизм |
|----------|----------|
| iOS | `didBecomeActive` + `server.isRunning` check, hard restart GCDWebServer |
| Android | `LifecycleEventListener.onHostResume()`, restart NanoHTTPD if dead |

## Файлы - src/

| Файл | API |
|------|-----|
| `index.tsx` | Public exports |
| `core/player-view/NitroPlayerView.tsx` | `<NitroPlayerView source={} />` (player внутри) |
| `core/NitroPlayer.ts` | play/pause/seekTo/seekBy/initialize/preload/release/replaceSourceAsync + props |
| `core/NitroPlayerEvents.ts` | Event emitter (addEventListener/clearAll) |
| `core/hooks/useNitroPlayer.ts` | Internal (вызывается NitroPlayerView), stable identity key |
| `core/hooks/usePlaybackState.ts` | Native snapshot + 60fps JS interpolation (performance.now) |
| `core/utils/sourceFactory.ts` | HLS auto-proxy + Nitro source creation + identity key |
| `hls/hlsCacheProxy.ts` | NativeModules bridge |
| `hls/types.ts` | HlsCacheStats, Headers |

## Связи

- **PeerDeps**: react, react-native, react-native-nitro-modules (>=0.35.0)
- **Native deps**: GCDWebServer ~>3.5 (iOS), NanoHTTPD 2.3.1 (Android), Media3 1.9.3 (Android)
- **Build**: react-native-builder-bob, Nitrogen codegen
- **Tests**: Jest (TS contract), Android `test` + `androidTest`, iOS podspec `UnitTests`
- **Nitro entrypoint**: `npm run codegen` -> `nitrogen .` -> `nitrogen/generated/*`
- **Playback contract**: `player.playbackState` + `onPlaybackState` - единственный state source для JS
- **Playback interpolation**: 250ms native ticks + JS RAF interpolation (60fps, performance.now, NaN-safe)
- **Memory contract**: `NitroPlayerConfig.memoryConfig` управляет preload/retention, `player.memorySnapshot` даёт sync native RAM snapshot
- **Feed hot pool**: profile `feed` держит bounded hot pool (2 hot players)
- **HLS autostart**: proxy стартует lazy/native-first; consumer app не вызывает `hlsCacheProxy.start()`
- **Foreground resume**: обе платформы auto-resume auto-paused players
- **Audio session**: библиотека НЕ управляет audio session на iOS
- **Progress interval**: 250ms на обеих платформах (native -> JS via onPlaybackState)
- **Consumer harness**: `example/` - demo app (HLS+MP4, fullscreen, controls, bandwidth, cache stats)
- **Example package source**: `"file:.."` - прямая ссылка на корень репо

## Правила

1. nitrogen/generated/ - НЕ редактировать вручную
1.1. После изменения `src/spec/nitro/*` или `nitro.json` запускать `npm run codegen`
2. Android namespace: `com.nitroplay.video` - НЕ менять
3. HLS proxy namespace: `com.nitroplay.hls` - НЕ менять
4. NitroPlayPackage регистрирует И NitroPlayerView И HlsCacheProxyModule
5. Self-heal на обеих платформах (iOS + Android)
6. `useNitroPlayer` - internal, не экспортируется. Public API: `<NitroPlayerView source={} />`
7. sourceFactory авто-проксирует HLS manifest URLs c `.m3u8` (opt-out: `useHlsProxy: false`)
8. Для playback UI использовать `player.playbackState` / `usePlaybackState()`
9. Memory lifecycle через `NitroPlayerConfig.memoryConfig`; default: NitroPlayerView = `feed`, new NitroPlayer = `balanced`
10. Релизный процесс: version -> CHANGELOG -> README tags -> git tag -> GitHub Release
11. HLS proxy lifecycle внутри библиотеки (lazy start + native self-heal)
12. Device install через `example/scripts/ios-device.sh`
13. Удалены и НЕ поддерживаются: PiP, DRM, text tracks/subtitles, timed metadata, audio focus, AirPlay, notification controls
