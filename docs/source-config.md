# Source Configuration

## `NitroSourceConfig`

| Field       | Type                         | Default        | Purpose                                                                                     |
| ----------- | ---------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `uri`       | `string \| number`           | required       | Network URL, local `file://` URI, absolute local file path, or React Native asset reference |
| `policy`    | `auto \| feed \| hero \| thumbnail \| manual` | `auto` | Consumer scenario defaults |
| `headers`   | `Record<string, string>`     | none           | Request headers                                                                             |
| `metadata`  | `NitroSourceMetadata`        | none           | Player-facing media metadata                                                                |
| `startup`   | `'eager' \| 'lazy'`          | policy default | Advanced startup override                                                                   |
| `buffer`    | `BufferConfig`               | policy default | Advanced buffering override                                                                 |
| `retention` | `NitroSourceRetentionConfig` | policy default | Advanced memory/lifecycle override                                                         |
| `transport` | `NitroSourceTransportConfig` | policy default | Advanced stream routing override                                                           |
| `preview`   | `NitroSourcePreviewConfig`   | policy default | Advanced first-frame override                                                               |

Public surfaces accept `NitroSourceInput`: URL string, RN asset number,
`NitroSourceConfig`, or a `prepareSource()` descriptor. Native hybrid source
objects are internal bridge details.

## Policies

| Policy | Startup | Retention | Preview | Use case |
| --- | --- | --- | --- | --- |
| `auto` | eager | buffered, metadata offscreen | listener | Default balanced player |
| `feed` | lazy | metadata, bounded hot pool | listener | Scrolling feeds |
| `hero` | eager | buffered, hot offscreen | always | Primary/long-form player |
| `thumbnail` | lazy | no preload, cold offscreen | manual | Preview/cache workflows |
| `manual` | none | none | none | Consumer owns advanced knobs |

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

Policy defaults are expanded in JS before native source creation. Explicit
fields override the selected policy.

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
  policy: 'feed',
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
  policy: 'feed',
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
  policy: 'thumbnail',
  transport: { mode: 'direct' },
  retention: { offscreen: 'hot' },
  preview: { mode: 'manual', autoThumbnail: false }
};
```

## Identity rules

| Input              | Meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| `{ uri }`          | Canonical identity for direct/basic sources                     |
| `{ uri, headers }` | Canonical identity for stream cache stats and preview artifacts |
| `preview profile`  | Part of preview identity, not stream-cache identity             |
| `policy/config`    | Part of playback identity used by `useNitroPlayer`              |

## Public source helpers

| API                          | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `prepareSource(input)`       | Immutable public descriptor with stable identities |
| `player.source`              | Current public descriptor, or `null` after clear   |
| `replaceSourceAsync(source)` | Accepts `NitroSourceInput`                         |

JS does not rewrite HLS URLs or resolve proxy transport. Route ownership stays native.

For local media, native normalization accepts absolute filesystem paths on both platforms and converts them to canonical `file://` URLs internally. Application code should still prefer `file://` when it creates recorded-media objects itself.
