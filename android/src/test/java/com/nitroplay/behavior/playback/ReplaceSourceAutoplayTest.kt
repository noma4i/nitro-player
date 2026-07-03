package com.nitroplay.video.behavior.playback

import com.nitroplay.video.support.LifecycleGate
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

  private data class SourceCommand(
    val generation: Int,
    val source: String?,
    val shouldAutoPlay: Boolean
  )

  private class ReplaceModel(var wantsToPlay: Boolean) {
    private val gate = LifecycleGate()
    var isReleased = false
    var didPlay = false
      private set
    var committedSource: String? = null
      private set

    fun beginReplace(source: String): SourceCommand {
      val command = SourceCommand(
        generation = gate.beginGeneration(),
        source = source,
        shouldAutoPlay = wantsToPlay
      )
      wantsToPlay = false
      return command
    }

    fun beginClear(): SourceCommand {
      val command = SourceCommand(
        generation = gate.beginGeneration(),
        source = null,
        shouldAutoPlay = false
      )
      wantsToPlay = false
      return command
    }

    fun commit(command: SourceCommand, advanceDuringPrepare: Boolean = false, releaseDuringPrepare: Boolean = false) {
      if (!gate.shouldDeliverCallback(command.generation)) return

      if (command.source == null) {
        committedSource = null
        return
      }

      // ...initializePlayer()/prepare() runs here...
      if (advanceDuringPrepare) gate.beginGeneration()
      if (releaseDuringPrepare) isReleased = true

      if (!gate.shouldDeliverCallback(command.generation) || isReleased) return

      committedSource = command.source
      if (command.shouldAutoPlay) {
        wantsToPlay = true
        didPlay = true
      }
    }
  }

  @Test
  fun swapWhilePlaying_resumesNewSource() {
    val model = ReplaceModel(wantsToPlay = true)
    model.commit(model.beginReplace("source-a"))
    assertTrue(model.didPlay)
    assertTrue(model.wantsToPlay)
    assertEquals("source-a", model.committedSource)
  }

  @Test
  fun swapWhilePaused_doesNotAutoplay() {
    val model = ReplaceModel(wantsToPlay = false)
    model.commit(model.beginReplace("source-a"))
    assertFalse(model.didPlay)
    assertFalse(model.wantsToPlay)
    assertEquals("source-a", model.committedSource)
  }

  @Test
  fun staleReplace_doesNotResume() {
    val model = ReplaceModel(wantsToPlay = true)
    model.commit(model.beginReplace("source-a"), advanceDuringPrepare = true)
    assertFalse(model.didPlay)
    assertNull(model.committedSource)
  }

  @Test
  fun releaseDuringPrepare_dropsAutoplay() {
    val model = ReplaceModel(wantsToPlay = true)
    model.commit(model.beginReplace("source-a"), releaseDuringPrepare = true)
    assertFalse(model.didPlay)
    assertNull(model.committedSource)
  }

  @Test
  fun newerReplaceInvalidatesOlderCommit() {
    val model = ReplaceModel(wantsToPlay = true)
    val older = model.beginReplace("source-a")
    val newer = model.beginReplace("source-b")

    model.commit(older)
    assertNull(model.committedSource)

    model.commit(newer)
    assertEquals("source-b", model.committedSource)
  }

  @Test
  fun clearInvalidatesOlderReplaceCommit() {
    val model = ReplaceModel(wantsToPlay = true)
    val older = model.beginReplace("source-a")
    val clear = model.beginClear()

    model.commit(older)
    assertNull(model.committedSource)

    model.commit(clear)
    assertNull(model.committedSource)
    assertFalse(model.didPlay)
  }
}
