# ios/support

> Module doc (local AI-context). Compact: таблицы, текущее состояние.

## Назначение

Nitro-free инфраструктура: lifecycle gate, thread-safe listener registry (core + Nitro adapter), source-command coordinator, ошибки, file helper, weak wrapper. Большая часть изолирована для host-side unit-тестов (SwiftPM). AVFoundation-расширения — в `extensions/`.

## Файлы

| Файл | Назначение | Ключевое API |
| --- | --- | --- |
| `LifecycleGate.swift` | Nitro-free владелец released-флага + source generation; решения по ним. Lock-free (намеренно) | `markReleased()`, `beginGeneration()`, `shouldEmit()`, `shouldDeliverCallback(capturedGeneration:)`, `isReleased`, `generation` |
| `HlsTransportRoutePolicy.swift` | Nitro-free HLS route policy: auto direct by default, feed auto-proxy, explicit direct/proxy, actual-route recovery gate | `shouldUseProxyForPlayback`, `supportsStartupRecovery`, `HlsTransportRouteMode` |
| `ListenerRegistryCore.swift` | Nitro-free ядро: add/emit/remove/clearAll; snapshot-then-re-resolve guard (listener снятый mid-emit не вызывается) | `add()` (-> UUID), `emit(event:invoke:)`, `remove(id:)`, `clearAll()`, `hasListeners()` |
| `ListenerRegistry.swift` | Thin Nitro adapter над core: `add` -> `ListenerSubscription` | `add(event:listener:)`, `emit()`, `clearAll()`, `hasListeners()` |
| `SourceCommandCoordinator.swift` | Source generation begin без main-hop; возвращает generation + autoplay decision | `begin(allowAutoPlay:wantsToPlay:)` |
| `errors/NitroPlayerError.swift` | Протокол ошибок + enum'ы (Library/Player/Source/View) + Unknown; кодирование в RuntimeError | `NitroPlayerError`, `LibraryError`, `PlayerError`, `SourceError`, `NitroPlayerViewError`, `.error()` |
| `NitroPlayerFileHelper.swift` | File size (local/remote HEAD), read-permission validation | `getFileSize(for:)`, `validateReadPermission(for:)` |
| `Weak.swift` | Generic weak-reference wrapper | `Weak<T>(value:)`, `value` |

## Инварианты / заметки / threading

- `LifecycleGate` — единый источник released/generation; `HybridNitroPlayer` форвардит сюда `isReleased`/`sourceGeneration` и два write-site (`markReleased`/`beginGeneration`). Намеренно lock-free (matches prior plain-var; detached callbacks повторно проверяют).
- `SourceCommandCoordinator` синхронно начинает source command без `DispatchQueue.main.sync`; commit остаётся guarded по `sourceGeneration`.
- `HlsTransportRoutePolicy`: `auto` direct by default; feed-pool-eligible HLS and explicit `proxy` use proxy; startup recovery requires actual proxied route.
- `ListenerRegistryCore` под `NSLock`; emit делает snapshot id -> re-resolve callback под lock перед invoke (Sentry YUPIV3-TN: removed mid-emit не вызывается).
- Ошибки кодируются как `{%@<code>::<message>@%}` -> `RuntimeError.error`.
- Большинство (gate, registry core) изолировано для headless SwiftPM unit-тестов.
