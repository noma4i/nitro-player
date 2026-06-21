# Retention Guide

NitroPlay exposes consumer policies first and keeps low-level lifecycle knobs as
advanced overrides.

## Policies

| Policy      | Startup  | Retention                            | Use case                 |
| ----------- | -------- | ------------------------------------ | ------------------------ |
| `auto`      | eager    | buffered preload, metadata offscreen | Default player           |
| `feed`      | lazy     | metadata preload, bounded hot pool   | Scrolling feeds          |
| `hero`      | eager    | buffered preload, hot offscreen      | Primary player           |
| `thumbnail` | lazy     | no preload, cold offscreen           | Preview/cache only       |
| `manual`    | explicit | explicit                             | Consumer-owned lifecycle |

Explicit `startup`, `retention`, `transport`, `buffer`, and `preview` fields
override the selected policy.

## Startup

| Field     | Values              | Purpose                            |
| --------- | ------------------- | ---------------------------------- |
| `startup` | `'eager'`, `'lazy'` | When first-load preparation starts |

`play()` before `onLoad` is canonical. `lazy` waits for playback-facing work such
as `play()`, `initialize()`, `preload()`, or source replacement.

## Retention

| Field                        | Values                               | Purpose                       |
| ---------------------------- | ------------------------------------ | ----------------------------- |
| `retention.preload`          | `'none'`, `'metadata'`, `'buffered'` | How much to preload           |
| `retention.offscreen`        | `'cold'`, `'metadata'`, `'hot'`      | What survives offscreen       |
| `retention.trimDelayMs`      | `number`                             | Delayed trim window           |
| `retention.feedPoolEligible` | `boolean`                            | Opt into native feed hot pool |

## Behavioral Model

| Operation       | Effect                                               |
| --------------- | ---------------------------------------------------- |
| `initialize()`  | Force preparation for the active source              |
| `preload()`     | Preload up to the configured depth                   |
| `play()`        | Preserves play intent and starts missing preparation |
| Offscreen trim  | Respects retention and trim delay                    |
| Feed pool       | Keeps a bounded hot set of eligible players          |
| Memory pressure | Trims unpinned players to cold                       |

Pinned players are visible, playing, intending to play, fullscreen, or external
playback targets.

`playWhenInactive` prevents automatic pause while the host is inactive on both
iOS and Android. `playInBackground` remains the background-playback opt-in.
If foreground resume fails after a library auto-pause, the auto-paused flag stays
set so the next active transition can retry instead of losing playback intent.
