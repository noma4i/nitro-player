# React Native Video Player

Lightweight video player + HLS caching proxy for React Native.

```bash
yarn add @noma4i/just-player
```

## Quick Start

```tsx
import { VideoView, hlsCacheProxy } from '@noma4i/just-player';

// 1. Start HLS proxy once (App.tsx)
hlsCacheProxy.start();

// 2. Done. One component, one line.
<VideoView source={{ uri: 'https://cdn.example.com/video.m3u8' }} style={{ flex: 1 }} />
```

That's it. The player creates itself. HLS segments are cached to disk automatically. Everything cleans up on unmount.

---

## Installation

### 1. Install the package

```bash
yarn add @noma4i/just-player
# or
npm install @noma4i/just-player
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

---

## VideoView

The only component you need. Pass a source - it creates the player internally.

```tsx
<VideoView
  source={{ uri: 'https://cdn.example.com/video.m3u8' }}
  setup={(p) => { p.loop = true; p.volume = 0.5; }}
  style={{ flex: 1 }}
  resizeMode="cover"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | [`VideoConfig`](#source-formats) \| `VideoSource` | **required** | URL string, asset number, or config object |
| `setup` | `(player:` [`VideoPlayer`](#videoplayer)`) => void` | - | Configure player on creation |
| `style` | `ViewStyle` | - | Standard React Native style |
| `controls` | `boolean` | `false` | Show native playback controls |
| `resizeMode` | [`ResizeMode`](#resizemode) | `'none'` | How video fills the view |
| `keepScreenAwake` | `boolean` | `true` | Prevent screen from sleeping |
| `surfaceType` | `'surface' \| 'texture'` | `'surface'` | Android only. Use `'texture'` for rounded corners / animations |
| `pictureInPicture` | `boolean` | `false` | Enable PiP button in controls |
| `autoEnterPictureInPicture` | `boolean` | `false` | Auto-enter PiP when navigating away |

### ResizeMode

| Value | Behavior |
|-------|----------|
| `'none'` | No resizing |
| `'contain'` | Fit inside view, maintain aspect ratio (letterbox) |
| `'cover'` | Fill view, maintain aspect ratio (may crop) |
| `'stretch'` | Fill view, ignore aspect ratio |

### Ref (VideoViewRef)

Access the player and view methods via `useRef<VideoViewRef>()`:

```tsx
const ref = useRef<VideoViewRef>(null);

// Access the player
ref.current?.player.play();
ref.current?.player.pause();
ref.current?.player.seekTo(30);
```

| Property/Method | Type | Description |
|----------------|------|-------------|
| `player` | [`VideoPlayer`](#videoplayer) | The player instance for imperative control |
| `enterFullscreen()` | `void` | Enter fullscreen mode |
| `exitFullscreen()` | `void` | Exit fullscreen mode |
| `enterPictureInPicture()` | `void` | Enter PiP mode |
| `exitPictureInPicture()` | `void` | Exit PiP mode |
| `canEnterPictureInPicture()` | `boolean` | Check PiP support |

### View Events

| Event | Payload | When |
|-------|---------|------|
| `onFullscreenChange` | `(fullscreen: boolean)` | Fullscreen state changed |
| `onPictureInPictureChange` | `(isInPiP: boolean)` | PiP state changed |
| `willEnterFullscreen` | `()` | About to enter fullscreen |
| `willExitFullscreen` | `()` | About to exit fullscreen |
| `willEnterPictureInPicture` | `()` | About to enter PiP |
| `willExitPictureInPicture` | `()` | About to exit PiP |

### Source Formats

```tsx
// Simple - just a URL
<VideoView source={{ uri: 'https://example.com/video.mp4' }} />

// With headers
<VideoView source={{ uri: 'https://example.com/video.mp4', headers: { Authorization: 'Bearer token' } }} />

// With full config
<VideoView source={{
  uri: 'https://example.com/video.mp4',
  metadata: { title: 'My Video', artist: 'Author' },
  bufferConfig: { minBufferMs: 5000, maxBufferMs: 10000, bufferForPlaybackMs: 1000 },
}} />

// With setup
<VideoView source={{ uri }} setup={(p) => { p.loop = true; p.volume = 0.5; }} />
```

---

## VideoPlayer

The player instance. Access via `ref.current.player`.

### Properties

| Property | Type | Get | Set | Description |
|----------|------|-----|-----|-------------|
| `status` | [`VideoPlayerStatus`](#videoplayerstatus) | yes | - | Current state |
| `duration` | `number` | yes | - | Duration in seconds (`NaN` if unknown) |
| `currentTime` | `number` | yes | yes | Position in seconds |
| `volume` | `number` | yes | yes | Volume 0.0 - 1.0 |
| `muted` | `boolean` | yes | yes | Mute state |
| `loop` | `boolean` | yes | yes | Loop playback |
| `rate` | `number` | yes | yes | Playback speed (1.0 = normal) |
| `isPlaying` | `boolean` | yes | - | Currently playing? |
| `mixAudioMode` | [`MixAudioMode`](#mixaudiomode) | yes | yes | Audio mixing behavior |
| `ignoreSilentSwitchMode` | [`IgnoreSilentSwitchMode`](#ignoresilentswitchmode-ios-only) | yes | yes | iOS silent switch behavior |
| `playInBackground` | `boolean` | yes | yes | Continue in background |
| `playWhenInactive` | `boolean` | yes | yes | Continue when app inactive |
| `showNotificationControls` | `boolean` | yes | yes | Show media notification |
| `selectedTrack` | `TextTrack \| undefined` | yes | - | Current subtitle track |

### VideoPlayerStatus

| Value | Meaning |
|-------|---------|
| `'idle'` | Not loaded / ended |
| `'loading'` | Loading source |
| `'readyToPlay'` | Ready and can play |
| `'error'` | Error occurred |

### MixAudioMode

| Value | Behavior |
|-------|----------|
| `'auto'` | System default |
| `'mixWithOthers'` | Play alongside other audio |
| `'doNotMix'` | Pause other audio |
| `'duckOthers'` | Lower other audio volume |

### IgnoreSilentSwitchMode (iOS only)

| Value | Behavior |
|-------|----------|
| `'auto'` | System default |
| `'ignore'` | Play audio even in silent mode |
| `'obey'` | Respect silent mode |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `play()` | `void` | Start playback |
| `pause()` | `void` | Pause playback |
| `seekTo(seconds)` | `void` | Seek to position |
| `seekBy(seconds)` | `void` | Seek relative to current |
| `initialize()` | `Promise<void>` | Manually initialize (if `initializeOnCreation: false`) |
| `preload()` | `Promise<void>` | Preload without playing |
| `release()` | `void` | Release native resources |
| `replaceSourceAsync(source)` | `Promise<void>` | Change video source (pass `null` to clear) |
| `getAvailableTextTracks()` | `TextTrack[]` | List subtitle tracks |
| `selectTextTrack(track)` | `void` | Select subtitle track (pass `null` to disable) |

### Player Events

Subscribe via `player.addEventListener(event, callback)`:

| Event | Payload | When |
|-------|---------|------|
| `onLoadStart` | `{ sourceType, source }` | Started loading |
| `onLoad` | `{ currentTime, duration, width, height, orientation }` | Loaded & ready |
| `onProgress` | `{ currentTime, bufferDuration }` | Progress update (250ms) |
| `onEnd` | - | Playback ended |
| `onBuffer` | `(buffering: boolean)` | Buffering state changed |
| `onStatusChange` | `(status:` [`VideoPlayerStatus`](#videoplayerstatus)`)` | Status changed |
| `onPlaybackStateChange` | `{ isPlaying, isBuffering }` | Play/buffer state |
| `onPlaybackRateChange` | `(rate: number)` | Rate changed |
| `onVolumeChange` | `{ volume, muted }` | Volume changed |
| `onSeek` | `(seekTime: number)` | Seek completed |
| `onReadyToDisplay` | - | First frame ready |
| `onError` | `(error: VideoRuntimeError)` | Error occurred |
| `onBandwidthUpdate` | `{ bitrate, width?, height? }` | Bandwidth estimate |
| `onTimedMetadata` | `{ metadata: [...] }` | Timed metadata received |
| `onTextTrackDataChanged` | `(texts: string[])` | Subtitle text changed |
| `onTrackChange` | `(track: TextTrack \| null)` | Selected track changed |
| `onAudioBecomingNoisy` | - | Headphones unplugged (Android) |
| `onAudioFocusChange` | `(hasAudioFocus: boolean)` | Audio focus changed (Android) |

---

## HLS Cache Proxy

Built-in localhost HTTP server that caches HLS segments to disk. **It's integrated into the player** - all `.m3u8` URLs are automatically routed through the proxy. You don't need to rewrite URLs yourself.

### Setup (one line)

```tsx
// App.tsx - call once on app boot
import { hlsCacheProxy } from '@noma4i/just-player';

useEffect(() => {
  hlsCacheProxy.start();
  return () => hlsCacheProxy.stop();
}, []);
```

That's it. Now every `.m3u8` URL you pass to `VideoView` is automatically cached:

```tsx
// This URL goes through the proxy automatically
<VideoView source={{ uri: 'https://cdn.example.com/stream.m3u8', headers: { Authorization: 'Bearer token' } }} />

// Non-HLS URLs (.mp4, .mov, etc.) are NOT proxied
<VideoView source={{ uri: 'https://example.com/video.mp4' }} />
```

### How It Works

```
 Your code                    just-player                     Network
 ─────────                    ───────────                     ───────
                  ┌─ .m3u8? ──→ localhost:18181 ──→ fetch manifest
 <VideoView    ──→│              rewrite URLs        cache segments
   source={}>     │              serve from cache
                  └─ .mp4?  ──→ pass through (no proxy)
```

| Step | What happens |
|------|-------------|
| 1 | You pass `.m3u8` URL to [`VideoView`](#videoview) |
| 2 | `sourceFactory` detects `.m3u8` and calls `hlsCacheProxy.getProxiedUrl()` |
| 3 | URL becomes `http://127.0.0.1:18181/hls/manifest?url=...&headers=...` |
| 4 | Native player requests manifest from localhost |
| 5 | Proxy fetches real manifest, rewrites segment URLs to localhost |
| 6 | Player requests segments → proxy checks cache → hit? disk : fetch+cache |

### Opt-out

To disable proxy for a specific source:

```tsx
<VideoView source={{ uri: 'https://example.com/stream.m3u8', useHlsProxy: false }} />
```

| `useHlsProxy` | `.m3u8` URL | `.mp4` URL |
|---------------|-------------|------------|
| `true` (default) | Proxied | Not proxied |
| `false` | Not proxied | Not proxied |
| proxy not started | Not proxied (fallback) | Not proxied |

### Prefetch

Pre-download segments before the user starts watching:

```tsx
import { hlsCacheProxy } from '@noma4i/just-player';

// Downloads: manifest → init segment → first segment
await hlsCacheProxy.prefetchFirstSegment(
  'https://cdn.example.com/stream.m3u8',
  { Authorization: 'Bearer token' }
);
```

### Cache Management

```tsx
// Get cache stats
const stats = await hlsCacheProxy.getCacheStats();
// { totalSize: 1073741824, fileCount: 342, maxSize: 5368709120 }

// Clear all cached segments
await hlsCacheProxy.clearCache();
```

### hlsCacheProxy Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start(port?)` | `void` | Start proxy. Default port: `18181` |
| `stop()` | `void` | Stop proxy |
| `getProxiedUrl(url, headers?)` | `string` | Rewrite URL (called automatically by player) |
| `prefetchFirstSegment(url, headers?)` | `Promise<void>` | Pre-download manifest + first segment |
| `getCacheStats()` | `Promise<`[`HlsCacheStats`](#hlscachestats)`>` | Get cache usage |
| `clearCache()` | `Promise<boolean>` | Delete all cached segments |

### HlsCacheStats

| Field | Type | Description |
|-------|------|-------------|
| `totalSize` | `number` | Bytes used (e.g. `1_073_741_824` = 1 GB) |
| `fileCount` | `number` | Number of cached segment files |
| `maxSize` | `number` | Max cache size (`5_368_709_120` = 5 GB) |

### Cache Settings

| Setting | Value |
|---------|-------|
| Max size | 5 GB |
| TTL | 7 days |
| Eviction | Expired first, then LRU |
| Storage | `{cacheDir}/hls-cache/` |
| File naming | `SHA256(url).seg` |

### iOS Self-Heal

On iOS, the proxy server automatically restarts when the app returns to foreground. No extra code needed.

---

## Full Example

See the [`example/`](./example) directory for a complete working app.

---

## Requirements

| Dependency | Version |
|-----------|---------|
| React Native | >= 0.77.0 |
| react-native-nitro-modules | >= 0.35.0 |

## Native Dependencies (bundled)

| Dependency | Platform | Version |
|-----------|----------|---------|
| ExoPlayer (Media3) | Android | 1.9.3 |
| GCDWebServer | iOS | ~> 3.5 |
| NanoHTTPD | Android | 2.3.1 |

## License

MIT
