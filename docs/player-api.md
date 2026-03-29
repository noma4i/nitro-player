# NitroPlayer API

Access the imperative player as `ref.current.player`. Treat view attachment as `ref.current.isAttached` or `onAttached` / `onDetached`.

## `NitroPlayerView`

| Prop | Type | Notes |
|------|------|-------|
| `source` | `NitroSourceConfig` | Required |
| `playerDefaults` | `NitroPlayerDefaults` | Declarative startup state |
| `controls` | `boolean` | Native controls |
| `resizeMode` | `ResizeMode` | View scaling |
| `keepScreenAwake` | `boolean` | Screen wake lock |
| `surfaceType` | `'surface' \| 'texture'` | Android only |
| `onAttached` | `(player: NitroPlayer) => void` | View attached |
| `onDetached` | `() => void` | View detached |
| `onFullscreenChange` | `(value: boolean) => void` | Fullscreen changed |
| `willEnterFullscreen` | `() => void` | Pre-enter callback |
| `willExitFullscreen` | `() => void` | Pre-exit callback |

## `NitroPlayerViewRef`

| Member | Type | Notes |
|--------|------|-------|
| `player` | `NitroPlayer` | Imperative player |
| `isAttached` | `boolean` | Native attach state |
| `enterFullscreen()` | `void` | Enter fullscreen |
| `exitFullscreen()` | `void` | Exit fullscreen |
| `addEventListener(event, listener)` | `ListenerSubscription` | View events |

## `NitroPlayer` properties

| Property | Type | Get | Set |
|----------|------|-----|-----|
| `source` | `NitroPlayerSource` | yes | no |
| `playbackState` | `PlaybackState` | yes | no |
| `memorySnapshot` | `MemorySnapshot` | yes | no |
| `status` | `NitroPlayerStatus` | yes | no |
| `duration` | `number` | yes | no |
| `currentTime` | `number` | yes | yes |
| `volume` | `number` | yes | yes |
| `muted` | `boolean` | yes | yes |
| `loop` | `boolean` | yes | yes |
| `rate` | `number` | yes | yes |
| `isPlaying` | `boolean` | yes | no |
| `isBuffering` | `boolean` | yes | no |
| `isReadyToDisplay` | `boolean` | yes | no |
| `bufferDuration` | `number` | yes | no |
| `bufferedPosition` | `number` | yes | no |
| `mixAudioMode` | `MixAudioMode` | yes | yes |
| `ignoreSilentSwitchMode` | `IgnoreSilentSwitchMode` | yes | yes |
| `playInBackground` | `boolean` | yes | yes |
| `playWhenInactive` | `boolean` | yes | yes |

## `NitroPlayer` methods

| Method | Returns | Notes |
|--------|---------|-------|
| `play()` | `void` | Start playback |
| `pause()` | `void` | Pause playback |
| `seekTo(seconds)` | `void` | Absolute seek |
| `seekBy(seconds)` | `void` | Relative seek |
| `initialize()` | `Promise<void>` | Manual initialization |
| `preload()` | `Promise<void>` | Preload without starting playback |
| `replaceSourceAsync(source)` | `Promise<void>` | Replace with a new `NitroSourceConfig` or `NitroPlayerSource` |
| `clearSourceAsync()` | `Promise<void>` | Clear current source and keep player reusable |
| `release()` | `void` | Terminal teardown |

## `PlaybackState`

| Field | Type | Notes |
|------|------|-------|
| `status` | `NitroPlayerStatus` | `idle`, `loading`, `playing`, `paused`, `buffering`, `ended`, `error` |
| `currentTime` | `number` | Seconds |
| `duration` | `number` | Seconds |
| `bufferDuration` | `number` | Seconds buffered ahead |
| `bufferedPosition` | `number` | Absolute buffered position |
| `rate` | `number` | Effective playback rate |
| `isPlaying` | `boolean` | Native playing state |
| `isBuffering` | `boolean` | Native buffering state |
| `isReadyToDisplay` | `boolean` | First frame readiness |
| `error` | `PlaybackError \| null` | Present when `status === 'error'` |
| `nativeTimestampMs` | `number` | Native event timestamp |

## Player events

| Event | Payload |
|-------|---------|
| `onPlaybackState` | `PlaybackState` |
| `onLoad` | `onLoadData` |
| `onLoadStart` | `onLoadStartData` |
| `onBandwidthUpdate` | `BandwidthData` |
| `onVolumeChange` | `onVolumeChangeData` |

Errors do not emit a standalone `onError` event in `1.0.0`. Use `onPlaybackState` and inspect `status` plus `error`.

## Hooks

| Hook | Returns | Purpose |
|------|---------|---------|
| `usePlaybackState(player)` | `PlaybackState` | Interpolated playback snapshot |
| `useEvent(target, event, listener)` | `void` | Event subscription helper |
