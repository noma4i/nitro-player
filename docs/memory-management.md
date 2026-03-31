# Memory Management

NitroPlay memory policy is driven by `source.retention` and the native feed coordinator.

## Public contract

| Field | Location | Purpose |
| --- | --- | --- |
| `retention.preload` | `NitroSourceConfig.retention` | Initial preload depth |
| `retention.offscreen` | `NitroSourceConfig.retention` | Offscreen retention level |
| `retention.trimDelayMs` | `NitroSourceConfig.retention` | Delayed trim window |
| `retention.feedPoolEligible` | `NitroSourceConfig.retention` | Feed pool participation |

## Retention states

| State | Meaning |
| --- | --- |
| `cold` | No active native player resources |
| `metadata` | Metadata retained, playback resources trimmed |
| `hot` | Player and buffers retained |

## `MemorySnapshot`

| Field | Purpose |
| --- | --- |
| `playerBytes` | Native player and buffer footprint |
| `sourceBytes` | Source-side memory footprint |
| `totalBytes` | Combined native footprint |
| `preloadLevel` | Effective preload level |
| `retentionState` | Current retention state |
| `isAttachedToView` | Bound to a native view |
| `isPlaying` | Currently playing |

## Feed coordinator

| Rule | Behavior |
| --- | --- |
| Opt-in | Only `retention.feedPoolEligible=true` sources join the pool |
| Protection | Attached, playing, or warming players are protected |
| Trimming | Eviction trims player state without killing the whole shared runtime |
| Shared services | Stream cache, proxy runtime, and preview runtime are not owned by feed trimming |

## Operational rules

| Case | Expected behavior |
| --- | --- |
| `replaceSourceAsync()` | Old source generation cannot rehydrate the new one |
| `clearSourceAsync()` | Player returns to reusable idle state |
| `release()` | Late callbacks and pending work are discarded |
| Preview generation | Must not affect retention state or playback status |

Memory policy is explicit now. If a screen needs special behavior, set `retention` directly on the source instead of relying on hidden presets.

## What shared runtimes are not trimmed

| Runtime | Ownership |
| --- | --- |
| Stream transport runtime | Process-wide singleton |
| Stream cache | Process-wide singleton |
| Preview runtime | Process-wide singleton |

Feed trimming can evict player/session state, but it must not tear down these shared runtimes for neighboring players.
