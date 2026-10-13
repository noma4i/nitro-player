import Foundation
import NitroModules

class HybridNitroPlaybackRuntime: HybridNitroPlaybackRuntimeSpec {
  private let mainThreadExecutor = MainThreadResourceExecutor()

  func debugSnapshot() throws -> String {
    let object = mainThreadExecutor.run { () -> [String: Any] in
      let snapshot = PlaybackSessionRuntime.shared.coordinator.snapshot()
      let activeSessionKey = snapshot.activeLeaseId.flatMap { activeLeaseId in
        snapshot.sessions.first { $0.leaseId == activeLeaseId }?.key
      }
      let players = NitroPlayerManager.shared
        .debugPlayerSnapshots(coordinatorSnapshot: snapshot)
        .map { player -> [String: Any] in
          var player = player
          player["isRingSlot"] = player["isRingSlot"] as? Bool ?? false
          player["deniedBy"] = deniedBy(
            player: player,
            snapshot: snapshot,
            activeSessionKey: activeSessionKey
          ) ?? NSNull()
          return player
        }
      let object: [String: Any] = [
        "foreground": snapshot.foreground,
        "activeLeaseId": snapshot.activeLeaseId ?? NSNull(),
        "revision": snapshot.revision,
        "audioSession": audioSessionDebugSnapshot(),
        "prefetch": HlsPrefetcher.shared.debugSnapshot(),
        "suspensions": snapshot.suspensions.map { suspension in
          [
            "token": suspension.token,
            "reason": suspension.reason,
            "allowGroups": suspension.allowGroups.map { $0 as Any } ?? NSNull()
          ]
        },
        "sessions": snapshot.sessions.map { session in
          [
            "key": session.key,
            "leaseId": session.leaseId,
            "group": session.policy.group,
            "priority": session.policy.priority,
            "resume": String(describing: session.policy.resume),
            "intent": String(describing: session.intent),
            "intentSequence": session.intentSequence,
            "effectiveState": String(describing: session.effectiveState)
          ]
        },
        "players": players
      ]
      return object
    }
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    guard let string = String(data: data, encoding: .utf8) else {
      throw NSError(
        domain: "NitroPlaybackRuntime",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Failed to encode playback runtime diagnostics as UTF-8"]
      )
    }
    return string
  }

  private func audioSessionDebugSnapshot() -> [String: Any] {
    let runtime = NativeAudioSessionRuntime.shared
    let snapshot = runtime.snapshot
    return [
      "active": snapshot.appliedMode == .playback && !runtime.isForeign,
      "foreign": runtime.isForeign,
      "appliedProfile": runtime.appliedProfile ?? NSNull(),
      "lastApplyError": snapshot.lastError ?? NSNull(),
      "recoveryCount": runtime.recoveryCount,
      "applyCount": runtime.applyCount
    ]
  }

  func beginExternalAudioSession() throws -> Double {
    Double(mainThreadExecutor.run {
      NativeAudioSessionRuntime.shared.beginExternalAudioSession()
    })
  }

  func endExternalAudioSession(token: Double) throws {
    guard token.isFinite,
      token >= 1,
      token.rounded(.towardZero) == token,
      token <= Double(Int64.max) else {
      return
    }

    mainThreadExecutor.run {
      NativeAudioSessionRuntime.shared.endExternalAudioSession(UInt64(token))
    }
  }

