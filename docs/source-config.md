# Source Configuration

## `NitroSourceConfig`

| Field | Type | Default | Purpose |
|------|------|---------|---------|
| `uri` | `string \| number` | required | Network URL or React Native asset reference |
| `headers` | `Record<string, string>` | none | Request headers |
| `metadata` | `NitroSourceMetadata` | none | Player-facing media metadata |
| `initialization` | `'eager' \| 'lazy'` | `'eager'` | Initialization strategy |
| `lifecycle` | `MemoryProfile` | `'balanced'` | High-level retention preset |
| `advanced.buffer` | `BufferConfig` | none | Low-level buffering controls |
| `advanced.lifecycle` | `NitroSourceAdvancedLifecycleConfig` | none | Explicit lifecycle overrides |
| `advanced.transport.useHlsProxy` | `boolean` | `true` for HLS | HLS proxy opt-out |

Public DSL accepts only `NitroSourceConfig` or a pre-created `NitroPlayerSource`. Public string and number source shorthands were removed in `1.0.0`.

## `NitroSourceMetadata`

| Field | Type |
|------|------|
| `title` | `string` |
| `subtitle` | `string` |
| `description` | `string` |
| `artist` | `string` |
| `imageUri` | `string` |

## Lifecycle presets

| Lifecycle | Preload | Offscreen retention | Trim delay |
|-----------|---------|---------------------|-----------|
| `balanced` | `buffered` | `hot` | `10000` ms |
| `feed` | `metadata` | `metadata` | `3000` ms |
| `immersive` | `buffered` | `hot` | `Infinity` |

## `NitroPlayerSource`

| API | Purpose |
|-----|---------|
| `createNitroSource(config)` | Canonical factory for reusable source objects |
| `player.source` | Native source currently bound to the player |
| `replaceSourceAsync(source)` | Accepts `NitroSourceConfig` or `NitroPlayerSource` |

Use source objects when identity and reuse matter across renders or player instances.
