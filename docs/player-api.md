# NitroPlayer API

Access via `ref.current.player` or the `setup` callback.

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
| `'duckOthers'` | Lower other audio volume |

### IgnoreSilentSwitchMode (iOS only)

| Value | Behavior |
|-------|----------|
| `'auto'` | Respect silent switch |
| `'ignore'` | Play audio even in silent mode |

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
| `replaceSourceAsync(source)` | `Promise<void>` | Replace source (null to clear) |

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
