# Testing Behavior Matrix

Tests live in three lanes and cover behavior through production code or
production-owned seams. Tests never read source text.

| Behavior | JS | Kotlin | Swift |
| --- | --- | --- | --- |
| Source policy expansion and identity | `source/__tests__/prepareSource.test.ts` | n/a | n/a |
| Feed ring window and slot assignment | `feed/__tests__/feedRingWindow.test.ts` | `FeedRingWindowPlannerTest` | `FeedRingWindowPlannerTests` |
| Feed ring command planning (replace, reuse, clear, error slot) | n/a | `FeedRingCommandPlannerTest` | `FeedRingCommandPlannerTests` |
| Feed host arbitration and projection | `feed/__tests__/FeedRingHostArbiter.test.ts` | n/a | n/a |
| Prefetch window, priority, settle, cancel | `prefetch/__tests__/NitroPrefetchQueue.test.ts` | n/a | n/a |
| Surface snapshot reduction and notify rules | `surface/__tests__/NitroPlaybackSurfaceSnapshot.test.ts` | n/a | n/a |
| Resource-pressure trimming | n/a | `PlayerRetentionCoordinatorTest` | `PlayerRetentionCoordinatorTests` |
| App-state auto-pause and resume | n/a | `PlayerAppStatePolicyTest` | `PlayerAppStatePolicyTests` |
| Playback watchdog decisions | n/a | `PlaybackWatchdogPolicyTest` | `PlaybackWatchdogPolicyTests` |
| Single-owner resource slot | n/a | `SingleOwnerResourceSlotTest` | `SingleOwnerResourceSlotTests` |
| Playback suspension registry | n/a | `PlaybackSuspensionRegistryTest` | `PlaybackSuspensionRegistryTests` |
| Audio session policy | n/a | n/a | `NativeAudioSessionPolicyTests` |
| Audio session ownership, player view binding | n/a | n/a | `native-tests/` (`yarn test:audio-session:ios`, `yarn test:view-binding:ios`) |
| HLS manifest parsing and rewriting | n/a | `HlsManifestTest` | n/a |
| HLS prefetch de-duplication | n/a | `HlsPrefetchDeduperTest` | n/a |
| HLS proxy server lifecycle | n/a | `HlsProxyServerBehaviorTest` | n/a |
| Lifecycle gate, listener registry, threading, source loading | n/a | `behavior/core`, `behavior/runtime` | `LifecycleGate` via audits |
| Example app | `example/__tests__` (model and render smoke) | n/a | n/a |

## Audits

| Script | Guards |
| --- | --- |
| `audit:architecture` | Domain folders per platform, SwiftPM symlinks |
| `audit:native-architecture` | Mirrored iOS and Android seams and tests, forbidden main-thread sync, threading rules |
| `audit:lifecycle` | Release and generation guards in callbacks |
| `test:behavior:audit` | No source-reading tests |

## Known gaps

Not covered by automated tests yet: `SourceActivationPolicy`, `PlaybackForegroundRecovery`,
`PlaybackSessionCoordinator` on iOS, `AudioFocusEventEngine` and `PlaybackSessionBinding`
on Android, `HlsRuntimeState`, `HlsCacheContentValidator`, and `HlsRequestIdentity`.
The SwiftPM test package compiles only files without Nitro-generated or KTVHTTPCache
dependencies; the first three need those types.
