package com.nitroplay.video.behavior.playback

import com.margelo.nitro.video.PlaybackWatchdogAction
import com.margelo.nitro.video.PlaybackWatchdogDecision
import com.margelo.nitro.video.PlaybackWatchdogPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackWatchdogPolicyTest {
  private fun evaluate(
    start: Long = 1_000,
    current: Long = 1_000,
    duration: Long = 60_000,
    loop: Boolean = false,
    loopWrapped: Boolean = false,
    loaded: Boolean = true,
    attempts: Int = 0,
    escalationUsed: Boolean = false,
    cooldownElapsed: Boolean = false,
    cooldownCycles: Int = 0,
    requiresRenderedFrameProgress: Boolean = false,
    renderedFrameProgressed: Boolean = true
  ): PlaybackWatchdogDecision = PlaybackWatchdogPolicy.evaluate(
    startPositionMs = start,
    currentPositionMs = current,
    durationMs = duration,
    loop = loop,
    loopWrapped = loopWrapped,
    hasLoadedCurrentSource = loaded,
    attempts = attempts,
    maxAttempts = 3,
    escalationUsed = escalationUsed,
    cooldownElapsed = cooldownElapsed,
    cooldownCycles = cooldownCycles,
    maxCooldownCycles = 2,
    requiresRenderedFrameProgress = requiresRenderedFrameProgress,
    renderedFrameProgressed = renderedFrameProgressed
  )

  @Test
  fun advancingClockResetsAttempts() {
    val decision = evaluate(current = 2_000, attempts = 2)
    assertEquals(PlaybackWatchdogAction.RESET_AND_REARM, decision.action)
    assertEquals(0, decision.attempts)
  }

  @Test
  fun advancingClockWithoutRenderedFrameKeepsRecovering() {
    val decision = evaluate(current = 2_000, requiresRenderedFrameProgress = true, renderedFrameProgressed = false)
    assertEquals(PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK, decision.action)
  }

  @Test
  fun stalledClockRecoversThenEscalatesThenCoolsDown() {
    assertEquals(PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK, evaluate(attempts = 0).action)
    assertEquals(PlaybackWatchdogAction.REARM, evaluate(attempts = 0, loaded = false).action)
    assertEquals(PlaybackWatchdogAction.ESCALATE_SOURCE, evaluate(attempts = 2).action)
    assertEquals(PlaybackWatchdogAction.ENTER_COOLDOWN, evaluate(attempts = 2, escalationUsed = true).action)
  }

  @Test
  fun cooldownRecoversUntilCycleLimitThenTerminates() {
    assertEquals(PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK, evaluate(cooldownElapsed = true, cooldownCycles = 1).action)
    assertEquals(PlaybackWatchdogAction.TERMINATE, evaluate(cooldownElapsed = true, cooldownCycles = 2).action)
  }

  @Test
  fun nearEndIsHealthyOnlyWithoutLoop() {
    assertEquals(PlaybackWatchdogAction.RESET_AND_REARM, evaluate(current = 59_900).action)
    assertEquals(PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK, evaluate(start = 59_900, current = 59_900, loop = true).action)
  }

  @Test
  fun loopWrapCountsAsProgress() {
    assertTrue(PlaybackWatchdogPolicy.hasClockAdvanced(9_000, 100, loopWrapped = true))
    assertFalse(PlaybackWatchdogPolicy.hasClockAdvanced(9_000, 9_005, loopWrapped = false))
  }

  @Test
  fun windowDelayDependsOnProgressAndCooldown() {
    assertEquals(3_000L, PlaybackWatchdogPolicy.playbackWatchdogWindowDelayMs(hasObservedClockProgress = true, isCoolingDown = false))
    assertEquals(12_000L, PlaybackWatchdogPolicy.playbackWatchdogWindowDelayMs(hasObservedClockProgress = false, isCoolingDown = false))
    assertEquals(15_000L, PlaybackWatchdogPolicy.playbackWatchdogWindowDelayMs(hasObservedClockProgress = true, isCoolingDown = true))
  }
}
