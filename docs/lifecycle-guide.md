# Retention Guide

NitroPlay no longer uses lifecycle presets. Resource ownership is controlled by explicit `startup` and `retention` fields on each source.

## Startup

| Field | Values | Purpose |
| --- | --- | --- |
| `startup` | `'eager'`, `'lazy'` | When first-load preparation starts |

`play()` before `onLoad` is the canonical contract in both modes.

`lazy` delays preparation until a playback-facing action such as `play()`, `initialize()`, `preload()`, or source replacement requires native work. `eager` starts preparation as soon as the source is bound.

## Retention

| Field | Values | Purpose |
| --- | --- | --- |
| `retention.preload` | `'none'`, `'metadata'`, `'buffered'` | How much to preload |
| `retention.offscreen` | `'cold'`, `'metadata'`, `'hot'` | How much state survives offscreen |
| `retention.trimDelayMs` | `number` | Delayed trim window |
| `retention.feedPoolEligible` | `boolean` | Opt into native feed hot pool |

## Typical profiles

| Scenario | Recommended config |
| --- | --- |
| Feed cell | `startup: 'lazy'`, `retention.preload: 'metadata'`, `retention.offscreen: 'metadata'`, `retention.feedPoolEligible: true` |
| Standard player | `startup: 'eager'`, `retention.preload: 'buffered'`, `retention.offscreen: 'hot'` |
| Long-form fullscreen | `startup: 'eager'`, `retention.preload: 'buffered'`, `retention.offscreen: 'hot'`, large `trimDelayMs` |

## Behavioral model

| Operation | Effect |
| --- | --- |
| `initialize()` | Force preparation for the active source |
| `preload()` | Preload up to the configured `retention.preload` depth |
| `play()` | Preserves play intent and triggers missing startup work if needed |
| Offscreen trim | Respects `retention.offscreen` and `retention.trimDelayMs` |
| Feed pool | Only sources with `retention.feedPoolEligible=true` participate |

## Retention states

| State | Meaning |
| --- | --- |
| `cold` | No active native player resources |
| `metadata` | Metadata retained, heavy playback resources trimmed |
| `hot` | Player and buffers retained |

## Feed hot pool

| Rule | Behavior |
| --- | --- |
| Pool size | Native runtime keeps a bounded hot set |
| Eligibility | Only `retention.feedPoolEligible=true` sources participate |
| Protection | Attached, playing, or warming players are protected |
| Eviction | Least-recent eligible player trims first |

The JS layer does not resolve presets. Use explicit retention values so the config matches the actual native contract.

## Recommended combinations

| Use case | Suggested source shape |
| --- | --- |
| Autoplay feed card | `startup: 'lazy'`, `retention.preload: 'metadata'`, `retention.offscreen: 'metadata'`, `preview.mode: 'listener'` |
| Hero player above the fold | `startup: 'eager'`, `retention.preload: 'buffered'`, `retention.offscreen: 'hot'`, `preview.mode: 'always'` |
| Pull-only thumbnail workflow | `preview.mode: 'manual'`; use `videoPreview.getFirstFrame(source)` explicitly |
