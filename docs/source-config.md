# Source Configuration

## `NitroSourceConfig`

| Field       | Type                         | Default        | Purpose                                                                                     |
| ----------- | ---------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `uri`       | `string \| number`           | required       | Network URL, local `file://` URI, absolute local file path, or React Native asset reference |
| `headers`   | `Record<string, string>`     | none           | Request headers                                                                             |
| `metadata`  | `NitroSourceMetadata`        | none           | Player-facing media metadata                                                                |
| `startup`   | `'eager' \| 'lazy'`          | native default | Startup strategy                                                                            |
| `buffer`    | `BufferConfig`               | none           | Explicit buffering policy                                                                   |
| `retention` | `NitroSourceRetentionConfig` | none           | Preload, offscreen retention, trim policy                                                   |
| `transport` | `NitroSourceTransportConfig` | none           | Transport routing policy                                                                    |
| `preview`   | `NitroSourcePreviewConfig`   | none           | First-frame generation policy                                                               |

Public DSL accepts `NitroSourceConfig` or a pre-created `NitroPlayerSource`. String and number public shorthands are not supported outside the `uri` field.

## Runtime defaults

| Field                   | Effective default |
| ----------------------- | ----------------- |
| `startup`               | `'eager'`         |
| `transport.mode`        | `'auto'`          |
| `preview.mode`          | `'listener'`      |
| `preview.autoThumbnail` | `true`            |
| `preview.maxWidth`      | `480`             |
| `preview.maxHeight`     | `480`             |
| `preview.quality`       | `70`              |

Unset `buffer` and `retention` fields are left to native defaults. JS does not expand them into hidden preset values.

## `NitroSourceMetadata`

All fields are optional. Omit any field you do not need.

| Field         | Type                |
| ------------- | ------------------- |
| `title`       | `string` (optional) |
| `subtitle`    | `string` (optional) |
| `description` | `string` (optional) |
| `artist`      | `string` (optional) |
| `imageUri`    | `string` (optional) |

## `NitroSourceRetentionConfig`

| Field              | Type                                 | Purpose                             |
| ------------------ | ------------------------------------ | ----------------------------------- |
| `preload`          | `'none' \| 'metadata' \| 'buffered'` | Initial preload depth               |
| `offscreen`        | `'cold' \| 'metadata' \| 'hot'`      | Offscreen retention level           |
| `trimDelayMs`      | `number`                             | Delayed trim window                 |
| `feedPoolEligible` | `boolean`                            | Participate in native feed hot pool |

## `NitroSourceTransportConfig`

| Field  | Type                            | Purpose                                 |
| ------ | ------------------------------- | --------------------------------------- |
| `mode` | `'auto' \| 'direct' \| 'proxy'` | Route selection for streaming transport |

`auto` prefers the shared HLS proxy/runtime and may fall back to direct playback if the proxy cannot be made ready for the active source generation. `direct` skips proxy routing. `proxy` requires proxy routing.

## `NitroSourcePreviewConfig`

| Field           | Type                                 | Purpose                                                            |
| --------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `mode`          | `'listener' \| 'always' \| 'manual'` | Automatic first-frame behavior                                     |
| `autoThumbnail` | `boolean`                            | Auto-show native first-frame placeholder for attached player views |
| `maxWidth`      | `number`                             | Output width hint                                                  |
| `maxHeight`     | `number`                             | Output height hint                                                 |
| `quality`       | `number`                             | JPEG quality hint                                                  |

`listener` starts first-frame work for attached views by default and also satisfies `onFirstFrame` listeners. Set `autoThumbnail: false` to require explicit listener/manual preview usage. `always` warms preview output for the active source even without a mounted listener. `manual` disables background auto-generation; attached views still use native auto-thumbnail unless `autoThumbnail` is explicitly `false`.

## Common source profiles

### Feed HLS

```ts
const source = {
  uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  startup: 'lazy',
  transport: { mode: 'auto' },
  retention: {
    preload: 'metadata',
    offscreen: 'metadata',
    trimDelayMs: 4000,
    feedPoolEligible: true
  },
  preview: { mode: 'listener' }
};
```

### Header-isolated streaming source

```ts
const source = {
  uri: 'https://example.com/live.m3u8',
  headers: {
    Authorization: 'Bearer alpha',
    'X-Variant': 'alpha'
  },
  startup: 'lazy',
  transport: { mode: 'auto' },
  preview: {
    mode: 'always',
    autoThumbnail: true,
    maxWidth: 640,
    maxHeight: 360,
    quality: 80
  }
};
```

### Direct MP4 with manual preview

```ts
const source = {
  uri: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  startup: 'eager',
  transport: { mode: 'direct' },
  retention: { preload: 'buffered', offscreen: 'hot' },
  preview: { mode: 'manual', autoThumbnail: false }
};
```

## Identity rules

| Input              | Meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| `{ uri }`          | Canonical identity for direct/basic sources                     |
| `{ uri, headers }` | Canonical identity for stream cache stats and preview artifacts |
| `preview profile`  | Part of preview identity, not stream-cache identity             |

## `NitroPlayerSource`

| API                          | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `createNitroSource(config)`  | Canonical factory for reusable source objects      |
| `player.source`              | Native source currently bound to the player        |
| `replaceSourceAsync(source)` | Accepts `NitroSourceConfig` or `NitroPlayerSource` |

JS forwards this config as-is to native normalization. It does not rewrite HLS URLs, resolve transport, or expand retention presets.

For local media, native normalization accepts absolute filesystem paths on both platforms and converts them to canonical `file://` URLs internally. Application code should still prefer `file://` when it creates recorded-media objects itself.
