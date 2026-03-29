# Changelog

## 1.0.0-beta.7

### Changed

- iOS + Android: extracted shared `ListenerRegistry` for thread-safe event listener management, eliminating duplication between EventEmitter and ViewManager on both platforms. iOS ViewManager now has proper NSLock thread safety
- iOS: split `HybridNitroPlayer` (865 LOC) into core (444), lifecycle extension (433), and events extension (198)
- Android: split `HybridNitroPlayer` (962 LOC) into core (582), `NitroPlayerListenerBridge` (174), and `NitroPlayerLifecycle` (247)
- Android: extracted `FullscreenDialogManager` from `NitroPlayerView` for cleaner separation
- Android: simplified `SmallVideoPlayerOptimizer` (157 -> 97 LOC), removed recursive ViewGroup traversal
- iOS: simplified `NitroPlayerObserver` buffer observers with generic `observeBoolProperty` helper
- TS: added barrel re-export `src/core/types/index.ts`, removed unused `Utils.ts`

## 1.0.0-beta.6

### Fixed

- iOS + Android: `play()` now works on first call for all lifecycle presets without requiring prior `initialize()`. Added `wantsToPlay` intent flag and centralized `resolvePlayPauseStatus()` helper to prevent native observer callbacks from overriding play intent with `.paused` status during async initialization
- iOS + Android: feed hot pool and offscreen trim now respect play intent, preventing premature resource release during async warmup

### Changed

- `feed` lifecycle no longer requires explicit `initialize()` before `play()`. The async initialization path is now race-condition-free
- Updated lifecycle-guide, migration-1.0, README to remove `initialize()` requirement

## 1.0.0-beta.5

### Fixed

- iOS + Android: evict cache before writing new segment to prevent exceeding cache limit
- TS: removed dead `UsePlaybackStateOptions` type and unused `createSource` alias
- TS: cleaned up formatting in `playerFactory` and `sourceFactory`
- Example app: added `player.initialize()` on attach to fix first-press play not starting playback with `feed` lifecycle
- Example app: added `ios:tunnel` script for iOS USB device development via iproxy

### Changed

- Example app uses `handleAttached` callback for explicit player initialization instead of relying on implicit async init in `play()`

## 1.0.0-beta.4

### Changed

- HLS proxy runtime is back to a single eager-start contract: registering the native library now starts the proxy on both platforms, while request paths only self-heal an already registered runtime
- The repo now uses Yarn 4 as the package manager contract in the root package, CI workflows, and local example installation flow, while `example` keeps the live `portal:..` dependency path
- Release and example docs now describe the eager native HLS runtime ownership and the Yarn-based install/test workflow that matches CI

### Fixed

- iOS + Android: removed the regression where disabling lazy proxy bootstrap left the native HLS proxy stopped and broke all `.m3u8` playback until a manual start path happened
- iOS + Android: added regression coverage for the runtime state machine so explicit stop, repeated register/start, and request-path behavior stay deterministic across platforms
- CI: removed the failing `npm install` path for `example`, which could not resolve Yarn `portal:` dependencies on GitHub Actions

## 1.0.0-beta.3

### Changed

- Example app now ships direct `yarn` device scripts for iOS and Android, patch-package support, and a `portal:..` dependency path for local package consumption
- Documented the native HLS proxy as a singleton runtime that auto-starts for playback-facing operations and remains owned by the native runtime on both platforms
- Clarified prerelease installation and runtime ownership in the README and HLS proxy docs for the current beta line

### Fixed

- iOS: forced HLS proxy controller startup, stop, URL generation, and cache access onto the main thread to prevent device-startup crashes triggered from the TurboModule queue
- iOS: fixed Swift return-path compile errors in `HybridNitroPlayer`
- Example iOS app: restored Hermes debug framework embedding, rewrote broken Hermes CLI paths after `pod install`, and repaired framework linkage for device builds
- Synced release documentation and package metadata with the native-first runtime that ships in this beta

## 1.0.0-beta.2

### Changed

- `usePlaybackState(player)` now returns raw native playback snapshots instead of JS-interpolated progress
- Declarative `source` updates now keep a long-lived player instance and apply changes through native `replaceSourceAsync()`
- `NitroPlayerView.playerDefaults` are now applied by the native view manager instead of a JS-side setter loop
- HLS proxy auto-start, explicit stop state, and prefetch deduplication are now owned by native runtime singletons on iOS and Android
- HLS manifest routing now happens inside the native source factories instead of the TypeScript layer

### Fixed

- Removed the remaining JS-side source identity serialization and object bookkeeping from the playback lifecycle path
- Android: exposed proxy listening port from `HlsCacheProxyServer` for native runtime URL generation
- TS docs now match the native-first runtime model for playback state, source updates, and HLS proxy ownership

## 1.0.0-beta.1

### Breaking

