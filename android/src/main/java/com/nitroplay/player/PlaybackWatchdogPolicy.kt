package com.margelo.nitro.video

internal enum class PlaybackWatchdogAction {
  RESET_AND_REARM,
  RECOVER_STALLED_PLAYBACK,
  REARM,
  ESCALATE_SOURCE,
  ENTER_COOLDOWN,
  TERMINATE
}

internal data class PlaybackWatchdogDecision(
  val action: PlaybackWatchdogAction,
  val attempts: Int
)

internal object PlaybackWatchdogPolicy {
  private const val COOLDOWN_DELAY_MS = 15_000L
  private const val OBSERVED_DELAY_MS = 3_000L
  private const val COLD_START_DELAY_MS = 12_000L

  fun playbackWatchdogWindowDelayMs(
    hasObservedClockProgress: Boolean,
    isCoolingDown: Boolean
  ): Long {
    if (isCoolingDown) return COOLDOWN_DELAY_MS
    return if (hasObservedClockProgress) OBSERVED_DELAY_MS else COLD_START_DELAY_MS
  }

  fun hasClockAdvanced(
    startPositionMs: Long,
    currentPositionMs: Long,
    loopWrapped: Boolean
  ): Boolean {
    if (loopWrapped) return true
    return currentPositionMs - startPositionMs > 10L
  }

  fun evaluate(
    startPositionMs: Long,
    currentPositionMs: Long,
    durationMs: Long,
    loop: Boolean,
    loopWrapped: Boolean,
    hasLoadedCurrentSource: Boolean,
    attempts: Int,
    maxAttempts: Int,
    escalationUsed: Boolean,
    cooldownElapsed: Boolean,
    cooldownCycles: Int,
    maxCooldownCycles: Int,
    requiresRenderedFrameProgress: Boolean = false,
    renderedFrameProgressed: Boolean = true
  ): PlaybackWatchdogDecision {
    val changed = hasClockAdvanced(
      startPositionMs = startPositionMs,
      currentPositionMs = currentPositionMs,
      loopWrapped = loopWrapped
    )
    // Keep parity with iOS: near-end is healthy only for non-loop playback.
    val isNearEnd = !loop && durationMs > 0L && currentPositionMs >= durationMs - 250L
    if ((changed && (!requiresRenderedFrameProgress || renderedFrameProgressed)) || isNearEnd) {
      return PlaybackWatchdogDecision(PlaybackWatchdogAction.RESET_AND_REARM, attempts = 0)
    }

    if (cooldownElapsed) {
      if (cooldownCycles >= maxCooldownCycles) {
        return PlaybackWatchdogDecision(PlaybackWatchdogAction.TERMINATE, attempts = attempts)
      }
      return PlaybackWatchdogDecision(
        action = if (hasLoadedCurrentSource) {
          PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK
        } else {
          PlaybackWatchdogAction.REARM
        },
        attempts = 0
      )
    }

    val nextAttempts = attempts + 1
    if (nextAttempts >= maxAttempts) {
      if (escalationUsed) {
        return PlaybackWatchdogDecision(PlaybackWatchdogAction.ENTER_COOLDOWN, attempts = maxAttempts)
      }
      return PlaybackWatchdogDecision(PlaybackWatchdogAction.ESCALATE_SOURCE, attempts = 0)
    }

    return PlaybackWatchdogDecision(
      action = if (hasLoadedCurrentSource) {
        PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK
      } else {
        PlaybackWatchdogAction.REARM
      },
      attempts = nextAttempts
    )
  }
}
