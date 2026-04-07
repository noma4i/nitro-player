# NitroPlay

Native-first video player for React Native with shared HLS transport, stream cache, and first-frame preview utilities.

Current version: `1.0.0`

## Installation

Install from GitHub tag `v1.0.0`.

Peer dependency: `react-native-nitro-modules >= 0.35.0`

## Quick Start

```tsx
import React from 'react';
import { NitroPlayerView } from '@noma4i/nitro-play';

export function FeedCard() {
  return (
    <NitroPlayerView
      source={{
        uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        startup: 'lazy',
        transport: { mode: 'auto' },
        retention: {
          preload: 'metadata',
          offscreen: 'metadata',
          feedPoolEligible: true
        },
        preview: { mode: 'listener', autoThumbnail: true }
      }}
      resizeMode="contain"
      keepScreenAwake
      style={{ width: '100%', aspectRatio: 16 / 9 }}
    />
  );
}
```

## Core API

| Surface                             | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `NitroPlayerView`                   | Declarative native view with fullscreen, attach, and event props   |
| `NitroPlayer`                       | Imperative player with properties, methods, and `addEventListener` |
| `createNitroSource(config)`         | URI normalization and hybrid source factory                        |
| `streamCache`                       | Prefetch, header-aware stats, cache clear                          |
| `videoPreview`                      | Generated and cache-only first-frame lookup                        |
| `usePlaybackState(player)`          | Subscribes to `onPlaybackState` and returns latest snapshot        |
| `useEvent(player, event, listener)` | Managed event subscription helper                                  |

Deep-dive reference lives in [docs/player-api.md](docs/player-api.md).

## Source DSL

Top-level `NitroSourceConfig` fields:

| Field       | Type                         | Purpose                                                                           |
| ----------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `uri`       | `string \| number`           | Network URL, local `file://` URI, absolute local file path, or React Native asset |
| `headers`   | `Record<string, string>`     | Request headers (part of cache/preview identity)                                  |
| `metadata`  | `NitroSourceMetadata`        | Player-facing media metadata                                                      |
| `startup`   | `'eager' \| 'lazy'`          | Startup strategy (default `eager`)                                                |
| `buffer`    | `BufferConfig`               | Explicit buffering policy                                                         |
| `retention` | `NitroSourceRetentionConfig` | Preload, offscreen retention, trim, feed eligibility                              |
| `transport` | `NitroSourceTransportConfig` | Transport routing policy                                                          |
| `preview`   | `NitroSourcePreviewConfig`   | First-frame generation policy                                                     |

### `NitroSourceMetadata`

All fields optional.

| Field         | Type     |
| ------------- | -------- |
| `title`       | `string` |
| `subtitle`    | `string` |
| `description` | `string` |
| `artist`      | `string` |
| `imageUri`    | `string` |

### `NitroSourceRetentionConfig`

| Field              | Type                                 | Purpose                             |
| ------------------ | ------------------------------------ | ----------------------------------- |
| `preload`          | `'none' \| 'metadata' \| 'buffered'` | Initial preload depth               |
| `offscreen`        | `'cold' \| 'metadata' \| 'hot'`      | Offscreen retention level           |
| `trimDelayMs`      | `number`                             | Delayed trim window                 |
| `feedPoolEligible` | `boolean`                            | Participate in native feed hot pool |

### `NitroSourceTransportConfig`

| Field  | Type                            | Purpose                            |
| ------ | ------------------------------- | ---------------------------------- |
| `mode` | `'auto' \| 'direct' \| 'proxy'` | Transport routing (default `auto`) |

`auto` prefers the shared HLS proxy and falls back to direct when the proxy cannot be readied for the active source generation. `direct` skips proxy routing. `proxy` forces proxy routing.

### `NitroSourcePreviewConfig`

| Field           | Type                                 | Default    | Purpose                                              |
| --------------- | ------------------------------------ | ---------- | ---------------------------------------------------- |
| `mode`          | `'listener' \| 'always' \| 'manual'` | `listener` | Automatic first-frame behavior                       |
| `autoThumbnail` | `boolean`                            | `true`     | Native auto-thumbnail placeholder for attached views |
| `maxWidth`      | `number`                             | `480`      | Output width hint                                    |
| `maxHeight`     | `number`                             | `480`      | Output height hint                                   |
| `quality`       | `number`                             | `70`       | JPEG quality hint                                    |

