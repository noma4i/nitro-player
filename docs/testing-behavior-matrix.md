# Testing Behavior Matrix

Tests are split into three lanes and must cover behavior through production code
or production-owned seams:

| Behavior                                                                 | JS                                                                                           | Kotlin                                                                                                                                                                                                                                                                                                                                                             | Swift                                                                                                                                                                                                                                                                            | Example                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Source DSL, policy expansion, identity                                   | `behavior/api`                                                                               | source normalization                                                                                                                                                                                                                                                                                                                                               | source normalization                                                                                                                                                                                                                                                             | scenario source model                                           |
| Public player API and hook lifecycle                                     | `behavior/runtime`, `behavior/view`: attach callbacks and transient native view lookup races | release/source guards                                                                                                                                                                                                                                                                                                                                              | release/source guards                                                                                                                                                                                                                                                            | `PlayerWorkbench` consumes model sources; Feed List churn smoke |
| Playback state, buffering, event dedupe                                  | playback state hooks                                                                         | `behavior/playback`, `PlaybackStateEmissionGate`: typed main-thread fingerprint dedupe, no-listener early-out, subscriber reset, active-source progress loop                                                                                                                                                                                                       | `Behavior/Playback`, `PlaybackStateEmissionGate`: typed main-thread fingerprint dedupe, no-listener early-out, item-scoped periodic observer                                                                                                                                     | app render smoke                                                |
| Threading and mutation ordering                                          | API await behavior                                                                           | `behavior/runtime`: cached getter background reads, bounded main-hop live reads                                                                                                                                                                                                                                                                                    | `Behavior/Runtime`, `SourceCommandCoordinator`: source command begins from a background caller without main-hop; source reset mutations are deferred to main and gated by generation                                                                                              | active-window actions call async runtime APIs                   |
| Source loading and cancellation                                          | wrapper promises                                                                             | `behavior/core`                                                                                                                                                                                                                                                                                                                                                    | `Behavior/Core`                                                                                                                                                                                                                                                                  | paged active-window mount/cold-row model                        |
| HLS manifest, proxy lifecycle, cache identity                            | `streamCache`: query-string HLS, header identity, cache budget configure                     | `behavior/hls`, `HlsTransportRoutePolicy`, `HlsProxyRuntime`, `HlsPrefetchDeduper`, `HlsThumbnailCacheTest`, `HlsProxyServerBehaviorTest`: direct-by-default auto route, feed auto-proxy, explicit proxy/direct, proxy-failure direct recovery gate, query-string HLS MIME, retryable implicit start, host destroy, prefetch cap/failure retry, rejected executor recovery, server ownership, corrupt/legacy cache purge, clear-before-server, pass-through segment tee-cache, same-segment in-flight dedup, abort/short-read discard, single eviction per put, running-total eviction correctness, 4 GiB budget + eviction clamp | `Behavior/HlsTransportRoutePolicy`, `HlsProxyRuntimeLifecycleState`, `HlsPrefetchDeduper`, `HlsThumbnailCacheTests`: direct-by-default auto route, feed auto-proxy, explicit proxy/direct, proxy-failure direct recovery gate, implicit start/stop/restart, prefetch cap/failure retry, server ownership, corrupt/legacy cache purge, synchronous clear completion, 4 GiB budget + eviction clamp | header-scoped HLS feed sources                                  |
| Preview first-frame cache/generation                                     | `videoPreview`: `getFirstFrame` and `peekFirstFrame` header identity                         | `PreviewRequestCoordinator`, preview runtime clear/cancel, HLS-direct-MMR skip, progressive direct decode, shared segment-cache reuse, main-thread completion                                                                                                                                                                                                      | `PreviewRequestCoordinator`, preview heuristics/cache, generator-first HLS fallback, off-main HLS player grab policy, KTV ledger open-request counter                                                                                                                            | preview-window source projection                                |
| Listener/observer cleanup                                                | event hooks                                                                                  | listener registry (+ removal during emit)                                                                                                                                                                                                                                                                                                                          | `ListenerRegistryCore` re-resolve + observer seams                                                                                                                                                                                                                               | mounted pool avoids cold-row players                            |
| Lifecycle gate: emit-after-release, stale-generation, idempotent release | n/a                                                                                          | `behavior/core` `LifecycleGate`                                                                                                                                                                                                                                                                                                                                    | `Behavior/Core` `LifecycleGate`                                                                                                                                                                                                                                                  | crash-scenario screens (mount/unmount, source swap, feed churn) |
| Resource pressure and memory trim                                        | source identity avoids churn                                                                 | `PlayerRetentionCoordinator` trim/feed decisions, `PlayerAppStatePolicy` auto-pause/resume                                                                                                                                                                                                                                                                         | `PlayerRetentionCoordinator` trim/feed decisions, `PlayerAppStatePolicy` auto-pause/resume                                                                                                                                                                                       | background/feed/preload stress screens                          |
| Error shape and startup error policy                                     | `NitroPlayerError`                                                                           | playback errors                                                                                                                                                                                                                                                                                                                                                    | startup error policy                                                                                                                                                                                                                                                             | app render smoke                                                |

