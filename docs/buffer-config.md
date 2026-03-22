# Buffer Configuration

Platform-specific buffer tuning. Pass via `source.bufferConfig`.

```tsx
<NitroPlayerView source={{
  uri: 'https://example.com/video.m3u8',
  bufferConfig: {
    minBufferMs: 5000,
    maxBufferMs: 15000,
    livePlayback: { targetOffsetMs: 5000 },
  },
}} />
```

## Live Playback

| Field | Platform | Description |
|-------|----------|-------------|
| `livePlayback.targetOffsetMs` | all | Target live offset the player tries to maintain |
| `livePlayback.minOffsetMs` | android | Minimum allowed live offset |
| `livePlayback.maxOffsetMs` | android | Maximum allowed live offset |
| `livePlayback.minPlaybackSpeed` | android | Min speed for catching up to target offset |
| `livePlayback.maxPlaybackSpeed` | android | Max speed for catching up to target offset |

## Android Buffer Settings

| Field | Default | Description |
|-------|---------|-------------|
| `minBufferMs` | 5000 | Minimum buffer duration (ms) |
| `maxBufferMs` | 10000 | Maximum buffer duration (ms) |
| `bufferForPlaybackMs` | 1000 | Buffer needed before playback starts after seek |
| `bufferForPlaybackAfterRebufferMs` | 2000 | Buffer needed to resume after rebuffer |
| `backBufferDurationMs` | 0 | How much already-played media to keep |

## iOS Buffer Settings

| Field | Description |
|-------|-------------|
| `preferredForwardBufferDurationMs` | Preferred forward buffer duration |
| `preferredPeakBitRate` | Max bitrate (bps) for loading |
| `preferredPeakBitRateForExpensiveNetworks` | Max bitrate on cellular |
| `preferredMaximumResolution` | `{ width, height }` max resolution |
| `preferredMaximumResolutionForExpensiveNetworks` | Max resolution on cellular |