See [docs/source-config.md](docs/source-config.md) for source profiles and identity rules, and [docs/buffer-config.md](docs/buffer-config.md) for `BufferConfig` (Android `minBufferMs`, `maxBufferMs`, iOS `preferredForwardBufferDurationMs`, `preferredPeakBitRate`, shared `livePlayback`).

## `NitroPlayerView`

| Prop                  | Type                            | Notes                                 |
| --------------------- | ------------------------------- | ------------------------------------- |
| `source`              | `NitroSourceConfig`             | Required                              |
| `playerDefaults`      | `NitroPlayerDefaults`           | Declarative startup state             |
| `controls`            | `boolean`                       | Native controls                       |
| `resizeMode`          | `ResizeMode`                    | `contain \| cover \| stretch \| none` |
| `keepScreenAwake`     | `boolean`                       | Screen wake lock                      |
| `surfaceType`         | `'surface' \| 'texture'`        | Android only                          |
| `style`               | `ViewStyle`                     | Inherited from `ViewProps`            |
| `onAttached`          | `(player: NitroPlayer) => void` | View attached                         |
| `onDetached`          | `() => void`                    | View detached                         |
| `onFullscreenChange`  | `(value: boolean) => void`      | Fullscreen state changed              |
| `willEnterFullscreen` | `() => void`                    | Pre-enter hook                        |
| `willExitFullscreen`  | `() => void`                    | Pre-exit hook                         |

### `NitroPlayerViewRef`

| Member                              | Type                   | Notes                              |
| ----------------------------------- | ---------------------- | ---------------------------------- |
| `player`                            | `NitroPlayer`          | Imperative player backing the view |
| `isAttached`                        | `boolean`              | Native attach state                |
| `enterFullscreen()`                 | `void`                 | Enter fullscreen                   |
| `exitFullscreen()`                  | `void`                 | Exit fullscreen                    |
| `addEventListener(event, listener)` | `ListenerSubscription` | View events only                   |

## `NitroPlayer`

### Properties

| Property                 | Type                     | Get | Set |
| ------------------------ | ------------------------ | --- | --- |
| `source`                 | `NitroPlayerSource`      | yes | no  |
| `status`                 | `NitroPlayerStatus`      | yes | no  |
| `playbackState`          | `PlaybackState`          | yes | no  |
| `memorySnapshot`         | `MemorySnapshot`         | yes | no  |
| `duration`               | `number`                 | yes | no  |
| `currentTime`            | `number`                 | yes | yes |
| `volume`                 | `number`                 | yes | yes |
| `muted`                  | `boolean`                | yes | yes |
| `loop`                   | `boolean`                | yes | yes |
| `rate`                   | `number`                 | yes | yes |
| `isPlaying`              | `boolean`                | yes | no  |
| `isBuffering`            | `boolean`                | yes | no  |
| `isVisualReady`          | `boolean`                | yes | no  |
| `bufferDuration`         | `number`                 | yes | no  |
| `bufferedPosition`       | `number`                 | yes | no  |
| `mixAudioMode`           | `MixAudioMode`           | yes | yes |
| `ignoreSilentSwitchMode` | `IgnoreSilentSwitchMode` | yes | yes |
| `playInBackground`       | `boolean`                | yes | yes |
| `playWhenInactive`       | `boolean`                | yes | yes |

### Methods

| Method                              | Returns                | Notes                                 |
| ----------------------------------- | ---------------------- | ------------------------------------- |
| `play()`                            | `void`                 | Start playback; valid before `onLoad` |
| `pause()`                           | `void`                 | Pause playback                        |
| `seekTo(seconds)`                   | `void`                 | Absolute seek                         |
| `seekBy(seconds)`                   | `void`                 | Relative seek                         |
| `initialize()`                      | `Promise<void>`        | Manual initialization                 |
| `preload()`                         | `Promise<void>`        | Warm source without starting playback |
| `replaceSourceAsync(source)`        | `Promise<void>`        | Swap active source                    |
| `clearSourceAsync()`                | `Promise<void>`        | Clear source and keep player reusable |
| `release()`                         | `void`                 | Terminal teardown                     |
| `addEventListener(event, listener)` | `ListenerSubscription` | Subscribe to a player event           |

