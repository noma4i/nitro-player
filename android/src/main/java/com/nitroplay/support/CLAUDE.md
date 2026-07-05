# android/support

> Module doc (local AI-context). Compact: таблицы.

## Назначение
Кросс-доменные примитивы: threading, lifecycle gate, listener registry, file helper. (Ошибки — в support/errors.)

## Package
`com.nitroplay.video.support` (рукописный, без pinned-исключений).

## Файлы
| Файл | Назначение | Ключевое API |
| --- | --- | --- |
| `Threading.kt` | Main-thread dispatch + main-thread property delegate; sync с bounded timeout | `runOnMainThread` (async), `runOnMainThreadSync` (bounded 5s, throws при блокировке), `mainThreadProperty` (`MainThreadProperty`) |
| `LifecycleGate.kt` | Nitro-free владелец `isReleased` + source `generation`; unit-testable без ExoPlayer | `markReleased` (idempotent), `beginGeneration`, `shouldEmit`, `shouldDeliverCallback`, `isReleased`, `generation` |
| `ListenerRegistry.kt` | Thread-safe реестр listener'ов по событию; re-resolve под lock перед invoke | `add` (→ `ListenerSubscription`), `emit`, `clearAll`, `hasListeners`; `ListenerEntry` |
| `NitroPlayerFileHelper.kt` | Валидация read-permission, file size из file/network URI | `validateReadPermission`, `getFileSizeFromUri` |

## Инварианты / threading
- `runOnMainThreadSync` bounded 5s: заблокированный main бросает `IllegalStateException`, а не вешает поток (анти-ANR). OK для Promise-returning и read-only getters; запрещён reverse-dependency (блокировать main ожиданием background-результата).
- `runOnMainThread` (async) — для fire-and-forget.
- `LifecycleGate` — single source of truth для release/generation; `HybridNitroPlayer.isReleased`/`sourceGeneration` форвардят сюда.
- `ListenerRegistry` thread-safe (всё под `lock`); listener re-resolve'ится под lock прямо перед вызовом (skip если уже unsubscribed); исключения ловятся и логируются.
