# NitroPlay

Lightweight video player (native + JS) + HLS caching proxy for React Native.

```bash
yarn add https://github.com/noma4i/nitro-player.git#v0.3.0
```

## Quick Start

```tsx
import { NitroPlayerView } from '@noma4i/nitro-play';

<NitroPlayerView
  source={{ uri: 'https://cdn.example.com/video.m3u8' }}
  style={{ flex: 1 }}
/>;
```

The player creates itself. HLS segments are cached to disk automatically. Everything cleans up on unmount.

## Documentation

| Topic                                          | Description                                   |
| ---------------------------------------------- | --------------------------------------------- |
| [Player API](docs/player-api.md)               | Properties, methods, events, hooks            |
| [Source Config](docs/source-config.md)         | NitroPlayerConfig, source formats             |
| [Buffer Config](docs/buffer-config.md)         | Platform-specific buffer tuning               |
| [Memory Management](docs/memory-management.md) | Feed optimization, retention states, hot pool |
| [HLS Cache Proxy](docs/hls-cache-proxy.md)     | Cache policy, eviction, prefetch              |

## Installation

```bash
yarn add https://github.com/noma4i/nitro-player.git#v0.3.0
yarn add react-native-nitro-modules

# iOS
cd ios && pod install
```

Android - no extra steps. ExoPlayer and NanoHTTPD are bundled.

## NitroPlayerView

```tsx
<NitroPlayerView
  source={{ uri: 'https://cdn.example.com/video.m3u8' }}
  setup={p => {
    p.loop = true;
    p.volume = 0.5;
  }}
  controls
  resizeMode="cover"
  style={{ flex: 1 }}
/>
```

| Prop              | Type                                          | Default      | Description                   |
| ----------------- | --------------------------------------------- | ------------ | ----------------------------- |
| `source`          | `NitroPlayerConfig \| string \| number`       | **required** | URL, asset, or config object  |
| `setup`           | `(player: NitroPlayer) => void`               | -            | Configure player on creation  |
| `controls`        | `boolean`                                     | `false`      | Show native playback controls |
| `resizeMode`      | `'none' \| 'contain' \| 'cover' \| 'stretch'` | `'none'`     | How video fills the view      |
| `keepScreenAwake` | `boolean`                                     | `true`       | Prevent screen from sleeping  |
| `surfaceType`     | `'surface' \| 'texture'`                      | `'surface'`  | Android only                  |

### Ref

```tsx
const ref = useRef<NitroPlayerViewRef>(null);
if (ref.current?.isAttached) {
  ref.current.player.play();
}
ref.current?.enterFullscreen();
```

### View Events

| Event                 | Payload                   | When                      |
| --------------------- | ------------------------- | ------------------------- |
| `onAttached`          | `NitroPlayer`             | Native video view attached |
| `onDetached`          | -                         | Native video view detached |
| `onFullscreenChange`  | `boolean`                 | Fullscreen state changed  |
| `willEnterFullscreen` | -                         | About to enter fullscreen |
| `willExitFullscreen`  | -                         | About to exit fullscreen  |
| `onError`             | `NitroPlayerRuntimeError` | Error occurred            |

See [Player API](docs/player-api.md) for player properties, methods, and events.

## HLS Cache Proxy

Built-in localhost proxy that caches HLS segments. Auto-starts on first HLS use.

```typescript
import { hlsCacheProxy } from '@noma4i/nitro-play';

hlsCacheProxy.prefetchFirstSegment('https://cdn.example.com/video.m3u8');
const stats = await hlsCacheProxy.getCacheStats();
```

5 GB max, 7d TTL, stream-based LRU eviction at 80% capacity. See [HLS Cache Proxy](docs/hls-cache-proxy.md) for details.

## Requirements

| Dependency                 | Version   |
| -------------------------- | --------- |
| React Native               | >= 0.77.0 |
| react-native-nitro-modules | >= 0.35.0 |

### Native Dependencies (bundled)

| Dependency         | Platform | Version |
| ------------------ | -------- | ------- |
| ExoPlayer (Media3) | Android  | 1.9.3   |
| GCDWebServer       | iOS      | ~> 3.5  |
| NanoHTTPD          | Android  | 2.3.1   |

## License

MIT
