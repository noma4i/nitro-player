# Migration to the Current Beta DSL

This beta removes the preset-based source DSL. Sources must use the explicit v2 fields that match native behavior directly.

## Source DSL changes

| Removed | Replace with |
| --- | --- |
| `initialization` | `startup` |
| `lifecycle` | `retention` |
| `advanced.buffer` | `buffer` |
| `advanced.lifecycle.preloadLevel` | `retention.preload` |
| `advanced.lifecycle.offscreenRetention` | `retention.offscreen` |
| `advanced.lifecycle.trimDelayMs` | `retention.trimDelayMs` |
| `advanced.transport.useHlsProxy` | `transport.mode` |
| Public `hlsCacheProxy.getThumbnail()` | `videoPreview.getFirstFrame()` |
| Public `hlsCacheProxy.getCacheStats()` | `streamCache.getStats()` |

## Event changes

| Old | New |
| --- | --- |
| `PlaybackState.isReadyToDisplay` | `PlaybackState.isVisualReady` |
| Error only through `PlaybackState.error` | `PlaybackState.error` plus `onError` |
| No sticky first-frame event | `onFirstFrame` |

## Behavior changes

| Area | Current contract |
| --- | --- |
| Early play | `play()` before `onLoad` is always valid |
| Retention | Explicit per-source fields, no hidden lifecycle presets |
| Transport | `transport.mode='auto' \| 'direct' \| 'proxy'` |
| Preview | Automatic first-frame delivery and manual preview lookup share one runtime model |

## Migration checklist

| Verify | Expected result |
| --- | --- |
| Source objects | No `lifecycle`, `initialization`, or `advanced.*` fields remain |
| UI listeners | `isVisualReady`, `onError`, and `onFirstFrame` are wired |
| Cache calls | `streamCache` is used instead of public `hlsCacheProxy` helpers |
| Preview calls | `videoPreview.getFirstFrame(source)` is used for manual lookup |
| Feed screens | Feed-specific behavior is described through `retention`, not presets |

## Example rewrite

### Before

```ts
const source = {
  uri: 'https://example.com/live.m3u8',
  initialization: 'lazy',
  lifecycle: 'feed',
  advanced: {
    transport: { useHlsProxy: true },
    lifecycle: { preloadLevel: 'metadata' },
  },
};
```

### After

```ts
const source = {
  uri: 'https://example.com/live.m3u8',
  startup: 'lazy',
  transport: { mode: 'auto' },
  retention: {
    preload: 'metadata',
    offscreen: 'metadata',
    feedPoolEligible: true,
  },
  preview: { mode: 'listener' },
};
```
