# NitroPlay

React Native video playback package with hybrid Nitro players, a three-slot native feed ring, shared HLS transport/cache utilities, and first-frame preview helpers.

## Installation

```sh
yarn add @noma4i/nitro-play react-native-nitro-modules
```

```sh
npm install @noma4i/nitro-play react-native-nitro-modules
```

```sh
pnpm add @noma4i/nitro-play react-native-nitro-modules
```

`react-native-nitro-modules >= 0.35.0` is required. React and React Native come from the host app.

### iOS

```sh
cd ios && pod install
```

### Android

No extra setup is required beyond React Native autolinking.

## Architecture

NitroPlay uses Nitro hybrid objects for `NitroPlayer`, `NitroPlayerView`, and `NitroFeedRingPlayer`. Normal single-player views attach one native player to one view. Feed playback uses a three-slot native ring driven by `FeedRingWindowPlanner`: the planner maps the active index to previous/current/next slots, replaces only changed sources, and commits a single playable slot per viewport. HLS sources can route through a shared localhost caching proxy: iOS uses the vendored KTVHTTPCache fork, Android uses a NanoHTTPD proxy, and both share JS `streamCache` and `videoPreview` entry points for transport prefetch, cache stats, variant discovery, and first-frame preview.

## Quick Start

```tsx
import { NitroVideo } from '@noma4i/nitro-play';

export function FeedCard() {
  return (
    <NitroVideo
      source={{
        uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        policy: 'feed'
      }}
      resizeMode="cover"
      keepScreenAwake
      style={{ width: '100%', aspectRatio: 9 / 16 }}
    />
  );
}
```

## Public Surfaces

| Surface | Purpose |
| --- | --- |
| `NitroVideo` / `NitroPlayerView` | React component backed by a native player. |
| `NitroPlayer` | Imperative player API for source, playback, events, memory, and audio controls. |
| `NitroFeedRingPlayer` | Three-slot native feed controller for full-screen vertical feeds. |
| `NitroFeedRingSlotView` | Native view that attaches to one ring slot. |
| `prepareSource(input)` | Resolves assets, validates source config, applies source policy defaults, and builds stable source identities. |
| `configureSourcePolicy(policy, overrides)` | Configures policy buffer defaults for future source preparations. |
| `streamCache` | HLS transport prefetch, cache stats, cache clear, variant discovery, player diagnostics, and throughput estimate. |
| `videoPreview` | Generated and cache-only first-frame lookup. |
| `useNitroPlayer(source?)` | Hook that creates and releases an imperative player. |
| `usePlaybackState(player)` | Hook that subscribes to `onPlaybackState`. |
| `useEvent(player, event, listener)` | Managed player event subscription helper. |

## Source DSL

`NitroSourceInput` can be a URL string, a React Native asset number, a `NitroSourceConfig`, or a prepared descriptor returned by `prepareSource`.

| Field | Type | Purpose |
| --- | --- | --- |
| `uri` | `string \| number` | Network URL, local URI/path, or React Native asset. |
| `policy` | `'auto' \| 'feed' \| 'hero' \| 'thumbnail' \| 'manual'` | Scenario defaults. Defaults to `auto`. |
| `headers` | `Record<string, string>` | Request headers. Headers are part of stream cache and preview identity. |
| `metadata` | `NitroSourceMetadata` | Player-facing metadata. |
| `startup` | `'eager' \| 'lazy'` | Explicit startup override. |
| `buffer` | `BufferConfig` | Explicit buffering override. |
| `retention` | `NitroSourceRetentionConfig` | Explicit preload/offscreen/trim override. |
| `transport` | `NitroSourceTransportConfig` | Explicit transport routing override. |
| `preview` | `NitroSourcePreviewConfig` | Explicit first-frame preview behavior. |

Policy merge precedence is:

1. Explicit per-source fields such as `source.buffer`.
2. Runtime overrides from `configureSourcePolicy(policy, { buffer })`.
3. Built-in policy defaults.

`configureSourcePolicy` affects future source preparations only. It does not mutate already prepared descriptors, already attached items, or a native feed catalog that has already been sent.

```ts
import { configureSourcePolicy } from '@noma4i/nitro-play';

configureSourcePolicy('feed', {
  buffer: {
    preferredPeakBitRate: 6_000_000,
    preferredForwardBufferDurationMs: 12_000
  }
});
```

## Playback Policies

