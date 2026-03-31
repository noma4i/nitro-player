# Buffer Configuration

Buffer tuning lives under `source.buffer`.

## Placement

| Path | Purpose |
| --- | --- |
| `buffer` | Platform-specific buffering policy |
| `retention` | Preload and offscreen retention policy |
| `transport.mode` | Stream routing policy |
| `preview` | First-frame generation policy |

## Shared live fields

| Field | Platform | Purpose |
| --- | --- | --- |
| `livePlayback.targetOffsetMs` | iOS, Android | Target live edge offset |
| `livePlayback.minOffsetMs` | Android | Lower live offset bound |
| `livePlayback.maxOffsetMs` | Android | Upper live offset bound |
| `livePlayback.minPlaybackSpeed` | Android | Catch-up floor |
| `livePlayback.maxPlaybackSpeed` | Android | Catch-up ceiling |

## Android buffer fields

| Field | Default |
| --- | --- |
| `minBufferMs` | `5000` |
| `maxBufferMs` | `10000` |
| `bufferForPlaybackMs` | `1000` |
| `bufferForPlaybackAfterRebufferMs` | `2000` |
| `backBufferDurationMs` | `0` |

## iOS buffer fields

| Field | Purpose |
| --- | --- |
| `preferredForwardBufferDurationMs` | Forward buffer hint |
| `preferredPeakBitRate` | Peak bitrate hint |
| `preferredPeakBitRateForExpensiveNetworks` | Cellular bitrate hint |
| `preferredMaximumResolution` | Resolution cap |
| `preferredMaximumResolutionForExpensiveNetworks` | Cellular resolution cap |

Use `buffer` only for measured playback issues. General preload and offscreen behavior belongs in `retention`, not in buffer tuning.

## Guidance

| Situation | Prefer |
| --- | --- |
| Need a feed card to stay light offscreen | Tune `retention`, not `buffer` |
| Live stream drifts too far from target edge | `buffer.livePlayback.*` |
| Rebuffering after seeks or cold start | Android `bufferForPlayback*` / iOS `preferredForwardBufferDurationMs` after measurement |
| Need proxy/direct routing changes | `transport.mode`, not `buffer` |
