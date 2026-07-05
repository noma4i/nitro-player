# src/streaming

> Module doc (local AI-context). Compact: таблицы, текущее состояние.

## Назначение

Публичный JS-фасад stream cache: prefetch leading HLS segments, статистика кэша (общая/per-source), throughput estimate, конфигурация лимита, очистка. Тонкая обёртка над Nitro hybrid object `NitroStreamCache`.

## Файлы

| Файл | Назначение | Ключевое API/экспорты |
| --- | --- | --- |
| `streamCache.ts` | Singleton-фасад `streamCache`; guard-defaults при отсутствии Nitro object; warn-once | `const streamCache`; `prefetch(source, headers?)`, `getStats(source?, headers?)`, `getNetworkThroughputEstimate()`, `clear()`, `configure(config)`; `const DEFAULT_STREAM_CACHE_MAX_BYTES = 4 GiB` |
| `types.ts` | Типы cache-статистики, конфига и headers | `StreamCacheStats` (`totalSize/fileCount/maxSize`), `StreamSourceCacheStats` (+`streamSize/streamFileCount`), `StreamHeaders`, `StreamCacheConfig` (`maxBytes?`, `prefetchSegments?`) |

## Инварианты / заметки

- `prefetch` — только для `.m3u8` (HLS); не-HLS uri тихо пропускается (`isHlsManifestUrl` режет query).
- `getStats()` без source -> общая статистика; с source -> per-source (header-aware identity через `resolveSource`).
- При недоступном Nitro object каждый метод возвращает дефолт и warn'ит один раз (`createUnavailableWarner`); ошибки native-вызовов глотаются (warn/default).
- `configure` нормализует `maxBytes` (finite, >0, floor); native clamp'ит мелкие значения до 64 MiB.
- Nitro surface — split v2-нейминг (`NitroStreamCache` -> `streamCache`).
