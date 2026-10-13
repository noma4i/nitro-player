enum PlaybackWatchdogAction {
  case resetAndRearm
  case recoverStalledPlayback
  case rearm
  case escalateSource
  case enterCooldown
  case terminate
}

struct PlaybackWatchdogDecision {
  let action: PlaybackWatchdogAction
  let attempts: Int
}

enum PlaybackWatchdogPolicy {
  static func playbackWatchdogWindowDelayNs(
    hasObservedClockProgress: Bool,
    isCoolingDown: Bool
  ) -> UInt64 {
    if isCoolingDown { return 15_000_000_000 }
    return hasObservedClockProgress ? 3_000_000_000 : 12_000_000_000
  }

  static func hasClockAdvanced(
    startSeconds: Double,
    currentSeconds: Double,
    loopWrapped: Bool
  ) -> Bool {
    guard currentSeconds.isFinite else { return false }
    return loopWrapped || (startSeconds.isFinite && currentSeconds - startSeconds > 0.01)
  }

  static func isObservedPlaying(
    clockAdvanced: Bool,
    nativeRate: Double,
    wantsToPlay: Bool
  ) -> Bool {
    clockAdvanced && nativeRate.isFinite && nativeRate > 0 && wantsToPlay
  }

  static func evaluate(
    startSeconds: Double,
    currentSeconds: Double,
    durationSeconds: Double,
    loop: Bool,
    loopWrapped: Bool,
    hasLoadedCurrentSource: Bool,
    attempts: Int,
    maxAttempts: Int,
    escalationUsed: Bool,
    cooldownElapsed: Bool,
    requiresVisualReadiness: Bool,
    visuallyReady: Bool,
    cooldownCycles: Int,
    maxCooldownCycles: Int
  ) -> PlaybackWatchdogDecision {
    let changed = hasClockAdvanced(
      startSeconds: startSeconds,
      currentSeconds: currentSeconds,
      loopWrapped: loopWrapped
    )
    let isNearEnd = !loop && durationSeconds.isFinite && currentSeconds.isFinite &&
      currentSeconds >= durationSeconds - 0.25
    if (changed && (!requiresVisualReadiness || visuallyReady)) || isNearEnd {
      return PlaybackWatchdogDecision(action: .resetAndRearm, attempts: 0)
    }

    if cooldownElapsed {
      if cooldownCycles >= maxCooldownCycles {
        return PlaybackWatchdogDecision(action: .terminate, attempts: attempts)
      }
      return PlaybackWatchdogDecision(
        action: hasLoadedCurrentSource ? .recoverStalledPlayback : .rearm,
        attempts: 0
      )
    }

    let nextAttempts = attempts + 1
    if nextAttempts >= maxAttempts {
      if escalationUsed {
        return PlaybackWatchdogDecision(action: .enterCooldown, attempts: maxAttempts)
      }
      return PlaybackWatchdogDecision(action: .escalateSource, attempts: 0)
    }

    return PlaybackWatchdogDecision(
      action: hasLoadedCurrentSource ? .recoverStalledPlayback : .rearm,
      attempts: nextAttempts
    )
  }
}
