# Migration to 2.0 Beta

2.0 makes the public API consumer-first. Safe source policies replace the need
to configure startup, retention, transport, and preview for normal screens.

## Component API

| Old | New |
| --- | --- |
| `NitroPlayerView` | `NitroVideo` (`NitroPlayerView` remains an alias) |
| `source: NitroSourceConfig` only | `source: string \| number \| NitroSourceConfig \| PreparedNitroSource` |
| `createNitroSource()` for reuse | `prepareSource()` |
| `player.source: NitroPlayerSource` | `player.source: NitroSourceDescriptor \| null` |

## Source Policies

| Scenario | Source |
| --- | --- |
| Default player | `{ uri, policy: 'auto' }` or just `uri` |
| Feed cell | `{ uri, policy: 'feed' }` |
| Hero player | `{ uri, policy: 'hero' }` |
| Thumbnail utility | `{ uri, policy: 'thumbnail' }` |
| Fully manual lifecycle | `{ uri, policy: 'manual', startup, retention }` |

Explicit advanced fields still override policy defaults.

## Before / After

```tsx
// Before
<NitroPlayerView
  source={{
    uri,
    startup: 'lazy',
    transport: { mode: 'auto' },
    retention: { preload: 'metadata', offscreen: 'metadata', feedPoolEligible: true },
    preview: { mode: 'listener' }
  }}
/>

// After
<NitroVideo source={{ uri, policy: 'feed' }} />
```

## Identity

`prepareSource()` returns a descriptor with stable playback, request, and preview
keys. React re-renders with a new object literal but the same semantic source no
longer trigger native source replacement.

