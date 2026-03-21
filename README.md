# NitroPlay

Lightweight video player (native + JS) + HLS caching proxy for React Native.

```bash
yarn add https://github.com/noma4i/nitro-player.git#v0.1.9
```

## Quick Start

```tsx
import { NitroPlayerView } from '@noma4i/nitro-play';

<NitroPlayerView
  source={{ uri: 'https://cdn.example.com/video.m3u8' }}
  style={{ flex: 1 }}
/>;
```

That's it. The player creates itself. HLS segments are cached to disk automatically. The proxy starts lazily inside the library on first HLS use. Everything cleans up on unmount.

---

## Installation

### 1. Install the package

```bash
yarn add https://github.com/noma4i/nitro-player.git#v0.1.9
# or
npm install https://github.com/noma4i/nitro-player.git#v0.1.9
```

### 2. Install peer dependencies

```bash
yarn add react-native-nitro-modules
```

### 3. iOS - install pods

```bash
cd ios && pod install
```

### 4. Android - no extra steps

NanoHTTPD and ExoPlayer are bundled automatically.

## NitroPlayerView

The only component you need. Pass a source - it creates the player internally.

```tsx
<NitroPlayerView
  source={{ uri: 'https://cdn.example.com/video.m3u8' }}
  setup={p => {
    p.loop = true;
    p.volume = 0.5;
  }}
  style={{ flex: 1 }}
  resizeMode="cover"
/>
```

### Props

| Prop              | Type                                     | Default      | Description                                |
| ----------------- | ---------------------------------------- | ------------ | ------------------------------------------ |
| `source`          | `NitroPlayerConfig \| NitroPlayerSource` | **required** | URL string, asset number, or config object |
| `setup`           | `(player: NitroPlayer) => void`          | -            | Configure player on creation               |
| `style`           | `ViewStyle`                              | -            | Standard React Native style                |
| `controls`        | `boolean`                                | `false`      | Show native playback controls              |
| `resizeMode`      | `ResizeMode`                             | `'none'`     | How video fills the view                   |
| `keepScreenAwake` | `boolean`                                | `true`       | Prevent screen from sleeping               |
| `surfaceType`     | `'surface' \| 'texture'`                 | `'surface'`  | Android only                               |

### ResizeMode

| Value       | Behavior                                    |
| ----------- | ------------------------------------------- |
| `'none'`    | No resizing                                 |
| `'contain'` | Fit inside view, maintain aspect ratio      |
| `'cover'`   | Fill view, maintain aspect ratio (may crop) |
| `'stretch'` | Fill view, ignore aspect ratio              |

### Ref (NitroPlayerViewRef)

```tsx
const ref = useRef<NitroPlayerViewRef>(null);

ref.current?.player.play();
ref.current?.enterFullscreen();
```

| Property/Method      | Type                   | Description              |
| -------------------- | ---------------------- | ------------------------ |
| `player`             | `NitroPlayer`          | The player instance      |
| `enterFullscreen()`  | `void`                 | Enter fullscreen mode    |
| `exitFullscreen()`   | `void`                 | Exit fullscreen mode     |
| `addEventListener()` | `ListenerSubscription` | Subscribe to view events |

### View Events

| Event                 | Payload                 | When                      |
| --------------------- | ----------------------- | ------------------------- |
| `onFullscreenChange`  | `(fullscreen: boolean)` | Fullscreen state changed  |
| `willEnterFullscreen` | `()`                    | About to enter fullscreen |
| `willExitFullscreen`  | `()`                    | About to exit fullscreen  |

### Source Formats

```tsx
// String URL
<NitroPlayerView source="https://example.com/video.mp4" />

// Config object
<NitroPlayerView source={{ uri: 'https://example.com/video.mp4', headers: { Authorization: 'Bearer token' } }} />

// Local asset
<NitroPlayerView source={require('./assets/intro.mp4')} />

// Disable HLS proxy
<NitroPlayerView source={{ uri: 'https://example.com/live.m3u8', useHlsProxy: false }} />

// Memory config for feed
<NitroPlayerView source={{
  uri: 'https://example.com/video.mp4',
  memoryConfig: { profile: 'feed' },
}} />
```

---

## NitroPlayer

