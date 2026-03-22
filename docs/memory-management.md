# Memory Management

NitroPlay has a built-in memory lifecycle system for managing native player resources, especially useful for feed/scroll scenarios with many videos.

## MemoryConfig

Pass via `source.memoryConfig`:

```tsx
<NitroPlayerView source={{
  uri: 'https://example.com/video.mp4',
  memoryConfig: {
    profile: 'feed',
    preloadLevel: 'metadata',
    offscreenRetention: 'metadata',
    pauseTrimDelayMs: 10000,
  },
}} />
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `profile` | `MemoryProfile` | `'balanced'` | High-level preset (overridable by fields below) |
| `preloadLevel` | `PreloadLevel` | `'buffered'` | How much to preload on creation |
| `offscreenRetention` | `OffscreenRetention` | `'hot'` | What to keep when view goes offscreen |
| `pauseTrimDelayMs` | `number` | `10000` | Delay before trimming paused offscreen player. `Infinity` disables |

### MemoryProfile

| Profile | preloadLevel | offscreenRetention | Use case |
|---------|-------------|-------------------|----------|
| `'feed'` | `'metadata'` | `'metadata'` | Scrolling feed with many videos |
| `'balanced'` | `'buffered'` | `'hot'` | Default, single video |
| `'immersive'` | `'buffered'` | `'hot'` | Full-screen player |

### PreloadLevel

| Level | Behavior |
|-------|----------|
| `'none'` | No preloading, initialize on play |
| `'metadata'` | Fetch asset metadata (duration, dimensions) |
| `'buffered'` | Full player init + buffer fill |

### OffscreenRetention

| Level | Behavior |
|-------|----------|
| `'cold'` | Release everything when offscreen |
| `'metadata'` | Keep metadata, release player/buffers |
| `'hot'` | Keep everything (instant resume) |

## Retention States

Native player moves through states: `COLD` -> `METADATA` -> `HOT`

- **COLD**: No native resources allocated
- **METADATA**: Asset info loaded (MediaItem on Android, AVPlayerItem metadata on iOS)
- **HOT**: Full player with buffers, ready to play instantly

## Feed Hot Pool

For `profile: 'feed'`, the system maintains a hot pool of max 2 players. When a new video scrolls into view:
1. It becomes a hot candidate
2. If pool is full, the least recently used feed player is trimmed to `METADATA`
3. Players attached to visible views or currently playing are never trimmed

## MemorySnapshot

Read via `player.memorySnapshot`:

```typescript
interface MemorySnapshot {
  playerBytes: number;       // ExoPlayer/AVPlayer buffer memory
  sourceBytes: number;       // MediaItem/config memory
  totalBytes: number;        // playerBytes + sourceBytes
  preloadLevel: PreloadLevel;
  retentionState: MemoryRetentionState;
  isAttachedToView: boolean;
  isPlaying: boolean;
}
```
