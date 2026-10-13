# Memory Management

Memory use follows the source policy (`retention`) and the native retention coordinator.

## Retention

| State | Meaning |
| --- | --- |
| `cold` | No active native player resources |
| `metadata` | Metadata kept, playback resources trimmed |
| `hot` | Player and buffers kept |

## Resource pressure

On an iOS memory warning or Android trim-memory event the runtime trims players that
are not pinned. A player is pinned when it has an active source and is playing,
attached to a view, wants to play, or is the target of external playback. Released
players and players without an active source are never trimmed.

`PlayerRetentionCoordinator` makes this decision on both platforms. Managers pass the
current player state to it and apply the result on the main thread.

## Cache

The HLS disk cache budget defaults to 4 GiB. `configureNitroPlaybackCache({ maxBytes })`
changes it before first use, with a minimum of 64 MiB. The native store evicts after
writes down to 90 percent of the budget.

## Operational rules

| Case | Expected behavior |
| --- | --- |
| Same resolved source | No native source replacement |
| New `playbackKey` | Snapshot resets, old callbacks cannot update the new session |
| Release | Late callbacks and pending work are discarded |
| Feed ring | Three native players shared by all items. Slots are reused, never grown |
