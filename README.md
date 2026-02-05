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

If you want Android Picture in Picture, the host activity must support PiP in the app manifest.

## Testing

The library is validated with three layers:

- `npm run test:ts` for TS/public-contract tests
- `gradle -p android test` and `gradle -p android connectedAndroidTest` for Android library tests
- iOS `XCTest` through the podspec `UnitTests` test spec

Note: this library repo does not check in an Android Gradle wrapper, so Android tests require a Gradle installation on `PATH` or execution from a host app that provides the wrapper.

## Library Development

Nitro is the primary bridge layer for the player. The intended architecture is native-first: player state, timing, buffering, track logic and event emission should live in Swift/Kotlin, while JS stays as a thin UI/orchestration layer.

### Nitro toolchain

This repo treats Nitro codegen as part of the build, not as an optional manual step.

```bash
npm install
npm run codegen
npm run build
```

Canonical commands:

- `npm run nitrogen` or `npm run codegen:nitro` regenerates `nitrogen/generated/*` from `src/spec/nitro/*.nitro.ts`
- `npm run build` runs Nitro codegen first, then `react-native-builder-bob`
- `npx nitrogen .` is the underlying generator command

If you change `src/spec/nitro/*`, `nitro.json`, or the TS structs used by Nitro specs, regenerate `nitrogen/generated/*` before shipping native changes.

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
| `pictureInPicture` | `boolean` | `false` | Enable PiP controls and manual PiP entry |
| `autoEnterPictureInPicture` | `boolean` | `false` | Auto-enter PiP when app goes to background (Android/iOS when supported) |

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
| `canEnterPictureInPicture()` | `boolean` | Check runtime PiP support for the current platform/activity |

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
  memoryConfig: { profile: 'feed', preloadLevel: 'metadata', offscreenRetention: 'metadata' },
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
| `playbackState` | [`PlaybackState`](#playbackstate) | yes | - | Full native-first playback snapshot |
| `memorySnapshot` | [`MemorySnapshot`](#memorysnapshot) | yes | - | Native RAM snapshot for player + source |
| `status` | [`VideoPlayerStatus`](#videoplayerstatus) | yes | - | Current state |
| `duration` | `number` | yes | - | Duration in seconds (`NaN` if unknown) |
| `currentTime` | `number` | yes | yes | Position in seconds |
| `bufferDuration` | `number` | yes | - | Buffered seconds ahead of current position |
| `bufferedPosition` | `number` | yes | - | Absolute buffered position in seconds |
| `volume` | `number` | yes | yes | Volume 0.0 - 1.0 |
| `muted` | `boolean` | yes | yes | Mute state |
| `loop` | `boolean` | yes | yes | Loop playback |
| `rate` | `number` | yes | yes | Playback speed (1.0 = normal) |
| `isPlaying` | `boolean` | yes | - | Currently playing? |
| `isBuffering` | `boolean` | yes | - | Currently buffering? |
| `isReadyToDisplay` | `boolean` | yes | - | First-frame / render-ready state |
| `mixAudioMode` | [`MixAudioMode`](#mixaudiomode) | yes | yes | Audio mixing behavior |
| `ignoreSilentSwitchMode` | [`IgnoreSilentSwitchMode`](#ignoresilentswitchmode-ios-only) | yes | yes | iOS silent switch behavior |
| `playInBackground` | `boolean` | yes | yes | Continue in background |
| `playWhenInactive` | `boolean` | yes | yes | Continue when app inactive |
| `showNotificationControls` | `boolean` | yes | yes | Show media notification |
| `selectedTrack` | `TextTrack \| undefined` | yes | - | Current subtitle track |

### PlaybackState

```ts
type PlaybackState = {
  status: VideoPlayerStatus;
  currentTime: number;
  duration: number;
  bufferDuration: number;
  bufferedPosition: number;
  rate: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isReadyToDisplay: boolean;
  nativeTimestampMs: number;
};
```

### MemoryConfig

```ts
type MemoryConfig = {
  profile?: 'feed' | 'balanced' | 'immersive';
  preloadLevel?: 'none' | 'metadata' | 'buffered';
  offscreenRetention?: 'cold' | 'metadata' | 'hot';
  pauseTrimDelayMs?: number;
};
```

Defaults:

- `<VideoView />` uses `profile: 'feed'` unless `source.memoryConfig` overrides it
- direct `new VideoPlayer(...)` uses `profile: 'balanced'`
- `feed` defaults to metadata preload and metadata retention for offscreen paused players

### MemorySnapshot

```ts
type MemorySnapshot = {
  playerBytes: number;
  sourceBytes: number;
  totalBytes: number;
  preloadLevel: 'none' | 'metadata' | 'buffered';
  retentionState: 'cold' | 'metadata' | 'hot';
  isAttachedToView: boolean;
  isPlaying: boolean;
};
```

### VideoPlayerStatus

| Value | Meaning |
|-------|---------|
| `'idle'` | No active source |
| `'loading'` | Loading source |
| `'buffering'` | Waiting for more data |
| `'playing'` | Playback is advancing |
| `'paused'` | Loaded but not advancing |
| `'ended'` | Playback reached the end |
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
| `onLoad` | `{ currentTime, duration, width, height, orientation }` | Source metadata available |
| `onPlaybackState` | [`PlaybackState`](#playbackstate) | Unified playback snapshot |
| `onVolumeChange` | `{ volume, muted }` | Volume changed |
| `onError` | `(error: VideoRuntimeError)` | Error occurred |
| `onBandwidthUpdate` | `{ bitrate, width?, height? }` | Bandwidth estimate |
| `onTimedMetadata` | `{ metadata: [...] }` | Timed metadata received |
| `onTextTrackDataChanged` | `(texts: string[])` | Subtitle text changed |
| `onTrackChange` | `(track: TextTrack \| null)` | Selected track changed |
| `onAudioBecomingNoisy` | - | Headphones unplugged (Android) |
| `onAudioFocusChange` | `(hasAudioFocus: boolean)` | Audio focus changed (Android) |

### Playback UI

Use `usePlaybackState(player)` for progress bars and transport UI. It starts from synchronous native state and only interpolates `currentTime` locally while playback is actively advancing.

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

// Query strings / hash fragments are handled too
<VideoView source={{ uri: 'https://cdn.example.com/stream.M3U8?token=abc#live' }} />

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
