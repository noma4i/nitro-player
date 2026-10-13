import Foundation

/// Brings playback back to its declared state after the process returns to the foreground.
///
/// Foreground recovery is not a sequence of one-shot calls: every step touches a platform
/// resource that is allowed to refuse - the proxy socket may not bind, the system may not hand
/// back the audio session while the transition is still in flight, a player may still be
/// releasing. A step is therefore expressed as "desired versus observed" and the whole pass is
/// repeated with backoff until it converges, so a refusal is retried instead of silently
/// leaving a subsystem in the wrong state.
final class PlaybackForegroundRecovery {
  /// One convergence step. `isSatisfied` observes reality; `apply` nudges it toward the
  /// declared state. Steps run in dependency order.
  private struct Step {
    let name: String
    let isSatisfied: () -> Bool
    let apply: () -> Void
  }

  private let steps: [Step]
  private let maxAttempts: Int
  private let delays: [DispatchTimeInterval]
  private var attempt = 0
  private var passToken: UInt64 = 0
  private var isRunning = false

  private init(steps: [Step], maxAttempts: Int = 6) {
    self.steps = steps
    self.maxAttempts = maxAttempts
    self.delays = [
      .milliseconds(100),
      .milliseconds(300),
      .milliseconds(800),
      .milliseconds(2_000),
      .milliseconds(5_000),
      .milliseconds(10_000)
    ]
  }

  /// Starts a convergence pass. Restarting cancels any pass already in flight: the newer
  /// foreground transition describes the current truth.
  func start() {
    precondition(Thread.isMainThread)
    passToken &+= 1
    attempt = 0
    isRunning = true
    runPass(token: passToken)
  }

  /// Stops converging. Called when the process leaves the foreground - the declared state is
  /// about to change, so a pending retry is meaningless.
  func cancel() {
    precondition(Thread.isMainThread)
    passToken &+= 1
    isRunning = false
    attempt = 0
  }

  private func runPass(token: UInt64) {
    guard isRunning, token == passToken else {
      return
    }

    var unsatisfied: [Step] = []
    for step in steps {
      if step.isSatisfied() {
        continue
      }
      step.apply()
      unsatisfied.append(step)
    }

    guard !unsatisfied.isEmpty else {
      isRunning = false
      return
    }

    scheduleRetry(token: token)
  }

  private func scheduleRetry(token: UInt64) {
    guard attempt < maxAttempts else {
      isRunning = false
      return
    }

    let delay = delays[min(attempt, delays.count - 1)]
    attempt += 1

    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else {
        return
      }
      // A step applied on the previous pass may have converged asynchronously; the next pass
      // re-observes instead of assuming.
      self.runPass(token: token)
    }
  }
}

extension PlaybackForegroundRecovery {
  /// Builds the recovery pass in dependency order: a route resolved against an untrusted
  /// transport is dead, and an intent delivered before the route is refreshed would start
  /// playback on a URL that is about to be replaced.
  static func makeDefault(players: @escaping () -> [HybridNitroPlayer]) -> PlaybackForegroundRecovery {
    let steps: [Step] = [
      Step(
        name: "arbitration",
        isSatisfied: {
          !NitroPlayerManager.shared.hasUnresolvedSystemInterruption
        },
        apply: {
          NitroPlayerManager.shared.resolveStaleSystemInterruption()
        }
      ),
      Step(
        name: "transport",
        isSatisfied: {
          if case .ready = HlsProxyRuntime.shared.transportReadiness {
            return true
          }
          return false
        },
        apply: {
          HlsProxyRuntime.shared.recoverTransport { }
        }
      ),
      Step(
        name: "audio-session",
        isSatisfied: {
          let runtime = NativeAudioSessionRuntime.shared
          if runtime.isForeign {
            return true
          }
          return runtime.snapshot.appliedMode == .playback
        },
        apply: {
          NativeAudioSessionRuntime.shared.reassertAfterProcessResumption()
        }
      ),
      Step(
        name: "routes",
        isSatisfied: {
          players().allSatisfy { !$0.hasStaleRoute }
        },
        apply: {
          players().forEach { $0.refreshPlaybackRouteIfStale() }
        }
      ),
      Step(
        name: "ring-projection",
        isSatisfied: {
          NitroPlayerManager.shared.isFeedRingProjectionFresh
        },
        apply: {
          NitroPlayerManager.shared.notifyForegroundListeners()
        }
      ),
      Step(
        name: "intent",
        isSatisfied: {
          players().allSatisfy { !$0.hasUnsatisfiedPlaybackIntent }
        },
        apply: {
          players().forEach { $0.reassertPlaybackIntentAfterForeground() }
        }
      )
    ]
    return PlaybackForegroundRecovery(steps: steps)
  }
}
