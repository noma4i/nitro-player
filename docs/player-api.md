# NitroPlayer API

Access the imperative player as `ref.current.player`. View attachment is exposed through `ref.current.isAttached`, `onAttached`, and `onDetached`.

## Minimal usage

```tsx
import React, { useRef } from 'react';
import { NitroPlayerView, type NitroPlayerViewRef } from '@noma4i/nitro-play';

export function Demo() {
  const ref = useRef<NitroPlayerViewRef>(null);

  return (
    <NitroPlayerView
      ref={ref}
      source={{
        uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        startup: 'lazy',
        transport: { mode: 'auto' },
        preview: { mode: 'listener' }
      }}
      onAttached={player => player.play()}
      resizeMode="contain"
      style={{ width: '100%', aspectRatio: 16 / 9 }}
    />
  );
}
```

## `NitroPlayerView`

| Prop                  | Type                            | Notes                     |
| --------------------- | ------------------------------- | ------------------------- |
| `source`              | `NitroSourceConfig`             | Required                  |
| `playerDefaults`      | `NitroPlayerDefaults`           | Declarative startup state |
| `controls`            | `boolean`                       | Native controls           |
| `resizeMode`          | `ResizeMode`                    | View scaling              |
| `keepScreenAwake`     | `boolean`                       | Screen wake lock          |
| `surfaceType`         | `'surface' \| 'texture'`        | Android only              |
| `onAttached`          | `(player: NitroPlayer) => void` | View attached             |
| `onDetached`          | `() => void`                    | View detached             |
| `onFullscreenChange`  | `(value: boolean) => void`      | Fullscreen changed        |
| `willEnterFullscreen` | `() => void`                    | Pre-enter callback        |
| `willExitFullscreen`  | `() => void`                    | Pre-exit callback         |

## `NitroPlayerViewRef`

| Member                              | Type                   | Notes               |
| ----------------------------------- | ---------------------- | ------------------- |
| `player`                            | `NitroPlayer`          | Imperative player   |
| `isAttached`                        | `boolean`              | Native attach state |
| `enterFullscreen()`                 | `void`                 | Enter fullscreen    |
| `exitFullscreen()`                  | `void`                 | Exit fullscreen     |
| `addEventListener(event, listener)` | `ListenerSubscription` | View events         |

## `NitroPlayer` properties

| Property                 | Type                     | Get | Set |
| ------------------------ | ------------------------ | --- | --- |
| `source`                 | `NitroPlayerSource`      | yes | no  |
| `playbackState`          | `PlaybackState`          | yes | no  |
| `memorySnapshot`         | `MemorySnapshot`         | yes | no  |
| `status`                 | `NitroPlayerStatus`      | yes | no  |
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

## `NitroPlayer` methods

| Method                              | Returns                | Notes                                                             |
| ----------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `play()`                            | `void`                 | Start playback; valid before `onLoad`                             |
| `pause()`                           | `void`                 | Pause playback                                                    |
| `seekTo(seconds)`                   | `void`                 | Absolute seek                                                     |
| `seekBy(seconds)`                   | `void`                 | Relative seek                                                     |
| `initialize()`                      | `Promise<void>`        | Manual initialization                                             |
| `preload()`                         | `Promise<void>`        | Preload without starting playback                                 |
| `replaceSourceAsync(source)`        | `Promise<void>`        | Replace with `NitroSourceConfig` or `NitroPlayerSource`           |
| `clearSourceAsync()`                | `Promise<void>`        | Clear current source and keep player reusable                     |
| `release()`                         | `void`                 | Terminal teardown                                                 |
| `addEventListener(event, listener)` | `ListenerSubscription` | Subscribe to a player event. Returned subscription has `remove()` |

## `PlaybackState`

| Field               | Type                    | Notes                                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------------------- |
| `status`            | `NitroPlayerStatus`     | `idle`, `loading`, `playing`, `paused`, `buffering`, `ended`, `error` |
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

## Player events

| Event               | Payload              |
| ------------------- | -------------------- |
| `onPlaybackState`   | `PlaybackState`      |
| `onLoad`            | `onLoadData`         |
| `onLoadStart`       | `onLoadStartData`    |
| `onError`           | `PlaybackError`      |
| `onFirstFrame`      | `onFirstFrameData`   |
| `onBandwidthUpdate` | `BandwidthData`      |
| `onVolumeChange`    | `onVolumeChangeData` |

Subscribe to any of these events directly on the player instance:

```ts
const subscription = player.addEventListener('onPlaybackState', state => {
  console.log(state.status, state.currentTime);
});
// later
subscription.remove();
```

`NitroPlayerViewRef.addEventListener` uses the same shape but handles view events (`onAttached`, `onDetached`, `onFullscreenChange`, `willEnterFullscreen`, `willExitFullscreen`). The `useEvent` hook wraps `player.addEventListener` with automatic cleanup.

`onFirstFrame` is sticky for the active source generation. Late listeners receive the latest generated first frame immediately. `replaceSourceAsync()`, `clearSourceAsync()`, and `release()` reset that sticky state.

Mounted `NitroPlayerView` surfaces do not need JS orchestration just to reveal the first visual frame. When `preview.autoThumbnail !== false`, the native view owns that placeholder/reveal path for the active source generation.

## Imperative patterns

| Goal                          | API                                       |
| ----------------------------- | ----------------------------------------- |
| Start before load completes   | `player.play()`                           |
| Warm source without playback  | `player.preload()`                        |
| Replace active source         | `await player.replaceSourceAsync(source)` |
| Reset player to reusable idle | `await player.clearSourceAsync()`         |
| Terminal teardown             | `player.release()`                        |

## Utility surfaces

| API                                   | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `streamCache.prefetch(source)`        | Warm transport and first segment cache               |
| `streamCache.getStats(source?)`       | Total or per-source stream cache stats, header-aware |
| `streamCache.clear()`                 | Clear disk cache                                     |
| `videoPreview.getFirstFrame(source)`  | Manual first-frame lookup with generation on miss    |
| `videoPreview.peekFirstFrame(source)` | Cached-only first-frame lookup                       |
| `videoPreview.clear()`                | Clear cached preview artifacts                       |

`streamCache.getStats(source)`, `videoPreview.getFirstFrame(source)`, and `videoPreview.peekFirstFrame(source)` all accept either a URL string or `{ uri, headers }`. Use the object form whenever headers are part of the request identity.

## Hooks

| Hook                                | Returns                 | Purpose                      |
| ----------------------------------- | ----------------------- | ---------------------------- |
| `usePlaybackState(player)`          | `PlaybackState \| null` | Raw native playback snapshot |
| `useEvent(target, event, listener)` | `void`                  | Event subscription helper    |
