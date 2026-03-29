# Memory Management

NitroPlay uses lifecycle presets instead of the old public `memoryConfig` DSL.

## Public lifecycle contract

| Field | Location | Purpose |
|------|----------|---------|
| `lifecycle` | `NitroSourceConfig.lifecycle` | High-level preset |
| `advanced.lifecycle.preloadLevel` | `NitroSourceConfig.advanced.lifecycle` | Explicit preload override |
| `advanced.lifecycle.offscreenRetention` | `NitroSourceConfig.advanced.lifecycle` | Explicit retention override |
| `advanced.lifecycle.trimDelayMs` | `NitroSourceConfig.advanced.lifecycle` | Explicit trim delay override |

`NitroPlayerView` uses `balanced` when no lifecycle is provided.

## Presets

| Lifecycle | Preload | Offscreen retention | Trim delay | Use case |
|-----------|---------|---------------------|-----------|----------|
| `balanced` | `buffered` | `hot` | `10000` ms | Default single-player usage |
| `feed` | `metadata` | `metadata` | `3000` ms | Scrolling feeds |
| `immersive` | `buffered` | `hot` | `Infinity` | Long-lived fullscreen playback |

## Retention states

| State | Meaning |
|------|---------|
| `cold` | No active native player resources |
| `metadata` | Metadata retained, player/buffers trimmed |
| `hot` | Player and buffers retained |

## Feed hot pool

| Rule | Behavior |
|------|----------|
| Pool size | Maximum 2 hot feed players |
| Eligibility | Attached or playing players are protected |
| Eviction | Least-recent feed candidate trims back to `metadata` |

## `MemorySnapshot`

| Field | Purpose |
|------|---------|
| `playerBytes` | Native player and buffer footprint |
| `sourceBytes` | Source-side memory footprint |
| `totalBytes` | Combined native footprint |
| `preloadLevel` | Effective preload level |
| `retentionState` | Current retention state |
| `isAttachedToView` | Bound to a native view |
| `isPlaying` | Currently playing |
