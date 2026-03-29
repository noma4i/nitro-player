# Lifecycle Guide

Lifecycle presets control how many resources a player allocates before, during, and after playback. The chosen preset determines the behavior of `preload()`, `initialize()`, and offscreen resource release.

## Presets

| Lifecycle | Preload | Retention | Trim delay | Use case |
|-----------|---------|-----------|------------|----------|
| `feed` | `metadata` | `metadata` | 3 s | Scrollable feeds with dozens of videos |
| `balanced` | `buffered` | `hot` | 10 s | Single player, standard use case |
| `immersive` | `buffered` | `hot` | never | Fullscreen, long-form playback |

## What each preset does

### `feed`

Optimized for feeds (FlatList, FlashList) where dozens of videos are simultaneously visible or nearby.

| Operation | Behavior |
|-----------|----------|
| `preload()` | Loads metadata only (duration, tracks). playerItem is **not created** |
| `initialize()` | Full initialization: creates playerItem, starts buffering |
| `play()` without `initialize()` | Async path: creates playerItem first, then starts playback |
| Offscreen | After 3 s trims to metadata: playerItem removed, buffers released |
| Hot pool | Maximum 2 feed players stay hot; the rest trim to metadata |

**Important**: with `feed` lifecycle you must call `player.initialize()` after attach to make `play()` start instantly. Without `initialize()` the first `play()` goes through an async path and may not start due to a race condition in native observer callbacks.

### `balanced`

Default for `NitroPlayerView`. Suitable for single-player screens.

| Operation | Behavior |
|-----------|----------|
| `preload()` | Full buffering: creates playerItem, loads initial buffer |
| `initialize()` | Same as `preload()` |
| `play()` | playerItem is already ready (eager init) - instant start |
| Offscreen | Hot retention for 10 s, then trim |

### `immersive`

For fullscreen or sole-player use. Never releases resources automatically.

| Operation | Behavior |
|-----------|----------|
| `preload()` | Full buffering |
| `initialize()` | Same as `preload()` |
| `play()` | Instant start |
| Offscreen | No automatic trim |

## Initialization flow

```
source attached
      |
      v
  lifecycle?
   /    |    \
feed  balanced  immersive
  |      |        |
  v      v        v
warmMetadata()  prepareBufferedState()
  |      |        |
  v      v        v
playerItem=nil  playerItem=ready
```

For `balanced` and `immersive`, eager init creates the playerItem automatically. For `feed`, an explicit `initialize()` call is required.

## Recommended patterns

### Feed (video feed)

```
onAttached -> player.initialize() -> (buffering) -> play()
```

`initialize()` is called on attach. By the time the user presses Play, the playerItem is ready.

### Single player (balanced)

```
onAttached -> play()
```

playerItem is created during eager init. `play()` works immediately.

### Fullscreen (immersive)

```
onAttached -> play()
```

Same as balanced, but resources are not released when leaving the screen.

## Feed hot pool

The native runtime maintains a pool of hot players for `feed` lifecycle.

| Parameter | Value |
|-----------|-------|
| Pool size | 2 |
| Protection | Attached or playing players are never evicted |
| Eviction | Least-recent feed candidate trims to `metadata` |
| Touch | `play()` and `initialize()` update the candidate timestamp |

When scrolling a feed: the current and nearest neighbor players stay hot, the rest trim automatically.

## Retention states

| State | Resources | Transition |
|-------|-----------|------------|
| `cold` | None | Initial state |
| `metadata` | AVURLAsset / MediaSource with loaded metadata | After `preload()` with feed lifecycle or after trim |
| `hot` | playerItem + buffers | After `initialize()` or `prepareBufferedState()` |

## Advanced overrides

`advanced.lifecycle` allows overriding any preset parameter:

| Override | Type | Description |
|----------|------|-------------|
| `preloadLevel` | `'metadata' \| 'buffered'` | Preload level |
| `offscreenRetention` | `'metadata' \| 'hot'` | What to retain offscreen |
| `trimDelayMs` | `number` | Delay before trim (ms) |

Overrides are applied on top of the selected preset.
