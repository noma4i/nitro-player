# Lifecycle Guide

## Source policies

See [source-config.md](source-config.md) for startup, preload, and offscreen defaults.

## App state

| Event | Behavior |
| --- | --- |
| Inactive or background | Auto-pause a playing player unless `playInBackground`, `playWhenInactive`, or external playback applies |
| Foreground | Resume only players that were auto-paused and still want to play. JS-managed players are resumed by their component |
| Become active, resume failed | The auto-paused flag stays set so the next active transition retries |

## Suspension

`NitroPlaybackBoundary` and `suspendNitroPlayback()` suspend playback for all groups except
`allowGroups`. Releasing the handle (or unmounting the boundary) lifts the suspension.
Registrations are keyed; changing `allowGroups` for a key acquires the replacement
before releasing the old one.

## Watchdog

The native watchdog recovers stalled playback. A clock that advances by more than
10 ms (or a loop wrap) is healthy. Near the end of a non-looping source is healthy.
Otherwise it retries, escalates the source once, enters a 15 s cooldown, and terminates
after the cooldown cycles are used.

## HLS runtime

HLS runtime start is retryable: implicit start counts as committed only after the native
server starts. Host destroy stops the server without marking the runtime explicitly
stopped, so the next source usage starts it again. The server binds an OS-assigned port.
