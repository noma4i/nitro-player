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
| `policy` | `'auto' \| 'feed' \| 'hero' \| 'thumbnail' \| 'manual'` | Consumer scenario defaults |
| `headers` | `Record<string,string>` | HTTP headers |
| `metadata` | `NitroSourceMetadata` | title, subtitle, artist, imageUri |
| `startup` | `'eager' \| 'lazy'` | Startup strategy |
| `buffer` | `BufferConfig` | Fine-grained buffer policy |
| `retention.preload` | `'none' \| 'metadata' \| 'buffered'` | Initial preload depth |
| `retention.offscreen` | `'cold' \| 'metadata' \| 'hot'` | Offscreen retention level |
| `retention.trimDelayMs` | `number` | Delayed trim |
| `retention.feedPoolEligible` | `boolean` | Feed hot pool opt-in |
| `transport.mode` | `'auto' \| 'direct' \| 'proxy'` | Stream routing policy |
| `preview.mode` | `'listener' \| 'always' \| 'manual'` | First-frame policy |
| `preview.autoThumbnail` | `boolean` | Native auto-thumbnail для attached views |
| `preview.maxWidth/maxHeight/quality` | `number` | Preview output hints |

## Runtime Contract

| Область | Инвариант |
| --- | --- |
| Early play | `play()` до `onLoad` каноничен |
| onLoad once | `onLoad` и first-frame эмитятся один раз на source generation (gate по `hasLoadedCurrentSource`); повторные READY (rebuffer/seek) не дублируют |
| Playback status | Строится из реального readiness/buffering/isPlaying |
| Playback emission | Native `onPlaybackState` dedupe использует typed thread-safe fingerprint; обе платформы строят fingerprint из сырых значений (iOS `PlaybackSnapshot` / Android `currentPlaybackSnapshot`) ДО аллокации Nitro `PlaybackState` — на 250ms tick объект состояния создаётся только при реальном emit |
| Visual readiness | Публичное поле: `isVisualReady` |
| Error surface | `PlaybackState.error` и отдельный `onError`; iOS сюрфейсит фатальные HLS-startup HTTP-ошибки (4xx) через AVPlayerItem error-log (`HlsStartupErrorPolicy`), не только status `.failed` |
| First frame | `onFirstFrame` sticky для текущего source generation |
| First-frame extraction | iOS HLS manifest сначала пробует `AVAssetImageGenerator` (iOS 16+), затем fallback через AVPlayer + `AVPlayerItemVideoOutput`; только SDK-required AVPlayer mutators hop to `MainActor`, pixel polling/CI/cache остаются off-main. Bare-`.ts` может давать AVError -11828 и остаётся на AVPlayer fallback. Progressive MP4 — через `AVAssetImageGenerator`. Android: `MediaMetadataRetriever` |
| Shared transport | Lazy-start runtime с bounded startup recovery |
| Preview | Preview side-jobs не меняют playback state; attached view по умолчанию auto-thumbnail, `manual` отключает background warmup, `autoThumbnail=false` выключает mounted-view placeholder |
| Cached preview lookup | `peekFirstFrame` читает только preview cache по тому же identity и не запускает generation path |
| Generation safety | `replaceSourceAsync`, `clearSourceAsync`, `release` гасят stale callbacks |
| Source identity | `prepareSource()` даёт stable JS `playbackKey` для replace gate; native HLS identity строит request/preview keys отдельно |
| Resource pressure | `PlayerRetentionCoordinator` решает trim/feed hot; feed hot pool держит 3-slot ring и коалесцирует normal rebalance до одного main turn; feed-pool pin не держит idle attached views, resource-pressure pin держит attached views; iOS memory warning / Android trim-memory trim unpinned active-source players to cold |
| Inactive host | `playWhenInactive` блокирует library auto-pause на iOS/Android; `playInBackground` отвечает за background playback |

## Stream Cache / Preview

| Surface | API |
| --- | --- |
| `streamCache` | `prefetch(source)`, `getStats(source?)` c header-aware identity, `configure({ maxBytes })`, `clear()` |
| `videoPreview` | `getFirstFrame(source)`, `peekFirstFrame(source)` для cache-only read, `clear()` очищает preview artifacts |

Внутренний Nitro surface разделён по public JS surface: `NitroStreamCache` для `streamCache`, `NitroVideoPreview` для `videoPreview`.

## Нативная архитектура