  private func deniedBy(
    player: [String: Any],
    snapshot: PlaybackSessionCoordinatorSnapshot,
    activeSessionKey: String?
  ) -> String? {
    guard player["intent"] as? String == "play" else {
      return "idle-intent"
    }

    let eligibility = player["eligibility"] as? [String: Any]
    let active = eligibility?["active"] as? Bool == true
    let visible = eligibility?["visible"] as? Bool == true
    let attached = eligibility?["attached"] as? Bool == true
    let requiresView = eligibility?["requiresView"] as? Bool == true
    var failedEligibility: [String] = []
    if !active {
      failedEligibility.append("active")
    }
    if !visible {
      failedEligibility.append("visible")
    }
    if requiresView && !attached {
      failedEligibility.append("attached")
    }
    if !failedEligibility.isEmpty {
      return "not-eligible(\(failedEligibility.joined(separator: ",")))"
    }

    if !snapshot.foreground {
      return "background"
    }

    let group = player["group"] as? String
    if let suspension = snapshot.suspensions.first(where: { suspension in
      guard let allowGroups = suspension.allowGroups, let group else {
        return true
      }
      return !allowGroups.contains(group)
    }) {
      return "suspended-by:\(suspension.reason)"
    }

    let key = player["key"] as? String
    let session = key.flatMap { key in
      snapshot.sessions.first { $0.key == key }
    }
    if session?.leaseId != snapshot.activeLeaseId {
      return "lost-arbitration-to:\(activeSessionKey ?? "none")"
    }

    if
      let ringSlot = player["ringSlot"] as? [String: Any],
      ringSlot["awaitingSourceCommit"] as? Bool == true
    {
      return "awaiting-source-commit"
    }

    let wantsToPlay = player["wantsToPlay"] as? Bool == true
    let retentionLevel = player["retentionLevel"] as? String ?? "cold"
    let hasActiveSource = player["hasActiveSource"] as? Bool == true
    if wantsToPlay && (retentionLevel != "hot" || !hasActiveSource) {
      return "trimmed(\(retentionLevel))"
    }

    return nil
  }

  func setSuspended(key: String, suspended: Bool, allowGroups: [String]?) {
    mainThreadExecutor.runAsync {
      PlaybackSessionRuntime.shared.setSuspended(key, suspended: suspended, allowGroups: allowGroups)
    }
  }

  func resetClientSuspensions() {
    mainThreadExecutor.runAsync {
      PlaybackSessionRuntime.shared.resetClientSuspensions()
    }
  }

  func stopAll() {
    mainThreadExecutor.runAsync {
      PlaybackSessionRuntime.shared.stopAll()
    }
  }

  func configureCache(maxBytes: Double) throws {
    guard maxBytes.isFinite,
      maxBytes.rounded(.towardZero) == maxBytes,
      maxBytes <= Double(Int64.max) else {
      throw NSError(
        domain: "NitroPlaybackCache",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Nitro playback cache maxBytes must be a valid integer"]
      )
    }
    try HlsProxyRuntime.shared.configureCache(maxBytes: Int64(maxBytes))
  }

  func prefetchSource(uri: String, headers: [String: String]?, durationSeconds: Double?) {
    HlsPrefetcher.shared.prefetch(
      url: uri,
      headers: headers,
      durationSeconds: durationSeconds ?? HlsPrefetcher.defaultDurationSeconds
    )
  }

  func cancelPrefetch(uri: String, headers: [String: String]?) {
    HlsPrefetcher.shared.cancel(url: uri, headers: headers)
  }

  func getCacheStats() throws -> Promise<NitroCacheStats> {
    let stats = HlsProxyRuntime.shared.cacheStats()
    return Promise<NitroCacheStats>.resolved(
      withResult: NitroCacheStats(
        totalBytes: Double(stats.totalBytes),
        fileCount: Double(stats.fileCount),
        maxBytes: Double(stats.maxBytes)
      )
    )
  }

  func clearCache() throws -> Promise<Void> {
    HlsProxyRuntime.shared.clearCache()
    return Promise<Void>.resolved()
  }

  func addOnPrefetchSettledListener(listener: @escaping (String) -> Void) throws -> ListenerSubscription {
    HlsPrefetcher.shared.addOnSettledListener(listener: listener)
  }

  func addOnOutputDeviceLostListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    return mainThreadExecutor.run {
      NitroPlayerManager.shared.addOnOutputDeviceLostListener(listener: listener)
    }
  }

  func addOnForegroundListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    return mainThreadExecutor.run {
      NitroPlayerManager.shared.addOnForegroundListener(listener: listener)
    }
  }
}