Access via `ref.current.player`.

### Properties

| Property           | Type                | Get | Set | Description                        |
| ------------------ | ------------------- | --- | --- | ---------------------------------- |
| `playbackState`    | `PlaybackState`     | yes | -   | Full native playback snapshot      |
| `memorySnapshot`   | `MemorySnapshot`    | yes | -   | Native RAM snapshot                |
| `status`           | `NitroPlayerStatus` | yes | -   | Current state                      |
| `duration`         | `number`            | yes | -   | Duration in seconds                |
| `currentTime`      | `number`            | yes | yes | Position in seconds                |
| `volume`           | `number`            | yes | yes | Volume 0.0-1.0                     |
| `muted`            | `boolean`           | yes | yes | Mute state (saves/restores volume) |
| `loop`             | `boolean`           | yes | yes | Loop playback                      |
| `rate`             | `number`            | yes | yes | Playback speed                     |
| `isPlaying`        | `boolean`           | yes | -   | Currently playing?                 |
| `isBuffering`      | `boolean`           | yes | -   | Currently buffering?               |
| `isReadyToDisplay` | `boolean`           | yes | -   | First frame ready?                 |
| `mixAudioMode`     | `MixAudioMode`      | yes | yes | Audio mixing                       |
| `playInBackground` | `boolean`           | yes | yes | Continue in background             |

### Methods

| Method                       | Returns         | Description              |
| ---------------------------- | --------------- | ------------------------ |
| `play()`                     | `void`          | Start playback           |
| `pause()`                    | `void`          | Pause playback           |
| `seekTo(seconds)`            | `void`          | Seek to position         |
| `seekBy(seconds)`            | `void`          | Seek relative            |
| `initialize()`               | `Promise<void>` | Manual init              |
| `preload()`                  | `Promise<void>` | Preload without playing  |
| `release()`                  | `void`          | Release native resources |
| `replaceSourceAsync(source)` | `Promise<void>` | Change source            |

### Player Events

| Event               | Payload                                                 | When                                       |
| ------------------- | ------------------------------------------------------- | ------------------------------------------ |
| `onPlaybackState`   | `PlaybackState`                                         | Playback snapshot (250ms native, 60fps JS) |
| `onLoad`            | `{ currentTime, duration, width, height, orientation }` | Source loaded                              |
| `onLoadStart`       | `{ sourceType, source }`                                | Started loading                            |
| `onBandwidthUpdate` | `{ bitrate, width?, height? }`                          | Bandwidth estimate                         |
| `onVolumeChange`    | `{ volume, muted }`                                     | Volume changed                             |
| `onError`           | `NitroPlayerRuntimeError`                               | Error occurred                             |

### Playback UI

```tsx
import { usePlaybackState } from '@noma4i/nitro-play';

const playback = usePlaybackState(player);
// 60fps interpolation from 250ms native ticks
// Uses performance.now() for monotonic timing
const progress = playback.duration > 0 ? playback.currentTime / playback.duration : 0;
```

---

## HLS Cache Proxy

Built-in localhost HTTP server that caches HLS segments to disk. All `.m3u8` URLs are automatically routed through the proxy.

| Method                                | Description                  |
| ------------------------------------- | ---------------------------- |
| `start(port?)`                        | Start proxy (default: 18181) |
| `stop()`                              | Stop proxy                   |
| `prefetchFirstSegment(url, headers?)` | Pre-download first segment   |
| `getCacheStats()`                     | Get cache usage              |
| `getStreamCacheStats(url)`            | Per-stream cache stats       |
| `clearCache()`                        | Delete all cached segments   |

Cache: 5 GB max, 7d TTL, LRU eviction. Manifest responses always fresh (no-cache headers).

---

## Requirements

| Dependency                 | Version   |
| -------------------------- | --------- |
| React Native               | >= 0.77.0 |
| react-native-nitro-modules | >= 0.35.0 |

## Native Dependencies (bundled)

| Dependency         | Platform | Version |
| ------------------ | -------- | ------- |
| ExoPlayer (Media3) | Android  | 1.9.3   |
| GCDWebServer       | iOS      | ~> 3.5  |
| NanoHTTPD          | Android  | 2.3.1   |

## License

MIT