| Файл | Назначение |
| --- | --- |
| `ios/player/PlayerAppStatePolicy.swift` | Auto-pause/resume app-state decisions |
| `ios/preview/PreviewRequestCoordinator.swift` | Coalesced/cancellable preview side-jobs |
| `ios/preview/HybridNitroVideoPreview.swift` | Nitro `videoPreview` surface adapter |
| `ios/streaming/HlsPrefetchDeduper.swift` | HLS prefetch dedup window + hard cap |
| `ios/streaming/HybridNitroStreamCache.swift` | Nitro `streamCache` surface adapter |
| `ios/streaming/HlsProxyRuntimeLifecycleState.swift` | Queue-free HLS runtime start/stop/restart state, owned by `HlsProxyRuntime.runtimeQueue` |
| `ios/streaming/HlsProxyRuntime.swift` | Singleton HLS proxy runtime + single sync-domain for implicit/explicit lifecycle |
| `ios/streaming/HlsProxyServerController.swift` | Vendored KTVHTTPCache lifecycle, headers, KTV cache stats |
| `ios/vendor/ktvhttpcache/` | Private vendored KTVHTTPCache backend + CocoaAsyncSocket source |
| `ios/streaming/HlsManifestUrl.swift` | Shared `.m3u8` URL detection (DRY) |
| `ios/streaming/HlsIdentity.swift` | Shared URL+headers stable key (DRY): `requestKey` (stream/resource), `previewKey` |
| `ios/player/PlaybackStateEmissionGate.swift` | Typed/thread-safe playback-state emission dedupe for progress hot path |
| `ios/player/HybridNitroPlayer*.swift` | Core, lifecycle, events, preview (`HybridNitroPlayerPreview.swift` extension: first-frame/preview generation) |
| `ios/source/HybridNitroPlayerSource.swift`, `ios/bridge/HybridNitroPlayerSourceFactory.swift` | Source normalization, transport route refresh |
| `android/.../player/PlayerAppStatePolicy.kt` | Auto-pause/resume app-state decisions |
| `android/.../preview/PreviewRequestCoordinator.kt` | Coalesced/cancellable preview side-jobs |
| `android/.../preview/HybridNitroVideoPreview.kt` | Nitro `videoPreview` surface adapter |
| `android/.../streaming/HlsPrefetchDeduper.kt` | HLS prefetch dedup window + hard cap |
| `android/.../streaming/HybridNitroStreamCache.kt` | Nitro `streamCache` surface adapter |
| `android/.../streaming/HlsProxyRuntime.kt` | Singleton HLS proxy runtime + synchronized server owner/lifecycle state |
| `android/.../streaming/HlsProxyServer.kt` | NanoHTTPD server |
| `android/.../streaming/HlsManifestUrl.kt` | Shared `.m3u8` URL detection (DRY) |
| `android/.../streaming/HlsIdentity.kt` | Shared URL+headers stable key (DRY): `requestKey` (stream/resource), `previewKey` |
| `android/.../player/PlaybackStateEmissionGate.kt` | Typed/thread-safe playback-state emission dedupe for progress hot path |
| `android/.../player/HybridNitroPlayer*.kt` | Core, lifecycle, listener bridge, preview (`HybridNitroPlayerPreview.kt` extension functions: first-frame/preview generation) |
| `android/.../source/HybridNitroPlayerSource.kt`, `android/.../bridge/HybridNitroPlayerSourceFactory.kt` | Source normalization, transport route refresh |

HLS-прокси (обе платформы) биндит OS-assigned ephemeral порт (не фиксированный), фактический порт читается после старта (`webServer.port` / `getListeningPort()`) — избегает loopback-коллизий между параллельными инстансами.
Implicit HLS start считается committed только после успешного server/controller start; failed/no-context start должен оставаться retryable. iOS хранит implicit/explicit lifecycle state в `HlsProxyRuntime.runtimeQueue`, а controller держит только KTV lifecycle mechanics. Android хранит lifecycle/server owner внутри `HlsProxyRuntime` под одним lock. Host destroy останавливает runtime без explicit-stop semantics. Pending server start не может воскресить runtime после stop/host destroy; concurrent start заменяет предыдущий server.
iOS HLS proxy uses private vendored KTVHTTPCache; upstream fixes are documented in `ios/vendor/ktvhttpcache/README.md`. Do not add KTVHTTPCache as an external dependency or expose its ObjC API as NitroPlay public API.
Stream cache default max is 4 GiB on both platforms; JS may override it with `streamCache.configure({ maxBytes })`. Native stores clamp tiny values to 64 MiB, evict after writes, and report the active budget through `maxSize`. iOS stream prefetch warms only KTVHTTPCache; `HlsCacheStore` is for preview thumbnails.
Playback-state emission на обеих платформах дедуплицируется через typed fingerprint (`PlaybackStateEmissionGate`), а не через строковую signature/full-state copy: progress callbacks могут идти часто и из разных native contexts.

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
