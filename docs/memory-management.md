# Memory Management

NitroPlay memory policy is driven by source policy defaults, advanced
`retention` overrides, and native resource coordinators.

## Public Contract

| Surface                 | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `source.policy`         | Consumer scenario defaults (`auto`, `feed`, `hero`, `thumbnail`, `manual`) |
| `source.retention`      | Advanced override for preload/offscreen/trim/feed pool                     |
| `player.memorySnapshot` | Current native player/source footprint                                     |
| `prepareSource()`       | Stable playback/request/preview identity                                   |

## Retention States

| State      | Meaning                                       |
| ---------- | --------------------------------------------- |
| `cold`     | No active native player resources             |
| `metadata` | Metadata retained, playback resources trimmed |
| `hot`      | Player and buffers retained                   |

## `MemorySnapshot`

| Field              | Purpose                            |
| ------------------ | ---------------------------------- |
| `playerBytes`      | Native player and buffer footprint |
| `sourceBytes`      | Source-side memory footprint       |
| `totalBytes`       | Combined native footprint          |
| `preloadLevel`     | Effective preload level            |
| `retentionState`   | Current retention state            |
| `isAttachedToView` | Bound to a native view             |
| `isPlaying`        | Currently playing                  |

## Native Coordinator

| Rule            | Behavior                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Weak registries | Dead views/players are pruned during rebalancing                               |
| Feed pool       | `feed`/eligible sources join a bounded hot set                                 |
| Protection      | Visible, playing, play-intent, and platform external-playback targets stay hot |
| Offscreen trim  | Detached idle players trim after policy delay                                  |
| Memory pressure | iOS memory warning / Android trim-memory trims unpinned players cold           |
| Shared runtimes | Stream cache, proxy runtime, and preview runtime are not owned by player trim  |

## Operational Rules

| Case                   | Expected behavior                                  |
| ---------------------- | -------------------------------------------------- |
| Same semantic source   | No native source replacement                       |
| `replaceSourceAsync()` | Old generation cannot rehydrate the new one        |
| `clearSourceAsync()`   | Player returns to reusable idle state              |
| `release()`            | Late callbacks and pending work are discarded      |
| Preview generation     | Does not affect retention state or playback status |

The native `PlayerRetentionCoordinator` owns trim decisions on both platforms.
Managers pass current player state into it, then apply trim effects on the main
thread. Released players and players without an active source are never trimmed
by resource-pressure handlers.

Preview extraction is coordinated outside player retention. Shared preview jobs
are coalesced per source key, cancelled only when the last waiter leaves, and
cleared globally on release/clear so stale frames cannot rehydrate a player.