## `PlaybackState`

| Field               | Type                    | Notes                                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------------------- |
| `status`            | `NitroPlayerStatus`     | `idle \| loading \| buffering \| playing \| paused \| ended \| error` |
| `currentTime`       | `number`                | Seconds                                                               |
| `duration`          | `number`                | Seconds                                                               |
| `bufferDuration`    | `number`                | Seconds buffered ahead                                                |
| `bufferedPosition`  | `number`                | Absolute buffered position                                            |
| `rate`              | `number`                | Effective playback rate                                               |
| `isPlaying`         | `boolean`               | Native playing state                                                  |
| `isBuffering`       | `boolean`               | Native buffering state                                                |
| `isVisualReady`     | `boolean`               | First visual frame readiness                                          |
| `error`             | `PlaybackError \| null` | Present when `status === 'error'`                                     |
| `nativeTimestampMs` | `number`                | Native event timestamp                                                |

## Player Events

| Event               | Payload              |
| ------------------- | -------------------- |
| `onPlaybackState`   | `PlaybackState`      |
| `onLoadStart`       | `onLoadStartData`    |
| `onLoad`            | `onLoadData`         |
| `onError`           | `PlaybackError`      |
| `onFirstFrame`      | `onFirstFrameData`   |
| `onBandwidthUpdate` | `BandwidthData`      |
| `onVolumeChange`    | `onVolumeChangeData` |

Subscribe directly on the player instance:

```ts
const sub = player.addEventListener('onPlaybackState', state => {
  console.log(state.status, state.currentTime);
});
// later
sub.remove();
```

## Stream Cache & Preview

| API                                   | Returns                           | Purpose                                |
| ------------------------------------- | --------------------------------- | -------------------------------------- |
| `streamCache.prefetch(source)`        | `Promise<void>`                   | Warm transport and first segment cache |
| `streamCache.getStats()`              | `Promise<StreamCacheStats>`       | Total cache stats                      |
| `streamCache.getStats(source)`        | `Promise<StreamSourceCacheStats>` | Per-source stats, header-aware         |
| `streamCache.clear()`                 | `Promise<boolean>`                | Clear stream disk cache                |
| `videoPreview.getFirstFrame(source)`  | `Promise<string \| null>`         | Cached or generated first-frame path   |
| `videoPreview.peekFirstFrame(source)` | `Promise<string \| null>`         | Cached-only lookup (no generation)     |
| `videoPreview.clear()`                | `Promise<boolean>`                | Clear preview artifacts                |

All source-taking methods accept either a URL string or `{ uri, headers }`. Use the object form whenever headers are part of request identity. See [docs/stream-runtime.md](docs/stream-runtime.md).

## Hooks

| Hook               | Signature                                                                 | Purpose                                                     |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `usePlaybackState` | `(player: NitroPlayer \| null \| undefined) => PlaybackState \| null`     | Subscribes to `onPlaybackState` and returns latest snapshot |
| `useEvent`         | `<T extends keyof AllNitroPlayerEvents>(player, event, callback) => void` | Managed event subscription with automatic cleanup           |

## `createNitroSource`

```ts
import { createNitroSource } from '@noma4i/nitro-play';

const source = createNitroSource({ uri: require('./intro.mp4') });
```

Resolves React Native asset references via `Image.resolveAssetSource`, validates the URI, and returns a hybrid `NitroPlayerSource`. Usually you do not need to call this manually: `NitroPlayerView` and `NitroPlayer` accept a plain `NitroSourceConfig` and normalize it internally. Call `createNitroSource` explicitly when you want to reuse the same native source object across multiple `replaceSourceAsync` calls.

## Common Types

