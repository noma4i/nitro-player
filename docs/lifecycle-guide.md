# Lifecycle Guide

Lifecycle presets control how many resources a player allocates before, during, and after playback. The chosen preset determines the behavior of `preload()`, `play()`, and offscreen resource release.

## Presets

| Lifecycle   | Preload    | Retention  | Trim delay | Use case                               |
| ----------- | ---------- | ---------- | ---------- | -------------------------------------- |
| `feed`      | `metadata` | `metadata` | 3 s        | Scrollable feeds with dozens of videos |
| `balanced`  | `buffered` | `hot`      | 10 s       | Single player, standard use case       |
| `immersive` | `buffered` | `hot`      | never      | Fullscreen, long-form playback         |

## What each preset does

### `feed`

Optimized for feeds (FlatList, FlashList) where dozens of videos are simultaneously visible or nearby.

| Operation   | Behavior                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| `preload()` | Loads metadata only (duration, tracks). playerItem is **not created**                   |
| `play()`    | Handles full initialization automatically: creates playerItem, buffers, starts playback |
| Offscreen   | After 3 s trims to metadata: playerItem removed, buffers released                       |
| Hot pool    | Maximum 2 feed players stay hot; the rest trim to metadata                              |

`play()` works on first call for all lifecycle presets. With `feed`, it triggers async initialization internally before starting playback.

### `balanced`

Default for `NitroPlayerView`. Suitable for single-player screens.

| Operation   | Behavior                                                 |
| ----------- | -------------------------------------------------------- |
| `preload()` | Full buffering: creates playerItem, loads initial buffer |
| `play()`    | playerItem is already ready (eager init) - instant start |
| Offscreen   | Hot retention for 10 s, then trim                        |

### `immersive`

For fullscreen or sole-player use. Never releases resources automatically.

| Operation   | Behavior          |
| ----------- | ----------------- |
| `preload()` | Full buffering    |
| `play()`    | Instant start     |
| Offscreen   | No automatic trim |

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

For `balanced` and `immersive`, eager init creates the playerItem automatically. For `feed`, `play()` triggers full initialization on demand.

## Recommended patterns

### Feed (video feed)

```
onAttached -> play()
```

`play()` handles initialization automatically. Optional: call `initialize()` on attach to pre-warm the player for faster first play.

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

| Parameter  | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| Pool size  | 2                                                          |
| Protection | Attached, playing, or warming-up players are never evicted |
| Eviction   | Least-recent feed candidate trims to `metadata`            |
| Touch      | `play()` updates the candidate timestamp                   |

When scrolling a feed: the current and nearest neighbor players stay hot, the rest trim automatically.

## Retention states

| State      | Resources                                     | Transition                                                  |
| ---------- | --------------------------------------------- | ----------------------------------------------------------- |
| `cold`     | None                                          | Initial state                                               |
| `metadata` | AVURLAsset / MediaSource with loaded metadata | After `preload()` with feed lifecycle or after trim         |
| `hot`      | playerItem + buffers                          | After `play()`, `initialize()`, or `prepareBufferedState()` |

## Advanced overrides

`advanced.lifecycle` allows overriding any preset parameter:

| Override             | Type                       | Description              |
| -------------------- | -------------------------- | ------------------------ |
| `preloadLevel`       | `'metadata' \| 'buffered'` | Preload level            |
| `offscreenRetention` | `'metadata' \| 'hot'`      | What to retain offscreen |
| `trimDelayMs`        | `number`                   | Delay before trim (ms)   |

Overrides are applied on top of the selected preset.
