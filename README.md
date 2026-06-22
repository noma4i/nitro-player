# NitroPlay

Native-first video player for React Native with shared HLS transport, stream cache, and first-frame preview utilities.

## Installation

```sh
yarn add @noma4i/nitro-play react-native-nitro-modules
```

```sh
npm install @noma4i/nitro-play react-native-nitro-modules
```

```sh
pnpm add @noma4i/nitro-play react-native-nitro-modules
```

`react-native-nitro-modules >= 0.35.0` is a required peer dependency. React and React Native come from your app.

### iOS

```sh
cd ios && pod install
```

### Android

No extra steps - standard React Native 0.77+ autolinking handles the module.

### Installing a specific tag from GitHub

If you need a tag or branch before it is published to npm:

```sh
yarn add @noma4i/nitro-play@github:noma4i/nitro-player#v2.0.0-beta.1
```

## Quick Start

```tsx
import React from 'react';
import { NitroVideo } from '@noma4i/nitro-play';

export function FeedCard() {
  return (
    <NitroVideo
      source={{
        uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        policy: 'feed'
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
| `NitroVideo`                        | Consumer-first native video component with safe lifecycle defaults |
| `NitroPlayerView`                   | Alias for `NitroVideo`                                             |
| `NitroPlayer`                       | Imperative player with properties, methods, and `addEventListener` |
| `prepareSource(input)`              | Public source normalization, policy expansion, and stable identity |
| `streamCache`                       | Prefetch, header-aware stats, cache clear                          |
| `videoPreview`                      | Generated and cache-only first-frame lookup                        |
| `usePlaybackState(player)`          | Subscribes to `onPlaybackState` and returns latest snapshot        |
| `useEvent(player, event, listener)` | Managed event subscription helper                                  |

Deep-dive reference lives in [docs/player-api.md](docs/player-api.md).

## Source DSL

Top-level `NitroSourceConfig` fields:

| Field       | Type                                          | Purpose                                                                           |
| ----------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `uri`       | `string \| number`                            | Network URL, local `file://` URI, absolute local file path, or React Native asset |
| `policy`    | `auto \| feed \| hero \| thumbnail \| manual` | Consumer scenario defaults                                                        |
| `headers`   | `Record<string, string>`                      | Request headers (part of cache/preview identity)                                  |
| `metadata`  | `NitroSourceMetadata`                         | Player-facing media metadata                                                      |
| `startup`   | `'eager' \| 'lazy'`                           | Advanced startup override                                                         |
| `buffer`    | `BufferConfig`                                | Advanced buffering override                                                       |
| `retention` | `NitroSourceRetentionConfig`                  | Advanced memory/lifecycle override                                                |
| `transport` | `NitroSourceTransportConfig`                  | Advanced stream routing override                                                  |
| `preview`   | `NitroSourcePreviewConfig`                    | Advanced first-frame override                                                     |

Policies are safe defaults. Explicit advanced fields override the selected policy.

| Policy      | Use case                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `auto`      | Default balanced player: eager while visible, metadata trim offscreen    |
| `feed`      | Scrolling feeds: lazy startup, metadata preload, bounded hot pool        |
| `hero`      | Primary/long-form player: eager startup, buffered preload, hot retention |
| `thumbnail` | Preview/cache workflows without playback startup                         |
| `manual`    | No policy defaults; consumer owns initialization and retention knobs     |

See [docs/source-config.md](docs/source-config.md) for retention, transport,
preview, metadata, and identity rules. Buffer tuning lives in
[docs/buffer-config.md](docs/buffer-config.md).

## `NitroVideo`

| Prop                  | Type                            | Notes                                            |
| --------------------- | ------------------------------- | ------------------------------------------------ |
| `source`              | `NitroSourceInput`              | String, asset number, config, or prepared source |
| `playerDefaults`      | `NitroPlayerDefaults`           | Declarative startup state                        |
| `controls`            | `boolean`                       | Native controls                                  |
| `resizeMode`          | `ResizeMode`                    | `contain \| cover \| stretch \| none`            |
| `keepScreenAwake`     | `boolean`                       | Screen wake lock                                 |
| `surfaceType`         | `'surface' \| 'texture'`        | Android only                                     |
| `style`               | `ViewStyle`                     | Inherited from `ViewProps`                       |
| `onAttached`          | `(player: NitroPlayer) => void` | View attached                                    |
| `onDetached`          | `() => void`                    | View detached                                    |
| `onFullscreenChange`  | `(value: boolean) => void`      | Fullscreen state changed                         |
| `willEnterFullscreen` | `() => void`                    | Pre-enter hook                                   |
| `willExitFullscreen`  | `() => void`                    | Pre-exit hook                                    |

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