## Example Consumer Model

`example/scenarioModel.ts` is the production-owned seam for consumer-like usage.
It owns hero sources, feed/page fixtures, active-window selection, source reuse,
header-scoped HLS identities, and conversion from `NitroSourceConfig` to the
string-uri runtime source accepted by `streamCache` and `videoPreview`.

`example/__tests__/scenarioModel.test.ts` covers the model directly so the
example can be refactored without locking tests to React component internals.
The example app must import this model instead of rebuilding source configs or
runtime-source objects inline.

## Source Runtime Identity

`src/__tests__/behavior/api/prepareSource.test.ts` owns public source policy and
identity. `sourceFactory.test.ts` owns JS-to-native source config creation:
consumer policies expand to native defaults, explicit overrides win, and
malformed nested config is rejected before the native factory.

`src/streaming/__tests__/streamCache.test.ts` owns JS stream cache runtime
identity and the public `streamCache.configure({ maxBytes })` contract.
`videoPreview` shares source resolution semantics and is backed by a split Nitro
hybrid object (`NitroVideoPreview`).

## Native Retention

`PlayerRetentionCoordinator` is the production-owned seam for native resource
pressure and feed hot-pool decisions. Kotlin and Swift tests cover released and
sourceless no-ops, pinned-player protection, idle attached feed-player trimming,
hot-only feed trimming, three-slot feed-ring hot selection, and bounded feed
selection. Platform-specific inputs, such as iOS external playback, must be
folded into the coordinator snapshot before trimming. `NitroPlayerManager`
coalesces normal feed hot-pool rebalances to one main-runloop turn; memory
pressure paths trim and rebalance immediately.

`PlayerAppStatePolicy` is the production-owned seam for host inactive/background
auto-pause and foreground resume on both native platforms. Tests cover
`playInBackground`, `playWhenInactive`, external playback protection, and retry
state when resume fails.

