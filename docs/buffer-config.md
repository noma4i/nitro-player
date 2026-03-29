# Buffer Configuration

Buffer tuning now lives under `source.advanced.buffer`.

## Placement

| Path | Purpose |
|------|---------|
| `advanced.buffer` | Platform-specific buffer tuning |
| `advanced.lifecycle` | Retention and preload tuning |
| `advanced.transport.useHlsProxy` | Transport tuning |

## Shared live fields

| Field | Platform | Purpose |
|------|----------|---------|
| `livePlayback.targetOffsetMs` | iOS, Android | Target live edge offset |
| `livePlayback.minOffsetMs` | Android | Lower live offset bound |
| `livePlayback.maxOffsetMs` | Android | Upper live offset bound |
| `livePlayback.minPlaybackSpeed` | Android | Catch-up floor |
| `livePlayback.maxPlaybackSpeed` | Android | Catch-up ceiling |

## Android buffer fields

| Field | Default |
|------|---------|
| `minBufferMs` | `5000` |
| `maxBufferMs` | `10000` |
| `bufferForPlaybackMs` | `1000` |
| `bufferForPlaybackAfterRebufferMs` | `2000` |
| `backBufferDurationMs` | `0` |

## iOS buffer fields

| Field | Purpose |
|------|---------|
| `preferredForwardBufferDurationMs` | Forward buffer hint |
| `preferredPeakBitRate` | Peak bitrate hint |
| `preferredPeakBitRateForExpensiveNetworks` | Cellular bitrate hint |
| `preferredMaximumResolution` | Resolution cap |
| `preferredMaximumResolutionForExpensiveNetworks` | Cellular resolution cap |

Use `lifecycle` presets for the default path. Reach for `advanced.buffer` only when measured playback behavior requires explicit tuning.
