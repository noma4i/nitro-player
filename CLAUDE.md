# nitro-play

> **Правила документации:**
> - Максимум 300 строк, без истории изменений
> - Только текущее состояние
> - Таблицы: файл - назначение - API

## Overview

| Область | Описание |
| --- | --- |
| Цель | Native-first video player для React Native на Nitro Modules |
| Движки | AVPlayer на iOS, ExoPlayer на Android |
| Shared runtime | HLS transport/runtime, stream cache, preview/first-frame |

## Структура

Единая доменная лексика на 3 платформах: `player/ source/ view/ streaming/ preview/ bridge/ support/` (одна и та же папка под один и тот же концепт на TS/iOS/Android).

| Директория | Назначение |
| --- | --- |
| `src/` | TS по доменам (`player/source/view/streaming/preview/bridge/support`) |
| `ios/` | Swift по доменам (те же 7 папок); podspec глобит `ios/**` |
| `android/` | Kotlin по доменам (те же 7 папок); рукописный код в `com.nitroplay.video.<domain>` (player/source/view/streaming/preview/support/bridge); codegen/autolinking-pinned пакеты НЕ трогать (см. ниже) |
| `tests/ios/` | Swift behavior tests (`Sources/` — symlinks на доменные пути) |
| `android/src/test/` | Kotlin behavior tests |
| `src/__tests__/` | JS behavior tests |
| `docs/testing-behavior-matrix.md` | Source of truth для behavior coverage |

### Android package namespaces

Рукописный код живёт в `com.nitroplay.video.<domain>` (= имя доменной папки). Исключения — **pinned** пакеты, которые задаются генераторами и НЕ переименовываются вручную:

| Пакет | Кто задаёт | Почему нельзя трогать |
| --- | --- | --- |
| `com.margelo.nitro.video` | Nitro Modules (Nitrogen) — `com.margelo.nitro` зашит во фреймворк, `video` из `nitro.json` (`androidNamespace`/`cxxNamespace`) | Generated specs + JNI-дескрипторы autolinking (`Lcom/margelo/nitro/video/...;`) ищут `Hybrid*`/`*Factory` именно там |
| `com.nitroplay.video.bridge` | RN autolinking + Fabric codegen — `react-native.config.js` (`packageImportPath`) + `package.json` (`codegenConfig.android.javaPackageName`) | RN-генерируемый `PackageList` импортирует `NitroPlayPackage` по этому пути; при переносе обновлять оба конфига |

`margelo` = вендор фреймворка Nitro Modules; это framework namespace, не наш.

## Команды

| Команда | Описание |
| --- | --- |
| `npm run test` | Все тесты |
| `npm run audit:native-architecture` | Нативные parity/threading/static guards |
| `npm run test:behavior:audit` | Запрет source-reading/function-body parsing в тестах |
| `npm run test:ts` | Jest тесты TypeScript |
| `npm run test:android` | Android unit tests |
| `npm run test:ios` | iOS Swift tests |
| `npm run verify` | `test` + `typecheck` |
| `npm run verify:example` | Example TS/Jest/Android/iOS build |
| `npm run verify:release` | Build + library verify + example verify |
| `yarn codegen` | Nitro codegen после изменений spec/types |

### Example App

| Команда | Описание |
| --- | --- |
| `yarn start` | Metro bundler |
| `yarn ios:tunnel` | iproxy USB tunnel |
| `yarn ios:device` | Build + deploy на iOS device |
| `yarn android:device` | adb reverse + build на Android device |

## Release Workflow

Beta/release готовится как отдельный release boundary после зелёных проверок.

| Шаг | Команда / правило |
| --- | --- |
| Version | Поднять root `package.json` (`1.1.0-beta.N` или stable semver) |
| Changelog | Добавить `CHANGELOG.md` секцию `## <version>`; проверить `yarn release:notes <version>` |
| README | Обновить GitHub install tag: `@noma4i/nitro-play@github:noma4i/nitro-player#v<version>` |
| Generated | Выполнить `yarn build`; если появились tracked `lib/`/`nitrogen/generated/` изменения, коммитить их отдельно до metadata |
| Verify | Минимум: `yarn verify`, `yarn verify:example`, `yarn pack -o /tmp/nitro-play-<version>.tgz` |
| Commit | Release metadata отдельным коммитом: `chore: release <version>` |
| Tag | Annotated tag: `git tag -a v<version> -m "v<version>"`; проверить, что tag указывает на `HEAD` |
| Push | `git push -u origin <branch>` и `git push origin v<version>` |
| GitHub Release | Обязательно создать/обновить pre-release: `gh release create v<version> --title "NitroPlay <version>" --notes "$(yarn release:notes <version>)" --prerelease` |
| Final check | `gh release view v<version> --json tagName,name,isPrerelease,body,url` и `gh release list --limit 5` |

