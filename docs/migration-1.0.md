# Migration to 1.0

Guide for migrating from `0.x` to `1.0.0-beta`.

## Breaking changes

### Source DSL

String and number shorthands are removed. All sources must be objects.

| 0.x                                       | 1.0                                                  |
| ----------------------------------------- | ---------------------------------------------------- |
| `source="https://example.com/video.m3u8"` | `source={{ uri: 'https://example.com/video.m3u8' }}` |
| `source={require('./local.mp4')}`         | `source={{ uri: require('./local.mp4') }}`           |

### View setup

`setup` callback is removed. Use declarative `playerDefaults`.

| 0.x                                                 | 1.0                                            |
| --------------------------------------------------- | ---------------------------------------------- |
| `setup={(p) => { p.muted = true; p.loop = true; }}` | `playerDefaults={{ muted: true, loop: true }}` |

`playerDefaults` is applied by the native view manager at player creation. Available fields: `muted`, `volume`, `loop`, `rate`, `playInBackground`, `playWhenInactive`, `mixAudioMode`, `ignoreSilentSwitchMode`.

### Source clearing

| 0.x                               | 1.0                         |
| --------------------------------- | --------------------------- |
| `player.replaceSourceAsync(null)` | `player.clearSourceAsync()` |

### Memory / lifecycle config

Flat `memoryConfig` is replaced by `lifecycle` presets + `advanced.*` overrides.

| 0.x                               | 1.0                                     |
| --------------------------------- | --------------------------------------- |
| `memoryConfig.profile`            | `lifecycle`                             |
| `memoryConfig.preloadLevel`       | `advanced.lifecycle.preloadLevel`       |
| `memoryConfig.offscreenRetention` | `advanced.lifecycle.offscreenRetention` |
| `memoryConfig.pauseTrimDelayMs`   | `advanced.lifecycle.trimDelayMs`        |
| `bufferConfig` (top-level)        | `advanced.buffer`                       |
| `useHlsProxy` (top-level)         | `advanced.transport.useHlsProxy`        |

### Error handling

Standalone `onError` event is removed. Playback errors come through `onPlaybackState`.

| 0.x                                           | 1.0                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `player.addEventListener('onError', handler)` | `player.addEventListener('onPlaybackState', (state) => { if (state.status === 'error') { ... } })` |
| `useEvent(player, 'onError', handler)`        | Check `playbackState.error` via `usePlaybackState(player)`                                         |

`PlaybackState.error` contains a `PlaybackError` with `code` and `message` fields when `status === 'error'`.

### Package entrypoints

Runtime entrypoints now point to built `lib/*` artifacts instead of `src/*`.

## Behavioral changes

| Area              | New behavior                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Default lifecycle | `NitroPlayerView` uses `balanced` when no `lifecycle` is provided                                   |
| `feed` lifecycle  | Metadata-only preload; playerItem is not created during eager init                                  |
| Source updates    | Player instance is reused; `replaceSourceAsync()` updates source without recreating the player      |
| HLS proxy         | Starts eagerly on native module registration; requests only self-heal an already registered runtime |

## Lifecycle presets

The new lifecycle system replaces manual memory configuration. See [lifecycle-guide.md](lifecycle-guide.md) for details.

| Lifecycle   | Preload  | Retention | Trim delay | Use case                    |
| ----------- | -------- | --------- | ---------- | --------------------------- |
| `feed`      | metadata | metadata  | 3 s        | Feeds with dozens of videos |
| `balanced`  | buffered | hot       | 10 s       | Single player (default)     |
| `immersive` | buffered | hot       | never      | Fullscreen playback         |

**Important for `feed`**: playerItem is not created during eager init - only metadata. `play()` handles full initialization automatically on first call for all lifecycle presets.

## Migration steps

### 1. Source config

Replace all shorthand sources with objects:

| Before                    | After                        |
| ------------------------- | ---------------------------- |
| `source="url"`            | `source={{ uri: "url" }}`    |
| `source={assetRef}`       | `source={{ uri: assetRef }}` |
| `source={{ url: "..." }}` | `source={{ uri: "..." }}`    |

Add `lifecycle` if you need a non-default preset:

| Scenario      | Config                                            |
| ------------- | ------------------------------------------------- |
| Video feed    | `source={{ uri: "...", lifecycle: 'feed' }}`      |
| Single player | `source={{ uri: "..." }}` (balanced by default)   |
| Fullscreen    | `source={{ uri: "...", lifecycle: 'immersive' }}` |

### 2. View props

Replace `setup` with `playerDefaults`:

| Before                              | After                              |
| ----------------------------------- | ---------------------------------- |
| `setup={(p) => { p.muted = true }}` | `playerDefaults={{ muted: true }}` |

### 3. Lifecycle / memory

Replace `memoryConfig` with `lifecycle` + `advanced.lifecycle`:

| Before                                        | After                                                   |
| --------------------------------------------- | ------------------------------------------------------- |
| `memoryConfig={{ profile: 'feed' }}`          | `lifecycle: 'feed'`                                     |
| `memoryConfig={{ preloadLevel: 'buffered' }}` | `advanced: { lifecycle: { preloadLevel: 'buffered' } }` |
| `bufferConfig={{ minBufferMs: 5000 }}`        | `advanced: { buffer: { minBufferMs: 5000 } }`           |
| `useHlsProxy: false`                          | `advanced: { transport: { useHlsProxy: false } }`       |

### 4. Error handling

Replace `onError` subscriptions with `PlaybackState` checks:

| Before                                 | After                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `useEvent(player, 'onError', handler)` | `const state = usePlaybackState(player)` + check `state?.status === 'error'` |

### 5. Source clearing

| Before                            | After                       |
| --------------------------------- | --------------------------- |
| `player.replaceSourceAsync(null)` | `player.clearSourceAsync()` |

## Post-migration checklist

| What to verify                  | How                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Play/pause works on first press | Especially with `feed` lifecycle                                               |
| Errors are surfaced             | `usePlaybackState` returns `status: 'error'` + `error`                         |
| HLS caching works               | `hlsCacheProxy.getStreamCacheStats(url)` returns non-zero `streamSize`         |
| Offscreen trim                  | Swipe away from video, after `trimDelay` check `memorySnapshot.retentionState` |
| Loop / muted                    | `playerDefaults={{ loop: true, muted: true }}` applied at creation             |
