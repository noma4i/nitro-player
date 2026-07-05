# src/player

> Module doc (local AI-context). Compact: таблицы, текущее состояние.

## Назначение

Публичный JS-фасад плеера: класс `NitroPlayer` поверх нативного hybrid-объекта, нормализация ошибок, lifecycle, события и фабрика. Submodules: `types/` (типы), `hooks/` (React-хуки).

## Файлы

| Файл | Назначение | Ключевое API/экспорты |
| --- | --- | --- |
| `NitroPlayer.ts` | Главный JS-класс плеера; оборачивает `NitroPlayerImpl`, проксирует геттеры/сеттеры через `playbackState`, парсит native-ошибки | `class NitroPlayer extends NitroPlayerEvents`; `__destroy()`, `__getNativePlayer()` (@internal); `initialize/preload/play/pause/seekBy/seekTo/replaceSourceAsync/clearSourceAsync/release`; геттеры `source/status/playbackState/memorySnapshot/duration/currentTime/volume/muted/loop/rate/isPlaying/isBuffering/isVisualReady`; сеттеры `volume/currentTime/muted/loop/rate/mixAudioMode/ignoreSilentSwitchMode/playInBackground/playWhenInactive` |
| `NitroPlayerEvents.ts` | Базовый класс с `addEventListener`/`clearAllEvents`; switch по имени события на нативные `addOn*Listener` | `class NitroPlayerEvents`; `addEventListener<Event>(event, callback): ListenerSubscription` |
| `events.ts` | Интерфейс событий плеера + payload-типы; реестр имён через `allKeysOf` (compile-time drift-guard) | `interface NitroPlayerEvents` (`onBandwidthUpdate/onLoad/onLoadStart/onPlaybackState/onFirstFrame/onError/onVolumeChange`); `type AllNitroPlayerEvents`; `BandwidthData/onLoadData/onLoadStartData/onVolumeChangeData/onFirstFrameData`; `type SourceType = 'local'\|'network'`; `const ALL_PLAYER_EVENTS` |
| `playerFactory.ts` | Создаёт нативный `NitroPlayer` через `NitroPlayerFactory`; принимает source или уже готовый `NitroPlayerSource` | `createPlayer(source): NitroPlayer` (@internal) |

## Инварианты / заметки

- `player` getter бросает `NitroPlayerRuntimeError('player/released')` после `release()/__destroy()`.
- Большинство read-полей идут через `playbackState` (single snapshot), а не отдельные native-вызовы (`status/duration/currentTime/bufferDuration/rate/isPlaying/...`).
- `replaceSourceAsync` коротит при совпадении `identity.playbackKey` (same semantic source -> нет native replace).
- `refreshMemorySize()` no-op после release: async-пути могут резолвиться уже после teardown.
- `ignoreSilentSwitchMode` сеттер в `__DEV__` warn'ит на не-iOS.
- Удалены мёртвые event-алиасы (`LoadEvent/LoadStartEvent/FirstFrameEvent/VolumeChangeEvent`); `AllNitroPlayerEvents` = `NitroPlayerEvents`.
- Все ошибки прогоняются через `tryParseNativeNitroPlayerError` (`runSync/runAsync`).
