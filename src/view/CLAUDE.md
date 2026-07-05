# src/view

> Module doc (local AI-context). Compact: таблицы, текущее состояние.

## Назначение

React-компонент `NitroPlayerView` (Fabric host-view + Nitro view-manager): монтирование, attach/detach lifecycle, fullscreen, проброс native-props и view-событий. Submodule `types/`.

## Файлы

| Файл | Назначение | Ключевое API/экспорты |
| --- | --- | --- |
| `NitroPlayerView.tsx` | Основной компонент: связывает `useNitroPlayer`, native view-manager, props, события; imperative ref | `default NitroPlayerView` (memo); `interface NitroPlayerViewProps`, `interface NitroPlayerViewRef` |
| `NativeNitroPlayerView.tsx` | Резолв Fabric host-компонента; linking-error stub если view-manager config отсутствует | `const NativeNitroPlayerView` |
| `events.ts` | Интерфейс view-событий + реестр имён через `allKeysOf` | `interface NitroPlayerViewEvents` (`onAttached/onDetached/onFullscreenChange/willEnterFullscreen/willExitFullscreen`); `const ALL_VIEW_EVENTS` |

## Submodule types/

| Файл | Назначение | Ключевое API/экспорты |
| --- | --- | --- |
| `types/ResizeMode.ts` | Режим масштабирования видео | `type ResizeMode = 'contain'\|'cover'\|'stretch'\|'none'` |
| `types/NitroPlayerOrientation.ts` | Ориентация видео | `type NitroPlayerOrientation` (portrait/landscape/.../unknown) |

## Инварианты / заметки

- View-manager создаётся лениво по `onNitroIdChange` (native nitroId); исчезновение native-view до attach (`view/not-found`) -> warn, ждём следующий attach-event, не throw.
- `lastDeliveredAttachStateRef` дедуплицирует `onAttached`/`onDetached` (по одному вызову на смену состояния).
- Native prop writes are per-field diffed: `surfaceType/controls/resizeMode/keepScreenAwake/player` write only on changed deps; `playerDefaults` uses shallow equality before `setPlayerDefaults`/`clearPlayerDefaults`.
- View event subscriptions are stable across callback prop rerenders; listener bodies read latest callback refs and preserve `lastDeliveredAttachStateRef` dedupe.
- Дефолты props: `controls=false`, `resizeMode='none'`, `keepScreenAwake=true`, `surfaceType='surface'`.
- Cleanup на unmount: `clearAllListeners()`, обнуление ref'ов; вызовы manager обёрнуты `wrapNativeViewManagerFunction` (throw `view/not-found` если null).