| Policy | Startup | Retention | Transport | Preview | Buffer |
| --- | --- | --- | --- | --- | --- |
| `auto` | `eager` | `preload: buffered`, `offscreen: metadata`, `trimDelayMs: 10000`, `feedPoolEligible: false` | `mode: auto` | `mode: listener`, auto thumbnail, `480x480`, quality `70` | none |
| `feed` | `lazy` | `preload: metadata`, `offscreen: metadata`, `trimDelayMs: 4000`, `feedPoolEligible: true` | `mode: auto` | `mode: listener`, auto thumbnail, `512x512`, quality `72` | `preferredPeakBitRate: 6000000`, `preferredForwardBufferDurationMs: 12000` |
| `hero` | `eager` | `preload: buffered`, `offscreen: hot`, `trimDelayMs: 15000`, `feedPoolEligible: false` | `mode: auto` | `mode: always`, auto thumbnail, `640x360`, quality `80` | none |
| `thumbnail` | `lazy` | `preload: none`, `offscreen: cold`, `trimDelayMs: 0`, `feedPoolEligible: false` | `mode: auto` | `mode: manual`, no auto thumbnail, `480x480`, quality `70` | none |
| `manual` | none | none | none | none | none |

`NitroFeedRingPlayer` always normalizes catalog entries through the `feed` policy and forces ring slots to `retention.preload: 'buffered'` so the native slot owns the attached item. This is separate from ordinary `policy: 'feed'` single-player usage, where built-in retention preload remains `metadata`.

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

## Feed Ring

`NitroFeedRingPlayer` keeps one native ring instance and three slot players. JS sends a catalog with stable source keys through `replaceCatalog`, then sends viewport state through `commitViewport`. Native code accepts monotonically newer revisions only, plans slots for `centerIndex - 1`, `centerIndex`, and `centerIndex + 1`, and plays only the center slot when `playbackAllowed` is true.

| API | Notes |
| --- | --- |
| `new NitroFeedRingPlayer(options?)` | Creates a native three-slot feed ring. |
| `replaceCatalog({ revision, items })` | Sends indexed feed items. Items can omit a source, which clears that slot when assigned. |
| `commitViewport({ revision, centerIndex, playbackAllowed, muted })` | Commits the current viewport and triggers adaptive-quality sampling when enabled. |
| `getSlotPlayer(slotId)` | Returns the imperative `NitroPlayer` for slot `0`, `1`, or `2`. |
| `snapshot()` | Returns catalog, viewport, and per-slot playback state. |
| `adaptiveSnapshot()` | Returns `{ enabled, decision, lastEstimate, config }`. |
| `addSlotStateListener(listener)` | Subscribes to slot state updates. |
| `release()` | Releases all slot players and the native ring. |

### Feed Ring Options

| Option | Default | Behavior |
| --- | --- | --- |
| `adaptiveQuality` | `false` | Enables CDN-throughput based quality decisions. When off, the feed stays on the configured `feed` policy cap. |
| `adaptiveConfig.upThresholdBps` | `14000000` | A `low` decision can switch to `high` only when `estimateBps >= upThresholdBps` and `samples >= 3`. |
| `adaptiveConfig.downThresholdBps` | `9000000` | A `high` decision switches back to `low` when `estimateBps < downThresholdBps`. |
| `adaptiveConfig.highMaxBitrate` | `10000000` | Per-source `preferredPeakBitRate` used for later attaches while the decision is `high`. |

Adaptive state lives inside each `NitroFeedRingPlayer` instance. On every `commitViewport`, the ring fire-and-forgets `streamCache.getNetworkThroughputEstimate()`, updates its decision with hysteresis, and re-sends the latest catalog when the decision changes. The decision applies to subsequent source attaches. It does not mutate the currently playing item mid-play. Android currently returns no throughput estimate from the native stream module, so the JS wrapper returns `null` and the decision remains `low`.

```tsx
import { FullScreenFeed } from '@components/Moment';
import { VIDEO_STREAM_QUALITY } from '@constants/media';

<FullScreenFeed
  data={moments}
  height={height}
  renderItem={renderMoment}
  prefetchVideoUrl={prefetchVideoUrl}
  adaptiveQuality={VIDEO_STREAM_QUALITY.feed.adaptive}
/>;
```

The app integration knob is `VIDEO_STREAM_QUALITY.feed.adaptive`, currently `false`.

## Stream Cache and Transport

| API | Returns | Behavior |
| --- | --- | --- |
| `streamCache.configure({ maxBytes, prefetchSegments })` | `Promise<boolean>` | Configures cache budget and leading segment prefetch count. `prefetchSegments` is floored and clamped to `1..6`; native default is `2`. |
| `streamCache.prefetch(source, headers?)` | `Promise<void>` | For HLS manifests, starts the proxy runtime and fetches init segment plus the configured leading media segments. Non-HLS inputs no-op. |
| `streamCache.clear()` | `Promise<boolean>` | Clears stream cache. Returns `true` when native clear is unavailable. |
| `streamCache.getStats()` | `Promise<StreamCacheStats>` | Returns total cache size, file count, and max size. Default max size is 4 GiB. |
| `streamCache.getStats(source, headers?)` | `Promise<StreamSourceCacheStats>` | Returns total cache stats plus stream-specific size and file count. |
| `streamCache.getStreamVariants(source, headers?)` | `Promise<StreamVariant[] \| null>` | Parses HLS master playlists into variant rows. Returns `[]` for non-HLS or media playlists, `null` when native support is absent or fails. |
| `streamCache.getPlayersDiagnostics()` | `Promise<StreamPlayersDiagnostics \| null>` | Returns player access-log diagnostics and the proxy request ledger. |
| `streamCache.getNetworkThroughputEstimate()` | `Promise<StreamNetworkThroughputEstimate \| null>` | iOS returns a harmonic mean over recent real-network proxy fetches. Android or missing native methods return `null`. |