Android `HlsProxyRuntime` and iOS `HlsProxyRuntimeLifecycleState` are the
production-owned seams for retryable implicit HLS runtime start, explicit stop,
host-lifecycle suspend, and playback-recovery restart. Android keeps lifecycle
state and server ownership under the runtime lock; iOS mutates its lifecycle seam
only inside `HlsProxyRuntime.runtimeQueue`; the state seam has no queue of its
own. `HlsPrefetchDeduper` owns the prefetch dedup window, failure retry, and hard
cap on both native platforms.
`HlsTransportRoutePolicy` owns HLS playback route selection on both native
platforms: `auto` is direct by default, feed-pool-eligible HLS uses proxy, and
explicit `direct`/`proxy` override the auto rule. Startup recovery is gated by
the actual active proxy route, so proxy-start fallback stays direct.
iOS HLS playback uses private vendored KTVHTTPCache; static native audit guards
the selected upstream fixes and ensures GCDWebServer is not reintroduced as an
external dependency. It also guards bounded KTV foreground ping waits, Android
runtime stop-outside-lock, and bounded production executors for bridge async work.
`HlsCacheStore` owns thumbnail-cache self-healing plus 4 GiB default budget,
post-write eviction clamp, single-pass Android segment eviction, and running
total correctness where native segment stores exist. iOS stream prefetch warms
only KTVHTTPCache; repeated iOS prefetch skipping is the `HlsPrefetchDeduper`
window, not a second `HlsCacheStore` segment index. Android `HlsProxyServerBehaviorTest`
owns pass-through segment tee-cache behavior: first byte reaches the client
before upstream EOF, cache commit happens only after full stream, aborted streams
discard temp files, and same-segment concurrent requests wait for the first
commit before serving FileInputStream cache hits.
`PreviewRequestCoordinator` owns preview side-job coalescing and cancellation so
stale frames cannot be delivered after release/clear paths. Android
`VideoPreviewRuntimeBehaviorTest` owns preview efficiency: HLS manifests skip the
doomed direct retriever open, progressive URLs still use the direct path, preview
segment decode consults the shared `HlsCacheStore` segment entry before network
fetch, and first-frame completion is posted through the cached main handler.
iOS `VideoPreviewPipelineTests` owns preview pipeline ordering and drain-wait
efficiency: HLS manifests try `AVAssetImageGenerator` before the AVPlayer fallback,
the AVPlayer thumbnail grab policy stays off-main with relaxed polling, and the
vendored KTV ledger keeps open network request counts without snapshot scans.
`PlaybackStateEmissionGate` owns native playback-state event dedupe on the
progress hot path; tests cover `NaN` stability, identical-fingerprint suppression,
no-listener early-out, subscriber-reset, and active-source/item-scoped progress
loop lifecycle. Static audit forbids string signatures or full `PlaybackState`
copies in that path. Swift coverage lives in
`tests/ios/Tests/Behavior/PlaybackStateEmissionHotPathTests.swift`; Kotlin
coverage lives in
`android/src/test/java/com/nitroplay/behavior/playback/PlaybackStateEmissionHotPathTest.kt`.
`PlaybackSeekPlanner` owns Android seek clamp math for single-hop `seekBy` and
`seekTo`; Kotlin coverage lives in
`android/src/test/java/com/nitroplay/behavior/playback/PlaybackSeekPlannerTest.kt`.

## Native Player Engine Reuse

Android source changes reuse the ExoPlayer engine by default when the playback
load-control config is compatible. Track selector changes are applied in place,
fatal/watchdog recovery forces an engine rebuild, and retention clear/trim still
releases the engine. iOS already keeps the AVPlayer shell and replaces the
current AVPlayerItem for source changes.

## Rules

- Do not test source text, function bodies, or local copies of production
  branches.
- If a hybrid is not directly instantiable in a headless runner, extract a small
  production-owned seam and use it from production.
- String assertions are allowed only for real outputs: error messages, manifest
  text, URLs, or serialized native payloads.
- Shared native behavior needs Kotlin and Swift coverage unless the matrix marks
  it platform-specific.
- Lifecycle / threading bug-classes (emit-after-release, stale-generation,
  observer-after-teardown, data races) must be covered through the shared
  `LifecycleGate` / `ListenerRegistryCore` seams, never via copied decision logic.
- `scripts/audit-lifecycle-guards.mjs` statically fails CI when a resource-touching
  callback (KVO/observer/async block) lacks an early isReleased / generation guard;
  verified-safe sites carry a `// lifecycle-audit:ignore(<reason>)` marker. iOS
  additionally runs `swift test --sanitize=thread` and `--sanitize=address`.
- `scripts/audit-native-architecture.mjs` statically enforces mirrored native
  seams/tests and selected threading/runtime invariants across iOS and Android.
- Run `yarn test:behavior:audit` and `yarn audit:lifecycle` before the normal test suite.