- Public source DSL is now object-only: `NitroSourceConfig` or `NitroPlayerSource`
- Removed `setup` from `NitroPlayerView`; use `playerDefaults`
- Removed `replaceSourceAsync(null)`; use `clearSourceAsync()`
- Removed standalone `onError` event; playback failures now surface through `PlaybackState.status` and `PlaybackState.error`
- Replaced public `memoryConfig` / top-level `bufferConfig` / top-level `useHlsProxy` with `lifecycle` and `advanced.*`
- Package runtime entrypoints now target built `lib/*` artifacts instead of `src/*`

### Added

- Added `createNitroSource(config)` as the canonical public source factory
- Added `NitroPlayer.clearSourceAsync()`
- Added `NitroPlayerView.playerDefaults`
- Added `PlaybackError` and `PlaybackState.error`
- Added `docs/migration-1.0.md`

### Changed

- `NitroPlayerView` now defaults to the `balanced` lifecycle preset
- `feed` lifecycle now means metadata preload, metadata retention, and 3000 ms trim delay
- Declarative source identity now tracks the full normalized source configuration
- Local example package consumption now uses a single repo-level symlink instead of a stale tree of per-file symlinks

### Fixed

- Android: aligned player source parsing with the new source DSL in `DataSourceFactoryUtils`, `MediaItemUtils`, and `HybridNitroPlayer`
- iOS + Android: kept clear-source semantics reusable instead of terminal release behavior
- TS: removed JS-only error event plumbing and updated tests to the new API contracts

## 0.3.2

### Fixed

- Android: fix crash when `play()` called after `release()` (missing `isReleased` guard)
- Android: fix `IllegalArgumentException` in `seekBy`/`seekTo` when duration is NaN
- iOS + Android: fix double-mute losing user volume (repeated `muted = true` no longer overwrites saved volume)
- Android: fix double initialization when `initializeOnCreation` is true and `initialize()` called manually
- Android: fix audio focus duck corrupting `userVolume` via `onVolumeChanged` sync
- Android: fix `preDuckVolumes` leak on player unregister during duck
- TS: fix unbounded growth of `prefetchTimestamps` map in `hlsCacheProxy`
- TS: fix `hlsCacheProxy.start()` leaving `didAutoStart = true` on native error
- iOS: rename `getbufferDuration` to `getBufferDuration` (Swift naming convention)

## 0.3.1

### Fixed

- iOS: fix `HybridNitroPlayerViewManager` conformance to the generated `HybridNitroPlayerViewManagerSpec_protocol` by implementing the required `isAttached` setter, unblocking consumer iOS builds on the published attach-first release

## 0.3.0

### Breaking

- `NitroPlayerView` now exposes canonical attach lifecycle via `onAttached`, `onDetached`, and `ref.isAttached`
- `setup` is now documented and supported as configuration-only; consumer apps must not treat it as a view-attach signal

### Added

- TypeScript: `NitroPlayerViewEvents` now includes `onAttached(player)` and `onDetached()`
- TypeScript: `NitroPlayerViewRef` now exposes `isAttached`
- iOS + Android: view manager APIs now expose attach/detach listeners and attach state parity for the view layer
- tests: added `NitroPlayerView` attach-contract coverage in the TS suite

### Fixed

- iOS: unified attach/detach reporting in `NitroPlayerComponentView` so the JS layer sees one canonical attach state instead of inferring from multiple signals
- Android: aligned generated `isAttached` property contract with the hybrid spec and attach/detach event emitter semantics
- docs/example: moved consumer guidance to attach-first playback and removed `setup`-driven autoplay examples

## 0.2.2

### Fixed

- iOS: align released `playbackState` and `memorySnapshot` semantics with Android by returning an idle/zero snapshot after `release()`

### Added

- iOS: expand `ReleaseGuardTests` to cover constructor init after release, released getters, trim when not loaded, and concurrent release/trim
- Android: expand `ReleaseGuardTest` to mirror the iOS release/parity guard scenarios and assert idempotent release bookkeeping

## 0.2.1

### Fixed

- iOS: fix App Hang (6.9-7.7s deadlock) caused by `DispatchQueue.main.sync` in `replaceCurrentItem` contending with AVPlayer internal `fpNotificationCallback`
- iOS: use `await MainActor.run` for atomic player item commit in `prepareBufferedState`
- iOS: set NotificationCenter observer queue to `.main` to prevent reentrancy from AVPlayer internal threads
- iOS: set `automaticallyWaitsToMinimizeStalling = false` to reduce internal interstitial event check frequency
- Android: replace `runOnMainThreadSync` with async `runOnMainThread` in `replaceSourceAsync`, `initialize`, `preload`, `movePlayerToNitroPlayerView` to prevent ANR
- Android: add `isReleased` guard in async dispatch blocks to prevent post-release work

### Added

- iOS: `MainThreadSafetyTests` - race condition tests for release/prepare/cancel
- Android: `ThreadingTest` - threading safety and isReleased guard tests
- Project `CLAUDE.md` with platform parity rules and threading guidelines

