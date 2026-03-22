# Changelog

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