Не использовать `yarn -s` в command substitution: Yarn 4 здесь не поддерживает этот shorthand и может записать ошибку в release notes. Stable release создаётся без `--prerelease`; npm publish только по явной просьбе.

## API: Source Config

| Поле | Тип | Назначение |
| --- | --- | --- |
| `uri` | `string \| number` | URL или RN asset |
| `policy` | `'auto' \| 'feed' \| 'hero' \| 'manual'` | Consumer scenario defaults |
| `headers` | `Record<string,string>` | HTTP headers, часть cache identity |
| `startup` | `'eager' \| 'lazy'` | Startup strategy |
| `buffer` | `BufferConfig` | Fine-grained buffer policy (`buffer: {}` очищает policy defaults) |
| `retention.preload/offscreen/trimDelayMs` | `none/metadata/buffered`, `cold/metadata/hot`, `number` | Retention |
| `transport.mode` | `'auto' \| 'direct' \| 'proxy'` | Stream routing policy |

## Публичный API (3.0)

| Экспорт | Назначение |
| --- | --- |
| `NitroPlaybackSurface` (+ `Ref`, `Snapshot`) | Один native player на один view, по `playbackKey` |
| `NitroPlaybackBoundary` | Suspend воспроизведения при `suspended` |
| `useNitroFeedRingHost`, `feedRingHostArbiter`, `NitroFeedRingSlotView` | Feed ring: один native ring на focused host |
| `NITRO_PLAYBACK_CONTEXTS`, `resolvePlaybackContext` | Именованные контексты group/priority/resume |
| `createNitroPrefetchQueue`, `prefetchNitroPlaybackSource`, `cancelNitroPlaybackPrefetch` | Prefetch |
| `configureNitroPlaybackCache`, `getNitroPlaybackCacheStats`, `clearNitroPlaybackCache` | HLS cache (по умолчанию 4 GiB, минимум 64 MiB) |
| `suspendNitroPlayback`, `resetNitroPlayback`, `acquireExternalAudioSession` | Управление runtime |
| `prepareSource` | Descriptor с `identity.playbackKey` и `identity.requestKey` |

Внутренний Nitro surface: `NitroPlaybackRuntime` (cache, prefetch, suspension, audio session, foreground), `NitroPlayer`, `NitroPlayerViewManager`, `NitroFeedRingPlayer`.

## Runtime Contract

| Область | Инвариант |
| --- | --- |
| Play intent | `shouldPlay` = intent; native coordinator решает, кто играет по group/priority |
| Snapshot | `onSnapshotChange` не вызывается на `currentTime`-only прогресс; видимость только при attach |
| Generation safety | Новый `playbackKey` сбрасывает snapshot; stale callbacks гасятся |
| Feed ring | 3 native slot; `playbackIndex` в пределах 1 от `windowCenterIndex`; пустой host map паркует ring, освобождает только `resetNitroPlayback()` |
| Watchdog | Окно 12 s cold, 3 s после прогресса, 15 s cooldown; escalation один раз, затем termination |
| Resource pressure | `PlayerRetentionCoordinator` trim для unpinned; pinned = playing, attached, wantsToPlay, external playback |
| HLS proxy | OS-assigned порт; implicit start committed только после успешного start; failed start retryable |
| Inactive host | `playWhenInactive` блокирует auto-pause; `playInBackground` для background |

## Нативная архитектура