## 0.2.0

### Breaking

- Removed PiP, DRM, subtitles, timed metadata, notification controls from native code (iOS + Android)
- Removed events: `onAudioBecomingNoisy`, `onAudioFocusChange`, `onControlsVisibleChange`, `onExternalPlaybackChange`, `onTimedMetadata`, `onTextTrackDataChanged`, `onTrackChange`
- Removed `showNotificationControls`, `getAvailableTextTracks()`, `selectTextTrack()`, `selectedTrack`
- Removed PiP API from ViewManager on both platforms

### Added

- Stream-based LRU cache eviction at 80% threshold (removes oldest stream as a whole)
- Exported `BufferConfig`, `LivePlaybackParams`, `NitroPlayerInformation` types
- `getStreamCacheStats` test (happy path + error fallback)
- `docs/` folder with split documentation

### Fixed

- Android: aligned `NativeVideoConfig` -> `NativeNitroPlayerConfig` with nitrogen spec
- Android: aligned `fromVideoConfig` -> `fromNitroPlayerConfig` with nitrogen spec
- Example: `e.source.url` -> `e.source.uri`
- Deep import warning for `codegenNativeComponent`

### Changed

- HLS cache evicts entire streams instead of individual chunks
- README slimmed down, details moved to `docs/`

## 0.1.9

- added comprehensive test suite (52 tests) covering NitroPlayer, NitroPlayerView, events, hooks, playback interpolation, error parsing, and HLS cache proxy
- fixed iOS foreground resume to auto-resume auto-paused players on return from background, matching Android behavior
- removed dead iOS audio session management code (~200 lines) that was permanently disabled via `isAudioSessionManagementDisabled`; host app remains responsible for AVAudioSession category
- aligned iOS progress observer interval from 500ms to 250ms to match Android `PROGRESS_UPDATE_INTERVAL_MS`
- improved 60fps playback interpolation with NaN guard, monotonic clock fallback, and buffer duration calculation
- fixed HLS live manifest caching by adding `Cache-Control: no-cache` headers for `.m3u8` responses
- stripped unused features from TypeScript layer (PiP, DRM, subtitles, timed metadata, audio focus, AirPlay)
- added fullscreen, controls toggle, and bandwidth stats to example app
- fixed mute/volume edge cases: mute now preserves volume value, unmute restores it
- improved thread safety in native player bridge (iOS + Android)
- fixed memory leaks in DSL parity layer and added self-healing for proxy lifecycle
- Android: performance optimization and defensive lifecycle cleanup
- refactored type safety improvements and logging cleanup across native layers
- fixed `useManagedInstance` misleading variable name (`dependenciesChanged` -> `dependenciesEqual`)
- fixed `usePlaybackState` interpolation timer leak when player becomes null

## 0.1.8

- changed the default `feed` memory profile to use buffered preload, hot retention, and a longer trim delay so adjacent feed items stay warm across swipes
- added a bounded native hot-feed player pool on iOS and Android so only the active feed item plus the freshest offscreen candidate stay hot while older feed players trim back to metadata
- updated the in-repo `example/` consumer app to validate the hot-feed behavior

## 0.1.7

- moved HLS proxy startup fully inside the library with lazy native autostart and native self-heal across resume/restart cycles
- removed manual proxy bootstrap from the in-repo `example/` app so consumer apps no longer need app-level `hlsCacheProxy.start()` for normal playback
- added a canonical `npm run release:notes -- <version>` workflow for GitHub Releases

## 0.1.6

- added live per-stream HLS cache telemetry to the public `hlsCacheProxy` API on iOS and Android
- fixed the in-repo `example/` app to use a direct file dependency and verified HLS/MP4 smoke sources
- exposed realtime HLS cache stats in the `example/` UI for consumer-device validation

## 0.1.5

- added an in-repo `example/` React Native consumer app for local library verification
- fixed iOS consumer builds by importing `CommonCrypto` in `HlsCacheStore`
- fixed iOS player compilation by exposing `readyToDisplay` to extension files and aligning `HybridNitroPlayerSourceFactory` with the generated `useHlsProxy` config signature
- fixed Android autolinking to register `NitroPlayPackage` as the single package entrypoint for both player and HLS modules

## 0.1.4

- fixed iOS consumer builds by constructing immutable Nitro `NitroPlayerInformation` values without mutating generated read-only properties

## 0.1.3

- fixed iOS pod compilation by importing `GCDWebServer` in the HLS proxy controller

## 0.1.2

- fixed Android git-consumption build by passing `useHlsProxy` through `HybridNitroPlayerSourceFactory`
- fixed Android NitroPlayerView PiP capability check to avoid unresolved `ActivityInfo` constant during consumer app builds

## 0.1.1

- fixed git-based installation by switching package entrypoints to source files that exist in the repository
- kept Nitro codegen and native-first player integration intact for private git consumption
- aligned the package for direct integration in private React Native apps without app-side patch layers
