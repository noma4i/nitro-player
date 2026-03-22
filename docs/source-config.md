# Source Configuration

## NitroPlayerConfig

```typescript
interface NitroPlayerConfig {
  uri: string | number;              // URL string or require() asset
  headers?: Record<string, string>;  // HTTP headers for requests
  bufferConfig?: BufferConfig;       // Platform-specific buffer settings
  memoryConfig?: MemoryConfig;       // Memory lifecycle policy
  metadata?: CustomVideoMetadata;    // Custom metadata for the video
  initializeOnCreation?: boolean;    // Init native player immediately (default: true)
  useHlsProxy?: boolean;            // Route through HLS cache proxy (default: true for .m3u8)
}
```

## Source Formats

```tsx
// String URL
<NitroPlayerView source="https://example.com/video.mp4" />

// require() asset
<NitroPlayerView source={require('./assets/intro.mp4')} />

// Config object
<NitroPlayerView source={{
  uri: 'https://example.com/video.mp4',
  headers: { Authorization: 'Bearer token' },
}} />
```

## BufferConfig

Platform-specific buffer tuning. See [buffer-config.md](./buffer-config.md) for details.

## CustomVideoMetadata

Optional metadata attached to the source:

```typescript
interface CustomVideoMetadata {
  title?: string;
  subtitle?: string;
  description?: string;
  artist?: string;
  imageUri?: string;
}
```

Used for `MediaMetadata` on Android (`MediaItem.Builder`) and potential future Now Playing integration.