| Property                 | Type                            | Get | Set |
| ------------------------ | ------------------------------- | --- | --- |
| `source`                 | `NitroSourceDescriptor \| null` | yes | no  |
| `status`                 | `NitroPlayerStatus`             | yes | no  |
| `playbackState`          | `PlaybackState`                 | yes | no  |
| `memorySnapshot`         | `MemorySnapshot`                | yes | no  |
| `duration`               | `number`                        | yes | no  |
| `currentTime`            | `number`                        | yes | yes |
| `volume`                 | `number`                        | yes | yes |
| `muted`                  | `boolean`                       | yes | yes |
| `loop`                   | `boolean`                       | yes | yes |
| `rate`                   | `number`                        | yes | yes |
| `isPlaying`              | `boolean`                       | yes | no  |
| `isBuffering`            | `boolean`                       | yes | no  |
| `isVisualReady`          | `boolean`                       | yes | no  |
| `bufferDuration`         | `number`                        | yes | no  |
| `bufferedPosition`       | `number`                        | yes | no  |
| `mixAudioMode`           | `MixAudioMode`                  | yes | yes |
| `ignoreSilentSwitchMode` | `IgnoreSilentSwitchMode`        | yes | yes |
| `playInBackground`       | `boolean`                       | yes | yes |
| `playWhenInactive`       | `boolean`                       | yes | yes |

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
| `streamCache.configure({ maxBytes })` | `Promise<boolean>`                | Override stream cache disk budget      |
| `streamCache.clear()`                 | `Promise<boolean>`                | Clear stream disk cache                |
| `videoPreview.getFirstFrame(source)`  | `Promise<string \| null>`         | Cached or generated first-frame path   |
| `videoPreview.peekFirstFrame(source)` | `Promise<string \| null>`         | Cached-only lookup (no generation)     |
| `videoPreview.clear()`                | `Promise<boolean>`                | Clear preview artifacts                |

All source-taking methods accept either a URL string or `{ uri, headers }`. Use the object form whenever headers are part of request identity. Stream cache defaults to 4 GiB and can be lowered or raised with `streamCache.configure({ maxBytes })`. See [docs/stream-runtime.md](docs/stream-runtime.md).

## Hooks

| Hook               | Signature                                                                 | Purpose                                                     |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `usePlaybackState` | `(player: NitroPlayer \| null \| undefined) => PlaybackState \| null`     | Subscribes to `onPlaybackState` and returns latest snapshot |
| `useEvent`         | `<T extends keyof AllNitroPlayerEvents>(player, event, callback) => void` | Managed event subscription with automatic cleanup           |

## `prepareSource`

```ts
import { prepareSource } from '@noma4i/nitro-play';

const source = prepareSource({ uri: require('./intro.mp4'), policy: 'feed' });
```

Resolves React Native asset references, validates source config, applies policy
defaults, and returns an immutable public descriptor with stable identities.

## Runtime Contract

| Area              | Behavior                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| Early play        | `play()` before `onLoad` is canonical                                     |
| Playback state    | Built from native readiness, buffering, and actual playing state          |
| HLS startup       | Lazy shared runtime with bounded startup recovery and direct fallback     |
| First frame       | `onFirstFrame` is sticky per active source generation                     |
| Preview           | Attached views own native placeholder; manual preview uses `videoPreview` |
| Source identity   | `prepareSource()` creates stable playback/request/preview keys            |
| Resource pressure | Native managers trim unpinned players to cold on iOS/Android pressure     |
| Inactive host     | `playWhenInactive` prevents automatic inactive pause on iOS and Android   |

Absolute local file paths are accepted on both iOS and Android and are normalized internally to `file://` URLs. App code should prefer canonical `file://` URIs when it owns freshly recorded media paths.

## Example App

The local [example](example/README.md) is a runtime lab, not just a smoke test.

It covers hero/feed/thumbnail policies, header-isolated HLS, direct MP4,
stream cache, first-frame preview, source churn, preload races, background
lifecycle, and buffering interruption screens.

## Documentation

| File                                                   | Purpose                                                 |
| ------------------------------------------------------ | ------------------------------------------------------- |
| [docs/player-api.md](docs/player-api.md)               | Public player, view, events, hooks                      |
| [docs/source-config.md](docs/source-config.md)         | Source DSL and normalized source model                  |
| [docs/buffer-config.md](docs/buffer-config.md)         | `buffer` tuning                                         |
| [docs/lifecycle-guide.md](docs/lifecycle-guide.md)     | `retention` model and startup intent                    |
| [docs/memory-management.md](docs/memory-management.md) | Retention states, snapshots, feed pool                  |
| [docs/stream-runtime.md](docs/stream-runtime.md)       | Shared transport runtime, `streamCache`, `videoPreview` |
| [docs/migration-2.0.md](docs/migration-2.0.md)         | Migration to the consumer-first source API              |
| [docs/migration-1.0.md](docs/migration-1.0.md)         | Migration to the explicit beta DSL                      |

## Requirements

| Dependency                 | Version     |
| -------------------------- | ----------- |
| React Native               | `>= 0.77.0` |
| react-native-nitro-modules | `>= 0.35.0` |

## License

MIT
