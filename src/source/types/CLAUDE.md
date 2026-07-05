# src/source/types

> Module doc (local AI-context). Compact: таблицы, текущее состояние.

## Назначение

Типы source-конфигурации: публичный `NitroSourceConfig`, frozen `NitroSourceDescriptor` с identity, native-конфиг для bridge, boundary-enum'ы (policy/startup/transport/preview) и контракт нативного source.

## Файлы

| Файл | Назначение | Ключевое API/экспорты |
| --- | --- | --- |
| `NitroPlayerConfig.ts` | Все source-типы и boundary-enum'ы; runtime-кортежи через `unionTuple()` | enum'ы: `NitroSourceStartup`+`SOURCE_STARTUPS`, `NitroSourceTransportMode`+`SOURCE_TRANSPORT_MODES`, `NitroSourcePreviewMode`+`SOURCE_PREVIEW_MODES`, `NitroSourcePolicy`+`SOURCE_POLICIES`; интерфейсы `NitroSourceMetadata/NitroSourceRetentionConfig/NitroSourceTransportConfig/NitroSourcePreviewConfig/NitroSourceConfig/NitroSourceIdentity/NitroSourceDescriptor/NativeNitroPlayerConfig`; `type NitroSourceUri`, `type NitroSourceInput` |

## Инварианты / заметки

- Все 4 boundary-enum'а: явный union-алиас + парный `unionTuple()`-кортеж (Nitrogen не принимает `typeof tuple[number]` на native bridge); кортеж — source of truth для валидации, drift фейлит билд.
- `NitroSourceRetentionConfig.offscreen` использует единый `RetentionLevel` (`'cold'\|'metadata'\|'hot'`), `preload` — `PreloadLevel` (оба из `player/types/MemoryConfig`).
- `NitroSourceDescriptor` — frozen output `prepareSource` (все поля `readonly` + `identity`).
- `NativeNitroPlayerConfig` (@internal) — payload для bridge: descriptor без `policy/identity`.
- `NitroSourceInput` = uri | config | descriptor.
