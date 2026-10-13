# Migrating to 3.0

3.0 replaces the player-object API with a declarative playback runtime. There is no
compatibility layer: removed exports are gone.

## Removed

| Removed | Use instead |
| --- | --- |
| `NitroPlayerView`, `NitroPlayer`, `useNitroPlayer` | `NitroPlaybackSurface` |
| `usePlaybackState`, `useEvent`, event registry types | `onSnapshotChange`, `onProgress`, `onLoad`, `onError`, `onEnd` on the surface |
| `streamCache` (`prefetch`, `getStats`, `configure`, `clear`) | `prefetchNitroPlaybackSource`, `getNitroPlaybackCacheStats`, `configureNitroPlaybackCache`, `clearNitroPlaybackCache` |
| `videoPreview` | Removed. Use the `isVisualReady` flag of the surface snapshot |
| `AdaptiveQualityConfig`, stream diagnostics APIs | Removed |
| `source.preview`, `source.metadata`, policy `thumbnail`, `retention.feedPoolEligible` | Removed |
| `NitroFeedRingPlayer` class, `replaceCatalog`, `commitViewport` | `useNitroFeedRingHost` |
| `./feedRingWindow` helpers from the root | Still exported: `feedRingWindowIndices`, `resolveFeedRingSlotId`, `resolveFeedRingSlotAssignments` |

## Changed

| Area | 2.x | 3.0 |
| --- | --- | --- |
| Native bridge | `NitroStreamCache`, `NitroVideoPreview` | One `NitroPlaybackRuntime` |
| Feed policy buffer | peak bitrate 6 Mbps and 12 s forward buffer | peak bitrate 6 Mbps only |
| `buffer: {}` | Kept policy defaults | Clears policy buffer defaults |
| `source.identity` | `playbackKey` | `playbackKey` and `requestKey` |
| Leading-segment prefetch | Segment count | Duration in seconds (`durationSeconds`) |
| Required `react-native-nitro-modules` | `>= 0.35.0` | `>= 0.37.0` |

## Example

```tsx
// 2.x
<NitroPlayerView player={player} style={style} />

// 3.0
<NitroPlaybackSurface
  style={style}
  source={source}
  playbackKey="video-1"
  context={NITRO_PLAYBACK_CONTEXTS.hero}
  shouldPlay
  active
  visible
  muted={false}
  loop={false}
/>
```
