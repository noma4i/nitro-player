# NitroPlay Example

Minimal consumer app for validating `@noma4i/nitro-play` locally.

What `App.tsx` covers:
- HLS playback through the built-in proxy
- MP4 playback without the proxy
- Unified `playbackState`
- Real-time HLS cache telemetry: `streamSize` and `streamFileCount`

## Setup

```sh
cd example
npm install
cd ios
pod install
```

## Run

```sh
cd example
npm start
```

```sh
cd example
npm run ios:build
```

```sh
cd example
npm run ios:device
```

```sh
cd example
npm run android:build
```

## Important

- `example` consumes the library via `"file:.."` - direct link to the repo root
- `metro.config.js` hard-pins single React resolution from `example/node_modules`
- the HLS smoke path uses the root manifest URL `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`; per-stream cache stats are computed relative to that root URL
