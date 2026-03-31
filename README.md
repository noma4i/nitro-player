# NitroPlay

Native-first video player for React Native with shared HLS transport, stream cache, and first-frame preview utilities.

Current prerelease: `1.0.0-beta.8`

## Installation

Install from GitHub tag `v1.0.0-beta.8`.

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
          feedPoolEligible: true,
        },
        preview: { mode: 'listener', autoThumbnail: true },
      }}
      resizeMode="contain"
      keepScreenAwake
      style={{ width: '100%', aspectRatio: 16 / 9 }}
    />
  );
}
```

## Core API

| Surface | Purpose |
| --- | --- |
| `NitroPlayerView` | Declarative native view with fullscreen and attach events |
| `NitroPlayer` | Imperative player object |
| `createNitroSource(config)` | Canonical reusable source factory |
| `streamCache` | Prefetch, cache stats, cache clearing |
| `videoPreview` | Manual first-frame lookup |
| `usePlaybackState(player)` | Raw native playback snapshot |
| `useEvent(target, event, listener)` | Event subscription helper |

## Source DSL

| Field | Type | Purpose |
| --- | --- | --- |
| `uri` | `string \| number` | Network URL or React Native asset |
| `headers` | `Record<string,string>` | Request headers |
| `metadata` | `NitroSourceMetadata` | Title, subtitle, description, artist, image |
| `startup` | `'eager' \| 'lazy'` | Startup strategy |
| `buffer` | `BufferConfig` | Explicit buffering policy |
| `retention` | `NitroSourceRetentionConfig` | Preload, offscreen retention, trim, feed eligibility |
| `transport` | `NitroSourceTransportConfig` | `auto`, `direct`, `proxy` |
| `preview` | `NitroSourcePreviewConfig` | Automatic first-frame policy |

## Runtime Contract

| Area | Behavior |
| --- | --- |
| Early play | `play()` before `onLoad` is canonical |
| Playback state | Built from native readiness, buffering, and actual playing state |
| HLS startup | Native runtime uses lazy startup and bounded startup recovery |
| Proxy fallback | `transport.mode='auto'` may fall back to direct URL if proxy is unavailable |
| First frame | `onFirstFrame` is sticky per active source generation |
| Preview policy | `preview.mode='listener'` auto-captures for attached views when `autoThumbnail !== false`; `always` warms preview automatically; `manual` disables background auto-warmup |
| Mounted-view reveal | Attached `NitroPlayerView` owns native auto-thumbnail/first-frame placeholder by default; app code should not require JS poster swapping for active playback surfaces |
| Manual preview | `videoPreview.getFirstFrame(source)` returns cached/generated frame path |
| Stream/preview identity | `{ uri, headers }` is the canonical identity for cache stats and preview artifacts |
| Stream cache | `streamCache.prefetch(source)` is safe to call repeatedly |

## Player Events

| Event | Payload |
| --- | --- |
| `onPlaybackState` | `PlaybackState` |
| `onLoadStart` | `onLoadStartData` |
| `onLoad` | `onLoadData` |
| `onError` | `PlaybackError` |
| `onFirstFrame` | `onFirstFrameData` |
| `onBandwidthUpdate` | `BandwidthData` |
| `onVolumeChange` | `onVolumeChangeData` |

`PlaybackState` exposes `isVisualReady` as the visual readiness flag.

## Example App

The local [example](example/README.md) is a runtime lab, not just a smoke test.

It covers:
- hero playback switching between `transport.mode='auto'`, header-isolated HLS, and direct MP4
- `streamCache.prefetch/getStats/clear` and `videoPreview.getFirstFrame/clear`
- a three-player feed stress block with the same HLS URL under different headers
- live observation of `onLoad`, `onError`, `onFirstFrame`, bandwidth, attach state, and `isVisualReady`

## Documentation

| File | Purpose |
| --- | --- |
| [docs/player-api.md](docs/player-api.md) | Public player, view, events, hooks |
| [docs/source-config.md](docs/source-config.md) | Source DSL and normalized source model |
| [docs/buffer-config.md](docs/buffer-config.md) | `buffer` tuning |
| [docs/lifecycle-guide.md](docs/lifecycle-guide.md) | `retention` model and startup intent |
| [docs/memory-management.md](docs/memory-management.md) | Retention states, snapshots, feed pool |
| [docs/stream-runtime.md](docs/stream-runtime.md) | Shared transport runtime, `streamCache`, `videoPreview` |
| [docs/migration-1.0.md](docs/migration-1.0.md) | Migration to the current beta DSL |

## Requirements

| Dependency | Version |
| --- | --- |
| React Native | `>= 0.77.0` |
| react-native-nitro-modules | `>= 0.35.0` |

## License

MIT
