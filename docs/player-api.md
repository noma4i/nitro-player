# NitroPlayer API

Access player commands via `ref.current.player`. Treat attach readiness as `ref.current.isAttached` or `onAttached`/`onDetached` view events. `setup` is configuration-only and is not an attach signal.

## Properties

| Property | Type | Get | Set | Description |
|----------|------|-----|-----|-------------|
| `playbackState` | `PlaybackState` | yes | - | Full native playback snapshot |
| `memorySnapshot` | `MemorySnapshot` | yes | - | Native RAM snapshot |
| `status` | `NitroPlayerStatus` | yes | - | Current state |
| `duration` | `number` | yes | - | Duration in seconds |
| `currentTime` | `number` | yes | yes | Position in seconds |
| `volume` | `number` | yes | yes | Volume 0.0-1.0 |
| `muted` | `boolean` | yes | yes | Mute state (saves/restores volume) |
| `loop` | `boolean` | yes | yes | Loop playback |
| `rate` | `number` | yes | yes | Playback speed |
| `isPlaying` | `boolean` | yes | - | Currently playing? |
| `isBuffering` | `boolean` | yes | - | Currently buffering? |
| `isReadyToDisplay` | `boolean` | yes | - | First frame ready? |
| `bufferDuration` | `number` | yes | - | Buffered duration in seconds |
| `bufferedPosition` | `number` | yes | - | Buffered position in seconds |
| `mixAudioMode` | `MixAudioMode` | yes | yes | Audio mixing behavior |
| `ignoreSilentSwitchMode` | `IgnoreSilentSwitchMode` | yes | yes | iOS silent switch handling |
| `playInBackground` | `boolean` | yes | yes | Continue in background |
| `playWhenInactive` | `boolean` | yes | yes | Continue when app inactive |

### NitroPlayerStatus

`'idle'` | `'loading'` | `'playing'` | `'paused'` | `'buffering'` | `'ended'` | `'error'`

### MixAudioMode

| Value | Behavior |
|-------|----------|
| `'auto'` | Default system behavior |
| `'mixWithOthers'` | Mix with other audio sources |
| `'doNotMix'` | Request exclusive audio focus |
| `'duckOthers'` | Lower other audio volume |

### IgnoreSilentSwitchMode (iOS only)

| Value | Behavior |
|-------|----------|
| `'auto'` | Respect silent switch |
| `'ignore'` | Play audio even in silent mode |
| `'obey'` | Always obey the silent switch |

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `play()` | `void` | Start playback |
| `pause()` | `void` | Pause playback |
| `seekTo(seconds)` | `void` | Seek to absolute position |
| `seekBy(seconds)` | `void` | Seek relative to current |
| `initialize()` | `Promise<void>` | Manual initialization |
| `preload()` | `Promise<void>` | Preload without playing |
| `release()` | `void` | Release native resources |
| `replaceSourceAsync(source)` | `Promise<void>` | Replace source (`null` clears current source but keeps the player reusable) |

## Events

Subscribe via `useEvent` hook or `addEventListener` on view ref.

| Event | Payload | When |
|-------|---------|------|
| `onPlaybackState` | `PlaybackState` | Playback snapshot (250ms native, 60fps JS interpolation) |
| `onLoad` | `{ currentTime, duration, width, height, orientation }` | Source loaded and ready |
| `onLoadStart` | `{ sourceType, source }` | Started loading source |
| `onBandwidthUpdate` | `{ bitrate, width?, height? }` | Network bandwidth estimate |
| `onVolumeChange` | `{ volume, muted }` | Volume changed |
| `onError` | `NitroPlayerRuntimeError` | Error occurred |

### View Events

Subscribe via `ref.current?.addEventListener(...)` or `NitroPlayerView` props.

| Event | Payload | When |
|-------|---------|------|
| `onAttached` | `NitroPlayer` | Native view attached and ready to bind commands |
| `onDetached` | `void` | Native view detached from the window hierarchy |
| `onFullscreenChange` | `boolean` | Fullscreen state changed |
| `willEnterFullscreen` | `void` | About to enter fullscreen |
| `willExitFullscreen` | `void` | About to exit fullscreen |

## Hooks

### usePlaybackState

```tsx
import { usePlaybackState } from '@noma4i/nitro-play';

const playback = usePlaybackState(player);
// 60fps interpolation from 250ms native ticks
// Uses performance.now() for monotonic timing
```

Returns `PlaybackState` with interpolated `currentTime` for smooth progress bars.

### useEvent

```tsx
import { useEvent } from '@noma4i/nitro-play';

useEvent(player, 'onLoad', (data) => {
  console.log(`Loaded: ${data.width}x${data.height}`);
});
```
