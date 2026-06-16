# NitroPlay Example

Consumer lab app for validating `@noma4i/nitro-play` locally against the current v2 API.

What `App.tsx` covers:

- hero playback switching between `transport.mode='auto'`, header-isolated HLS, and direct MP4
- live `onLoad`, `onError`, `onFirstFrame`, bandwidth, attach state, and `isVisualReady`
- direct exercise of `streamCache.prefetch/getStats/clear`
- direct exercise of `videoPreview.getFirstFrame/clear`
- feed stress with multiple mounted players, direct MP4 preview reuse, and the same HLS URL under isolated harmless scenario headers
- paged consumer lab with page append, active window mounting, stream prefetch, preview warmup, and source reuse

## Setup

```sh
cd example
yarn install
cd ios
pod install
```

## Run

```sh
cd example
yarn start
```

```sh
cd example
yarn ios:build
```

```sh
cd example
yarn ios:device
```

```sh
cd example
yarn android:build
```

## Important

- `example` consumes the library via `"portal:.."` so Yarn links the repo root as a live local dependency
- because of `portal:..`, run `yarn build` in the repo root after changing public TS exports or type surfaces so the example sees updated `lib/*`
- `metro.config.js` hard-pins single React resolution from `example/node_modules`
- the HLS demo path uses `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`
- per-source cache and preview identity in the demo are keyed by `{ uri, headers }`, so the Home Feed and Creator Feed scenarios must stay isolated from each other
