package com.nitroplay.video.behavior.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class PlaybackWatchdogRecoveryTest {
  private class Model {
    var hasLoadedCurrentSource = true
    var wantsToPlay = true
    var generation = 1
    var attempts = 0
    var recovered = false
      private set
    var rearmed = false
      private set

    fun play() {
      val wasPlayIntentActive = wantsToPlay
      wantsToPlay = true
      if (!wasPlayIntentActive) {
        attempts = 0
      }
    }

    fun tick(
      startPositionMs: Long,
      currentPositionMs: Long,
      isPlaying: Boolean,
      isNearEnd: Boolean = false,
      generationAtArm: Int = 1
    ) {
      recovered = false
      rearmed = false

      if (!wantsToPlay || generation != generationAtArm) return

      val advancedOrWrapped = abs(currentPositionMs - startPositionMs) > 10L
      if (isPlaying && (advancedOrWrapped || isNearEnd)) {
        attempts = 0
        rearmed = true
        return
      }

      attempts += 1
      if (hasLoadedCurrentSource) {
        recovered = true
      } else {
        rearmed = true
      }
    }
  }

  @Test
  fun loadedBufferingWithoutProgress_recovers() {
    val model = Model()

    model.tick(startPositionMs = 0L, currentPositionMs = 0L, isPlaying = false)

    assertTrue(model.recovered)
    assertFalse(model.rearmed)
    assertEquals(1, model.attempts)
  }

  @Test
  fun unloadedBufferingWithoutProgress_keepsWatching() {
    val model = Model()
    model.hasLoadedCurrentSource = false

    model.tick(startPositionMs = 0L, currentPositionMs = 0L, isPlaying = false)

    assertFalse(model.recovered)
    assertTrue(model.rearmed)
    assertEquals(1, model.attempts)
  }

  @Test
  fun playingProgress_resetsAttemptsAndRearms() {
    val model = Model()
    model.attempts = 2

    model.tick(startPositionMs = 1000L, currentPositionMs = 1500L, isPlaying = true)

    assertFalse(model.recovered)
    assertTrue(model.rearmed)
    assertEquals(0, model.attempts)
  }

  @Test
  fun freshPlayIntent_resetsExhaustedAttempts() {
    val model = Model()
    model.wantsToPlay = false
    model.attempts = 5

    model.play()

    assertTrue(model.wantsToPlay)
    assertEquals(0, model.attempts)
  }
}
