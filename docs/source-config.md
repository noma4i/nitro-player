# Source Configuration

## `NitroSourceConfig`

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `uri` | `string \| number` | required | Network URL, local `file://` URI, absolute file path, or React Native asset |
| `policy` | `auto \| feed \| hero \| manual` | `auto` | Consumer scenario defaults |
| `headers` | `Record<string, string>` | none | Request headers. Part of the cache identity |
| `startup` | `'eager' \| 'lazy'` | policy default | When first-load preparation starts |
| `buffer` | `BufferConfig` | policy default | Buffering override |
| `retention` | `NitroSourceRetentionConfig` | policy default | Preload, offscreen, and trim override |
| `transport` | `NitroSourceTransportConfig` | policy default | `mode: 'auto' \| 'direct' \| 'proxy'` |

Public components accept `NitroSourceInput`: URL string, asset number,
`NitroSourceConfig`, or the descriptor returned by `prepareSource()`.

## Policies

| Policy | Startup | Preload | Offscreen | Trim delay | Buffer |
| --- | --- | --- | --- | --- | --- |
| `auto` | eager | buffered | metadata | 10000 ms | none |
| `feed` | lazy | metadata | metadata | 4000 ms | `preferredPeakBitRate: 6000000` |
| `hero` | eager | buffered | hot | 15000 ms | none |
| `manual` | none | none | none | none | none |

All policies except `manual` use `transport.mode: 'auto'`. Explicit per-source fields
override the policy. Object sections merge per field, except `buffer`: an explicit
`buffer: {}` clears the policy buffer defaults.

## Retention

| Field | Values | Purpose |
| --- | --- | --- |
| `preload` | `'none' \| 'metadata' \| 'buffered'` | Initial preload depth |
| `offscreen` | `'cold' \| 'metadata' \| 'hot'` | What survives offscreen |
| `trimDelayMs` | `number` | Delay before trimming an idle player |

## Transport

`direct` plays the URL as is. `proxy` routes HLS through the local caching proxy.
`auto` plays direct unless the local proxy is ready and the source needs it.

## `prepareSource()`

`prepareSource(input)` validates and expands the policy, and returns a descriptor with
`identity.playbackKey` (stable per resolved config) and `identity.requestKey`
(`uri` + `headers`). Pass a descriptor to avoid repeated expansion.