| Type                     | Values / Shape                                                                                                    | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `NitroPlayerStatus`      | `idle \| loading \| buffering \| playing \| paused \| ended \| error`                                             | Player status                                                     |
| `ResizeMode`             | `contain \| cover \| stretch \| none`                                                                             | View scaling                                                      |
| `MixAudioMode`           | `mixWithOthers \| doNotMix \| duckOthers \| auto`                                                                 | Audio session mix behavior                                        |
| `IgnoreSilentSwitchMode` | `auto \| ignore \| obey`                                                                                          | iOS silent switch handling                                        |
| `PreloadLevel`           | `none \| metadata \| buffered`                                                                                    | Initial preload depth                                             |
| `OffscreenRetention`     | `cold \| metadata \| hot`                                                                                         | Offscreen retention level                                         |
| `MemoryRetentionState`   | `cold \| metadata \| hot`                                                                                         | Retention snapshot value                                          |
| `MemorySnapshot`         | `{ playerBytes, sourceBytes, totalBytes, preloadLevel, retentionState, isAttachedToView, isPlaying }`             | Current player memory footprint                                   |
| `NitroPlayerDefaults`    | `{ loop?, muted?, volume?, rate?, mixAudioMode?, ignoreSilentSwitchMode?, playInBackground?, playWhenInactive? }` | Declarative startup state for `NitroPlayerView.playerDefaults`    |
| `NitroPlayerError`       | Discriminated on `LibraryError \| PlayerError \| SourceError \| NitroPlayerViewError \| UnknownError`             | Typed error hierarchy used by `onError` and thrown runtime errors |

## Runtime Contract

| Area                    | Behavior                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Early play              | `play()` before `onLoad` is canonical                                                                                                                                     |
| Playback state          | Built from native readiness, buffering, and actual playing state                                                                                                          |
| HLS startup             | Native runtime uses lazy startup and bounded startup recovery                                                                                                             |
| Proxy fallback          | `transport.mode='auto'` may fall back to direct URL if proxy is unavailable                                                                                               |
| First frame             | `onFirstFrame` is sticky per active source generation                                                                                                                     |
| Preview policy          | `preview.mode='listener'` auto-captures for attached views when `autoThumbnail !== false`; `always` warms preview automatically; `manual` disables background auto-warmup |
| Mounted-view reveal     | Attached `NitroPlayerView` owns native auto-thumbnail/first-frame placeholder by default; app code should not require JS poster swapping for active playback surfaces     |
| Manual preview          | `videoPreview.getFirstFrame(source)` returns cached/generated frame path                                                                                                  |
| Cached preview reuse    | `videoPreview.peekFirstFrame(source)` returns only an existing cached frame path and never starts generation                                                              |
| Stream/preview identity | `{ uri, headers }` is the canonical identity for cache stats and preview artifacts                                                                                        |
| Stream cache            | `streamCache.prefetch(source)` is safe to call repeatedly                                                                                                                 |

Absolute local file paths are accepted on both iOS and Android and are normalized internally to `file://` URLs. App code should prefer canonical `file://` URIs when it owns freshly recorded media paths.

## Example App

The local [example](example/README.md) is a runtime lab, not just a smoke test.

It covers:

- hero playback switching between `transport.mode='auto'`, header-isolated HLS, and direct MP4
- `streamCache.prefetch/getStats/clear` and `videoPreview.getFirstFrame/peekFirstFrame/clear`
- a three-player feed stress block with the same HLS URL under different headers
- live observation of `onLoad`, `onError`, `onFirstFrame`, bandwidth, attach state, and `isVisualReady`

## Documentation

| File                                                   | Purpose                                                 |
| ------------------------------------------------------ | ------------------------------------------------------- |
| [docs/player-api.md](docs/player-api.md)               | Public player, view, events, hooks                      |
| [docs/source-config.md](docs/source-config.md)         | Source DSL and normalized source model                  |
| [docs/buffer-config.md](docs/buffer-config.md)         | `buffer` tuning                                         |
| [docs/lifecycle-guide.md](docs/lifecycle-guide.md)     | `retention` model and startup intent                    |
| [docs/memory-management.md](docs/memory-management.md) | Retention states, snapshots, feed pool                  |
| [docs/stream-runtime.md](docs/stream-runtime.md)       | Shared transport runtime, `streamCache`, `videoPreview` |
| [docs/migration-1.0.md](docs/migration-1.0.md)         | Migration to the current beta DSL                       |

## Requirements

| Dependency                 | Version     |
| -------------------------- | ----------- |
| React Native               | `>= 0.77.0` |
| react-native-nitro-modules | `>= 0.35.0` |

## License

MIT
