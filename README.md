# NitroPlay

Lightweight native-first video player and HLS cache proxy for React Native.

Current prerelease: `1.0.0-beta.5`

## Installation

Install from GitHub tag `v1.0.0-beta.5`.

Peer dependency: `react-native-nitro-modules >= 0.35.0`

## What Changed In 1.0

- `source` is now object-only. String and number shorthands are removed from the public DSL.
- `setup` is removed. Use `playerDefaults` for declarative startup state.
- `replaceSourceAsync(null)` is removed. Use `clearSourceAsync()`.
- Playback failures are surfaced through `PlaybackState.status === 'error'` and `PlaybackState.error`.
- Source tuning moved to `lifecycle` and `advanced.*`.
- Package runtime entrypoints now resolve to built `lib/*` artifacts.

## Documentation

| File | Purpose |
|------|---------|
| [docs/player-api.md](docs/player-api.md) | Public player, view, events, hooks |
| [docs/source-config.md](docs/source-config.md) | `NitroSourceConfig`, `NitroSource`, lifecycle DSL |
| [docs/buffer-config.md](docs/buffer-config.md) | `advanced.buffer` reference |
| [docs/lifecycle-guide.md](docs/lifecycle-guide.md) | Lifecycle presets: feed, balanced, immersive - выбор, инициализация, hot pool |
| [docs/memory-management.md](docs/memory-management.md) | Retention states, memory snapshots, advanced overrides |
| [docs/hls-cache-proxy.md](docs/hls-cache-proxy.md) | Built-in HLS proxy and cache policy |
| [docs/migration-1.0.md](docs/migration-1.0.md) | Breaking migration guide from `0.x` |

## Core API

| Surface | Status |
|---------|--------|
| `NitroPlayerView` | Convenience component with native controls and fullscreen bridge |
| `NitroPlayer` | Imperative player object |
| `createNitroSource(config)` | Canonical source factory |
| `usePlaybackState(player)` | Raw native playback snapshot |
| `useEvent(target, event, listener)` | Event subscription hook |

## Source DSL

| Field | Purpose |
|------|---------|
| `uri` | Network URL or React Native asset reference |
| `headers` | Request headers |
| `metadata` | Title, subtitle, description, artist, artwork URI |
| `initialization` | `'eager'` or `'lazy'` |
| `lifecycle` | `'balanced'`, `'feed'`, `'immersive'` |
| `advanced.buffer` | Low-level buffer tuning |
| `advanced.lifecycle` | Explicit preload, offscreen retention, trim delay overrides |
| `advanced.transport.useHlsProxy` | Opt out of HLS proxying |

## Lifecycle Presets

Lifecycle controls how many resources a player allocates before, during, and after playback. See [docs/lifecycle-guide.md](docs/lifecycle-guide.md) for the full guide.

| Lifecycle | Preload | Retention | Trim delay | Use case |
|-----------|---------|-----------|------------|----------|
| `feed` | metadata | metadata | 3 s | Scrollable feeds with dozens of videos |
| `balanced` | buffered | hot | 10 s | Single player (default) |
| `immersive` | buffered | hot | never | Fullscreen, long-form playback |

**Feed lifecycle**: with `feed` the playerItem is not created during eager init - only metadata. Call `player.initialize()` in `onAttached` so that `play()` starts instantly. The native hot pool keeps a maximum of 2 feed players in hot state.

## Defaults

| Area | Default |
|------|---------|
| `NitroPlayerView` lifecycle | `balanced` |
| `feed` lifecycle | metadata preload, metadata retention, 3000 ms trim |
| HLS proxy | enabled for `.m3u8` unless explicitly disabled |
| `initialization` | `eager` |

## Runtime Model

| Area | Owner |
|------|-------|
| Playback progress and buffering state | Native snapshot emission |
| HLS proxy singleton, eager startup on library registration, and prefetch deduplication | Native runtime |
| HLS manifest routing | Native source factory |
| Declarative source updates | Long-lived player with native `replaceSourceAsync()` |
| `playerDefaults` application in `NitroPlayerView` | Native view manager |

## Requirements

| Dependency | Version |
|-----------|---------|
| React Native | `>= 0.77.0` |
| react-native-nitro-modules | `>= 0.35.0` |

## License

MIT
