# Playback Runtime

NitroPlay 3 exposes one declarative playback model. Components declare intent;
the native runtime owns players, audio session, suspension, cache, and recovery.

## Components

| Export | Purpose |
| --- | --- |
| `NitroPlaybackSurface` | One native player bound to one view for a `playbackKey` |
| `NitroPlaybackBoundary` | Suspends playback while `suspended` is `true` |
| `NitroFeedRingSlotView` | View bound to one slot of the shared 3-slot feed ring |
| `useNitroFeedRingHost` | Declares a feed list as the host of the ring |

## `NitroPlaybackSurface` props

| Prop | Type | Purpose |
| --- | --- | --- |
| `source` | `NitroSourceInput` | URL, asset, `NitroSourceConfig`, or `prepareSource()` result |
| `playbackKey` | `string` | Stable session identity. A new key resets the snapshot |
| `context` | `NitroPlaybackPolicy` | Group, priority, and resume mode. Use `NITRO_PLAYBACK_CONTEXTS` |
| `shouldPlay` | `boolean` | Play intent. `false` requests idle |
| `active` / `visible` | `boolean` | Whether the surface participates in playback and is on screen |
| `muted` / `loop` / `rate` | `boolean` / `boolean` / `number` | Output state |
| `onSnapshotChange` | `(snapshot) => void` | Called only for meaningful changes |
| `onProgress` / `onLoad` / `onError` / `onEnd` | callbacks | Playback events |

The ref (`NitroPlaybackSurfaceRef`) exposes `seekTo`, `replay`, `enterFullscreen`, and `exitFullscreen`.

## `NitroPlaybackSurfaceSnapshot`

`key`, `sourceKey`, `status`, `isAttached`, `isReady`, `isVisualReady`, `isPlaying`,
`isBuffering`, `currentTime`, `duration`, `error`. `onSnapshotChange` skips
`currentTime`-only progress; use `onProgress` for it.

## Contexts

| Context | Group | Priority | Resume |
| --- | --- | --- | --- |
| `ring` | `ring` | 300 | automatic |
| `ambient` | `ambient` | 325 | automatic |
| `hero` | `hero` | 400 | manual |
| `overlay` | `overlay` | 450 | automatic |
| `system` | `system` | 475 | automatic |
| `exclusive` | `exclusive` | 500 | automatic |

A higher priority wins when sessions compete. `resolvePlaybackContext(name)` returns the policy by name.

## Runtime functions

| Function | Purpose |
| --- | --- |
| `prefetchNitroPlaybackSource(source, { durationSeconds })` | Warm the HLS cache. Non-HTTP sources are ignored |
| `cancelNitroPlaybackPrefetch(source)` | Cancel a prefetch |
| `createNitroPrefetchQueue({ maxConcurrent, ttlMs })` | Priority queue with a window, de-duplication, and settle events |
| `configureNitroPlaybackCache({ maxBytes })` | Set the cache budget before first use. Minimum 64 MiB. Default 4 GiB |
| `getNitroPlaybackCacheStats()` | `{ totalBytes, fileCount, maxBytes }` |
| `clearNitroPlaybackCache()` | Remove cached data |
| `suspendNitroPlayback(reason, allowGroups?)` | Suspend all playback except `allowGroups`. Returns a handle with `release()` |
| `acquireExternalAudioSession()` | Tell the runtime another component owns the audio session |
| `resetNitroPlayback()` | Stop all players, clear suspensions, release the ring (logout) |
| `addNitroOutputDeviceLostListener`, `addNitroPrefetchSettledListener` | Native event subscriptions |

## Feed ring

`useNitroFeedRingHost({ hostKey, context: 'ring', focused, playbackAllowed, muted, catalog, getViewport })`
registers the list with `feedRingHostArbiter`. The arbiter binds the single native
ring to the most recently focused host and projects its catalog and viewport.
`getViewport` returns `windowCenterIndex` and `playbackIndex`; the playback index must
be at most 1 away from the window center. Render `NitroFeedRingSlotView` with
`slotId = resolveFeedRingSlotId(index)` for the items in the window. When the last
host unregisters, the ring parks (playback stops, ring stays alive). Only
`resetNitroPlayback()` releases it.

## Error handling

`PlaybackState.error` and `onError` report failures. iOS surfaces fatal HLS startup
HTTP errors (4xx) from the AVPlayerItem error log. The native watchdog recovers
stalled playback: 12 s cold-start window, 3 s once progress was observed, 15 s
cooldown, then escalation and termination after the cooldown cycles are used.
