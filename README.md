# NitroPlay

React Native video playback runtime on Nitro Modules: AVPlayer on iOS, ExoPlayer on Android, a shared three-slot feed ring, an HLS caching proxy, and a native playback coordinator that owns audio session, suspension, and recovery.

## Installation

```sh
yarn add @noma4i/nitro-play@github:noma4i/nitro-player#v3.0.0-beta.1 react-native-nitro-modules
```

```sh
npm install @noma4i/nitro-play@github:noma4i/nitro-player#v3.0.0-beta.1 react-native-nitro-modules
```

`react-native-nitro-modules >= 0.37.0` is required. React and React Native come from the host app.

### iOS

```sh
cd ios && pod install
```

### Android

No extra setup is required beyond React Native autolinking.

## Architecture

Components declare playback intent; the native runtime (`NitroPlaybackRuntime`) owns the rest.

| Concern | Owner |
| --- | --- |
| Which session plays | Native session coordinator. Groups and priorities come from `NITRO_PLAYBACK_CONTEXTS` |
| Audio session / audio focus | Native audio runtime. Hosts may borrow it with `acquireExternalAudioSession()` |
| Suspension | `NitroPlaybackBoundary` and `suspendNitroPlayback()` |
| Feed lists | One native three-slot ring bound to the focused host by `feedRingHostArbiter` |
| HLS | Direct playback by default, local caching proxy for `transport.mode: 'proxy'` and feed sources. iOS uses a vendored KTVHTTPCache fork, Android uses NanoHTTPD |
| Recovery | Native watchdog, foreground recovery, bounded startup recovery |

## Quick Start

```tsx
import { NITRO_PLAYBACK_CONTEXTS, NitroPlaybackSurface } from '@noma4i/nitro-play';

export function HeroVideo({ uri }: { uri: string }) {
  return (
    <NitroPlaybackSurface
      style={{ width: '100%', aspectRatio: 16 / 9 }}
      source={{ uri, policy: 'hero' }}
      playbackKey="hero-video"
      context={NITRO_PLAYBACK_CONTEXTS.hero}
      shouldPlay
      active
      visible
      muted={false}
      loop={false}
      onSnapshotChange={snapshot => console.log(snapshot.status)}
    />
  );
}
```

## Feed list

```tsx
import { NitroFeedRingSlotView, resolveFeedRingSlotId, useNitroFeedRingHost } from '@noma4i/nitro-play';

const host = useNitroFeedRingHost({
  hostKey: 'home-feed',
  context: 'ring',
  focused: isScreenFocused,
  muted,
  catalog: { revision, items }, // [{ index, itemId, source }]
  getViewport: () => ({ windowCenterIndex: activeIndex, playbackIndex: activeIndex })
});

// Per row inside the window:
host.binding && <NitroFeedRingSlotView ring={host.binding.ring} slotId={resolveFeedRingSlotId(index)} />;
```

Call `host.publishViewport()` after the viewport changes. See [docs/playback-runtime.md](docs/playback-runtime.md).

## Public API

| Export | Purpose |
| --- | --- |
| `NitroPlaybackSurface`, `NitroPlaybackSurfaceRef` | Single player bound to one view |
| `NitroPlaybackBoundary` | Suspends playback while `suspended` |
| `createNitroPlaybackSurfaceSnapshot` | Snapshot helpers for hosts |
| `useNitroFeedRingHost`, `feedRingHostArbiter`, `NitroFeedRingSlotView` | Feed ring |
| `feedRingWindowIndices`, `resolveFeedRingSlotId`, `resolveFeedRingSlotAssignments` | Ring window helpers |
| `prepareSource` | Validates a source and returns a descriptor with stable identity |
| `NITRO_PLAYBACK_CONTEXTS`, `resolvePlaybackContext` | Named playback contexts |
| `createNitroPrefetchQueue`, `prefetchNitroPlaybackSource`, `cancelNitroPlaybackPrefetch` | Prefetch |
| `configureNitroPlaybackCache`, `getNitroPlaybackCacheStats`, `clearNitroPlaybackCache` | HLS cache |
| `suspendNitroPlayback`, `resetNitroPlayback`, `acquireExternalAudioSession` | Runtime control |

## Source configuration

See [docs/source-config.md](docs/source-config.md). Policies: `auto`, `feed`, `hero`, `manual`.

## BufferConfig

| Field | Platform | Native mapping |
| --- | --- | --- |
| `preferredForwardBufferDurationMs` | iOS, visionOS, tvOS | Applied to `AVPlayerItem.preferredForwardBufferDuration` before item attach. |
| `preferredPeakBitRate` | iOS, visionOS, tvOS, Android | Applied to `AVPlayerItem.preferredPeakBitRate` before item attach. On Android, applied as `DefaultTrackSelector.setMaxVideoBitrate`. |
| `preferredMaximumResolution` | iOS, visionOS, tvOS | Applied to `AVPlayerItem.preferredMaximumResolution` before item attach. |
| `preferredPeakBitRateForExpensiveNetworks` | iOS, visionOS, tvOS | Applied to `AVPlayerItem.preferredPeakBitRateForExpensiveNetworks`. |
| `preferredMaximumResolutionForExpensiveNetworks` | iOS, visionOS, tvOS | Applied to `AVPlayerItem.preferredMaximumResolutionForExpensiveNetworks`. |
| `livePlayback.targetOffsetMs` | iOS, visionOS, tvOS, Android | iOS sets `configuredTimeOffsetFromLive`; Android forwards live playback values through the generated config. |
| `livePlayback.minPlaybackSpeed` / `maxPlaybackSpeed` / `minOffsetMs` / `maxOffsetMs` | Android | Android live playback parameters. |
| `minBufferMs` | Android | `DefaultLoadControl.setBufferDurationsMs`, default `5000`. |
| `maxBufferMs` | Android | `DefaultLoadControl.setBufferDurationsMs`, default `10000`. |
| `bufferForPlaybackMs` | Android | `DefaultLoadControl.setBufferDurationsMs`, default `1000`. |
| `bufferForPlaybackAfterRebufferMs` | Android | `DefaultLoadControl.setBufferDurationsMs`, default `2000`. |
| `backBufferDurationMs` | Android | `DefaultLoadControl.setBackBuffer`, default `0`. |

## Diagnostics

In development builds `globalThis.__NITRO_PLAY_RUNTIME_DIAGNOSTICS__` exposes `snapshot()`
(foreground state, audio session, suspensions, sessions, players) and the prefetch queue
counters under `prefetchQueue`.

## Documentation

| Guide | Topic |
| --- | --- |
| [playback-runtime.md](docs/playback-runtime.md) | Surface, contexts, runtime functions, feed ring |
| [source-config.md](docs/source-config.md) | Source fields, policies, transport |
| [buffer-config.md](docs/buffer-config.md) | Buffering fields |
| [lifecycle-guide.md](docs/lifecycle-guide.md) | App state, suspension, watchdog |
| [memory-management.md](docs/memory-management.md) | Retention and cache budget |
| [migration-3.0.md](docs/migration-3.0.md) | Upgrading from 2.x |
| [testing-behavior-matrix.md](docs/testing-behavior-matrix.md) | Test coverage |

## Requirements

| Dependency | Version |
| --- | --- |
| React Native | Host app version |
| React | Host app version |
| `react-native-nitro-modules` | `>= 0.37.0` |

## License

MIT
