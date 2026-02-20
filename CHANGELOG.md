# Changelog

## 0.1.6

- added live per-stream HLS cache telemetry to the public `hlsCacheProxy` API on iOS and Android
- fixed the in-repo `example/` app to use a packaged tarball dependency, a single-React Metro setup, and verified HLS/MP4 smoke sources
- exposed realtime HLS cache stats in the `example/` UI for consumer-device validation

## 0.1.5

- added an in-repo `example/` React Native consumer app for local library verification
- fixed iOS consumer builds by importing `CommonCrypto` in `HlsCacheStore`
- fixed iOS player compilation by exposing `readyToDisplay` to extension files and aligning `HybridVideoPlayerSourceFactory` with the generated `useHlsProxy` config signature
- fixed Android autolinking to register `VideoPackage` as the single package entrypoint for both video and HLS modules

## 0.1.4

- fixed iOS consumer builds by constructing immutable Nitro `VideoInformation` values without mutating generated read-only properties

## 0.1.3

- fixed iOS pod compilation by importing `GCDWebServer` in the HLS proxy controller used by `JustPlayer`

## 0.1.2

- fixed Android git-consumption build by passing `useHlsProxy` through `HybridVideoPlayerSourceFactory`
- fixed Android `VideoView` PiP capability check to avoid unresolved `ActivityInfo` constant during consumer app builds

## 0.1.1

- fixed git-based installation by switching package entrypoints to source files that exist in the repository
- kept Nitro codegen and native-first player integration intact for private git consumption
- aligned the package for direct integration in private React Native apps without app-side patch layers
