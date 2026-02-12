# Changelog

## 0.1.3

- fixed iOS pod compilation by importing `GCDWebServer` in the HLS proxy controller used by `JustPlayer`

## 0.1.2

- fixed Android git-consumption build by passing `useHlsProxy` through `HybridVideoPlayerSourceFactory`
- fixed Android `VideoView` PiP capability check to avoid unresolved `ActivityInfo` constant during consumer app builds

## 0.1.1

- fixed git-based installation by switching package entrypoints to source files that exist in the repository
- kept Nitro codegen and native-first player integration intact for private git consumption
- aligned the package for direct integration in private React Native apps without app-side patch layers
