package com.nitroplay.video.behavior.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Mirrors the early-play intent preservation added to
 * HybridNitroPlayer.replaceSourceAsync: the prior `wantsToPlay` is captured
 * before it is reset, and after the new source is prepared the player
 * auto-resumes only when the intent was set, the generation still matches, and
 * the player was not released. The real method lives in a hybrid that cannot run
 * in the unit-test JVM (same convention as BufferingStateLogicTest).
 */
class ReplaceSourceAutoplayTest {

  private class ReplaceModel(var wantsToPlay: Boolean) {
    var sourceGeneration = 0
    var isReleased = false
    var didPlay = false
      private set

    fun replace(advanceDuringPrepare: Boolean = false, releaseDuringPrepare: Boolean = false) {
      val shouldAutoPlay = wantsToPlay
      wantsToPlay = false
      sourceGeneration += 1 // beginSourceGeneration()
      val captured = sourceGeneration

      // ...initializePlayer()/prepare() runs here...
      if (advanceDuringPrepare) sourceGeneration += 1
      if (releaseDuringPrepare) isReleased = true

      if (shouldAutoPlay) {
        if (isReleased || sourceGeneration != captured) return
        wantsToPlay = true
        didPlay = true
      }
    }
  }

  @Test
  fun swapWhilePlaying_resumesNewSource() {
    val model = ReplaceModel(wantsToPlay = true)
    model.replace()
    assertTrue(model.didPlay)
    assertTrue(model.wantsToPlay)
  }

  @Test
  fun swapWhilePaused_doesNotAutoplay() {
    val model = ReplaceModel(wantsToPlay = false)
    model.replace()
    assertFalse(model.didPlay)
    assertFalse(model.wantsToPlay)
  }

  @Test
  fun staleReplace_doesNotResume() {
    val model = ReplaceModel(wantsToPlay = true)
    model.replace(advanceDuringPrepare = true)
    assertFalse(model.didPlay)
  }

  @Test
  fun releaseDuringPrepare_dropsAutoplay() {
    val model = ReplaceModel(wantsToPlay = true)
    model.replace(releaseDuringPrepare = true)
    assertFalse(model.didPlay)
  }
}