`StreamVariant` contains `{ bandwidth, averageBandwidth, width, height, codecs, uri }`. Use it to inspect a master playlist before choosing a policy cap for future sources.

```ts
import { streamCache } from '@noma4i/nitro-play';

const variants = await streamCache.getStreamVariants({
  uri: 'https://example.com/master.m3u8',
  headers: { Authorization: token }
});

console.log(variants?.map(variant => [variant.height, variant.bandwidth]));
```

The HLS proxy rewrites master and media playlists to loopback URLs, preserves header-aware identity, and caches segment bytes. iOS proxies through KTVHTTPCache and records a bounded 200-entry request ledger. Android proxies through NanoHTTPD and uses the package cache store. Leading-segment prefetch resolves the first variant from a master playlist, fetches an init segment when present, then fetches `N` media segments.

`getNetworkThroughputEstimate()` filters the iOS ledger to real CDN-backed requests with `usedNetwork === true`, completed timing, and `bytes >= 100000`, takes the most recent 10 samples, and returns the harmonic mean in bits per second plus `samples` and `newestAgeMs`. Partial cache fills can slightly overstate throughput, so adaptive callers use hysteresis.

## Preview API

| API | Returns | Behavior |
| --- | --- | --- |
| `videoPreview.getFirstFrame(source, headers?)` | `Promise<string \| null>` | Returns a generated or cached first-frame image URI/path. |
| `videoPreview.peekFirstFrame(source, headers?)` | `Promise<string \| null>` | Cache-only first-frame lookup. |
| `videoPreview.clear()` | `Promise<boolean>` | Clears preview artifacts. |

## Playback Behavior Contracts

| Area | Contract |
| --- | --- |
| Feed play commits | Feed playback is settle-only: JS commits the settled active viewport, and native code plays only the committed center slot. |
| Source attachment | Feed sources are committed through the ring catalog and viewport. Slot reuse keeps the native player when the source key remains stable. |
| Looping | Feed slots set `loop = true`. iOS uses zero-tolerance seek without rebuilding the item; Android uses `REPEAT_MODE_ONE`. |
| Playback watchdog | Native players arm a 3s watchdog while they want to play. Each window checks relative time advancement, treats loop wraps and near-end states as healthy, and rebuilds the loaded source on bounded consecutive freezes. |
| Preload `none` | Keeps the source cold until explicit startup or attach. |
| Preload `metadata` | Prepares lightweight metadata/preview state without a full buffered item. |
| Preload `buffered` | Attaches the item to the player. It does not mean a minimum buffer threshold has been reached. |
| First frame | `isVisualReady` and `onFirstFrame` are sticky for the active source generation. |
| Local files | Absolute local file paths are accepted and normalized internally to `file://` URLs. Prefer canonical `file://` URIs when app code owns the path. |

## `NitroVideo` and `NitroPlayerView`

`NitroVideo` is the exported component name; `NitroPlayerView` is the same component exported as the default alias.

| Prop | Type | Notes |
| --- | --- | --- |
| `source` | `NitroSourceInput` | Use this for declarative ownership. Mutually exclusive with `player`. |
| `player` | `NitroPlayer` | Use this to attach an existing imperative player. Mutually exclusive with `source`. |
| `playerDefaults` | `NitroPlayerDefaults` | Declarative defaults applied to the attached player. |
| `controls` | `boolean` | Native controls. Defaults to `false`. |
| `resizeMode` | `'contain' \| 'cover' \| 'stretch' \| 'none'` | Defaults to `none`. |
| `keepScreenAwake` | `boolean` | Defaults to `true`. |
| `surfaceType` | `'surface' \| 'texture'` | Android-only rendering surface. Defaults to `surface`. |
| `onAttached` | `(player: NitroPlayer) => void` | Called when the native view is attached to the player. |
| `onDetached` | `() => void` | Called when detached. |
| `onFullscreenChange` | `(value: boolean) => void` | Fullscreen state update. |
| `willEnterFullscreen` | `() => void` | Pre-enter callback. |
| `willExitFullscreen` | `() => void` | Pre-exit callback. |
| `style` | `ViewStyle` | Standard React Native view style. |