| Область | iOS | Android |
| --- | --- | --- |
| Session coordinator | `ios/runtime/PlaybackSessionCoordinator.swift`, `PlaybackSessionRuntime.swift`, `PlaybackSessionBinding.swift` | `video/runtime/PlaybackSessionCoordinator.kt`, `PlaybackSessionRuntime.kt`, `PlaybackSessionBinding.kt` |
| Audio | `NativeAudioSession*`, `PlaybackAudioSessionBinding.swift` | `AudioFocusEventEngine.kt`, `NativeSystemAudioEventEngine.kt` |
| Suspension | `PlaybackSuspensionRegistry.swift` | `PlaybackSuspensionRegistry.kt` |
| Recovery | `PlaybackWatchdogPolicy.swift`, `PlaybackForegroundRecovery.swift` | `PlaybackWatchdogPolicy.kt` |
| Source activation | `SourceActivationPolicy.swift` | `SourceActivationPolicy.kt` |
| Resource slot | `SingleOwnerResourceSlot.swift`, `MainThreadResourceExecutor.swift` | `SingleOwnerResourceSlot.kt` |
| HLS | `HlsProxyRuntime`, `HlsPrefetcher`, `HlsRequestIdentity`, `HlsTransportReadiness`, `HlsLeadingSegments` | `HlsProxyRuntime`, `HlsProxyServer`, `HlsRuntimeState`, `HlsCacheContentValidator` |
| Feed ring | `ios/feed/FeedRing*Planner.swift`, `HybridNitroFeedRingPlayer.swift` | `feed/FeedRing*Planner.kt`, `HybridNitroFeedRingPlayer.kt` |
| Runtime bridge | `ios/bridge/HybridNitroPlaybackRuntime.swift` | `bridge/HybridNitroPlaybackRuntime.kt` |

iOS HLS proxy использует private vendored KTVHTTPCache (`ios/vendor/ktvhttpcache/README.md`); не добавлять как внешнюю зависимость и не выставлять его ObjC API.
Android HLS proxy забирает сегмент целиком и отдаёт из кэша (без tee).

## Паритет платформ

При любом изменении native-кода:
1. Проверить аналогичное место на другой платформе.
2. Если фикс применим обеим платформам, применить на обеих.
3. Если добавлен тест на iOS, добавить аналогичный на Android, и наоборот.
4. Перед завершением прогнать тесты TS + iOS + Android.

## isReleased Guards

Все getters/setters/methods/listeners, обращающиеся к AVPlayer/ExoPlayer:
- getters: ранний fallback при `isReleased`
- setters/methods: ранний `return` при `isReleased`
- listeners/callbacks: guard в самом начале

## Threading

### iOS
- Не использовать `DispatchQueue.main.sync` для AVPlayer операций
- В async контексте использовать `await MainActor.run`
- В sync контексте использовать `DispatchQueue.main.async`
- Notification observers только `queue: .main`
- `ListenerRegistry` должен быть thread-safe
- Detached callbacks обязаны повторно проверять `isReleased`

### Android
- `runOnMainThreadSync` допустим в `Promise.async` (нужен для await-контракта: Promise не резолвится до завершения main-мутации) и для read-only getters. Имеет bounded timeout (5s): заблокированный main бросает ошибку, а не вешает поток
- Запрещён reverse-dependency: не блокировать main ожиданием background-результата (deadlock)
- Для fire-and-forget методов (без await-контракта) использовать `runOnMainThread` (async)
- `ListenerRegistry` должен быть thread-safe
- UI/dialog code проверяет destroyed/finishing activity

## Audio / Volume

### Android
- `AudioFocusManager` восстанавливает volume через `preDuckVolumes`
- `muted` getter возвращает cached state, не `player.volume == 0`
- `mixAudioMode` setter сначала обновляет field, потом focus update
- `seekBy`/`seekTo` защищены от NaN duration

### iOS
- `getBufferDuration()` возвращает `bufferEnd - currentTime`
- `muted` setter не перезаписывает `userVolume` при повторном mute

## Тестирование

- Source of truth: `docs/testing-behavior-matrix.md`
- Три lanes: JS `src/__tests__/behavior`, Kotlin `android/src/test/.../behavior`, Swift `tests/ios/Tests/Behavior`
- Тесты должны проверять production code или production-owned seam, не source text и не mock-копии логики
- `yarn test:behavior:audit` запрещает source-reading/function-body parsing в тестах
- `tests/ios/Sources/` использует symlinks на реальные файлы из `ios/`
- `swift test` компилирует только symlinked subset, не весь Xcode target
- Каждый bugfix по возможности закрывается реальным behavior-тестом
- После изменений spec/types обязателен `yarn codegen`
- Для consumer tarball: `yarn build && yarn pack -o "/tmp/nitro-play-$(date +%Y%m%d%H%M%S).tgz"`