### `NitroPlayerViewRef`

| Member | Type |
| --- | --- |
| `player` | `NitroPlayer` |
| `isAttached` | `boolean` |
| `enterFullscreen()` | `void` |
| `exitFullscreen()` | `void` |
| `addEventListener(event, callback)` | `ListenerSubscription` |

## `NitroPlayer`

### Properties

| Property | Get | Set |
| --- | --- | --- |
| `source` | yes | no |
| `status` | yes | no |
| `playbackState` | yes | no |
| `memorySnapshot` | yes | no |
| `duration` | yes | no |
| `currentTime` | yes | yes |
| `volume` | yes | yes |
| `muted` | yes | yes |
| `loop` | yes | yes |
| `rate` | yes | yes |
| `isPlaying` | yes | no |
| `isBuffering` | yes | no |
| `isVisualReady` | yes | no |
| `bufferDuration` | yes | no |
| `bufferedPosition` | yes | no |
| `mixAudioMode` | yes | yes |
| `ignoreSilentSwitchMode` | yes | yes |
| `playInBackground` | yes | yes |
| `playWhenInactive` | yes | yes |

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `play()` | `void` | Valid before `onLoad`; native startup tracks play intent. |
| `pause()` | `void` | Pauses playback. |
| `seekTo(seconds)` | `void` | Absolute seek. |
| `seekBy(seconds)` | `void` | Relative seek. |
| `initialize()` | `Promise<void>` | Manual initialization. |
| `preload()` | `Promise<void>` | Warms the source without starting playback. |
| `replaceSourceAsync(source)` | `Promise<void>` | Swaps the active source. |
| `clearSourceAsync()` | `Promise<void>` | Clears the source and keeps the player reusable. |
| `release()` | `void` | Terminal teardown. |
| `addEventListener(event, listener)` | `ListenerSubscription` | Subscribes to a player event. |

### Events

| Event | Payload |
| --- | --- |
| `onPlaybackState` | `PlaybackState` |
| `onLoadStart` | `onLoadStartData` |
| `onLoad` | `onLoadData` |
| `onError` | `PlaybackError` |
| `onFirstFrame` | `onFirstFrameData` |
| `onBandwidthUpdate` | `BandwidthData` |
| `onVolumeChange` | `onVolumeChangeData` |

```ts
const subscription = player.addEventListener('onPlaybackState', state => {
  console.log(state.status, state.currentTime);
});

subscription.remove();
```

## Diagnostics

Diagnostics globals are installed only in DEV builds.

| Global | Example | Purpose |
| --- | --- | --- |
| `__YUPI_FEED_VIDEO_DIAGNOSTICS__` | `globalThis.__YUPI_FEED_VIDEO_DIAGNOSTICS__?.snapshot()` | Feed slot assignment, active item, and playback snapshot. |
| `__YUPI_FEED_VIDEO_DIAGNOSTICS__` | `globalThis.__YUPI_FEED_VIDEO_DIAGNOSTICS__?.commitHistory?.()` | Recent viewport commits by feed owner. |
| `__YUPI_FEED_VIDEO_DIAGNOSTICS__` | `globalThis.__YUPI_FEED_VIDEO_DIAGNOSTICS__?.stallTimeline?.()` | Slot transition timeline used for stall analysis. |
| `__YUPI_FEED_VIDEO_DIAGNOSTICS__` | `globalThis.__YUPI_FEED_VIDEO_DIAGNOSTICS__?.stallSummary?.()` | Playing-and-buffering interval summary. |
| `__YUPI_TRANSPORT_DIAGNOSTICS__` | `await globalThis.__YUPI_TRANSPORT_DIAGNOSTICS__?.players?.()` | Player access logs and proxy request ledger. The iOS proxy ledger is bounded to 200 entries. |
| `__YUPI_TRANSPORT_DIAGNOSTICS__` | `await globalThis.__YUPI_TRANSPORT_DIAGNOSTICS__?.variants?.(url)` | HLS variant discovery through `streamCache.getStreamVariants`. |
| `__YUPI_TRANSPORT_DIAGNOSTICS__` | `globalThis.__YUPI_TRANSPORT_DIAGNOSTICS__?.adaptive?.()` | Current feed adaptive state: `{ enabled, decision, lastEstimate }`. |
| `__YUPI_PREWARM_DIAGNOSTICS__` | `globalThis.__YUPI_PREWARM_DIAGNOSTICS__?.snapshot()` | App-level video prewarm queue state and history entries with `kind`, `startedAt`, and `finishedAt`. |

## Requirements

| Dependency | Version |
| --- | --- |
| React Native | Host app version |
| React | Host app version |
| `react-native-nitro-modules` | `>= 0.35.0` |

## License

MIT
