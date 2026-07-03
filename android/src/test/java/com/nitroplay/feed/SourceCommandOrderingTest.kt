package com.nitroplay.feed

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SourceCommandOrderingTest {
  private data class SourceCommand(
    val generation: Int,
    val source: String?,
    val shouldAutoPlay: Boolean
  )

  private class Model(
    var wantsToPlay: Boolean
  ) {
    private var generation = 0
    var committedSource: String? = null
      private set
    var didPlay = false
      private set

    fun beginReplace(source: String): SourceCommand {
      generation += 1
      val command = SourceCommand(
        generation = generation,
        source = source,
        shouldAutoPlay = wantsToPlay
      )
      wantsToPlay = false
      return command
    }

    fun beginClear(): SourceCommand {
      generation += 1
      wantsToPlay = false
      return SourceCommand(
        generation = generation,
        source = null,
        shouldAutoPlay = false
      )
    }

    fun commit(command: SourceCommand, advanceDuringPrepare: Boolean = false) {
      if (command.generation != generation) {
        return
      }

      if (command.source == null) {
        committedSource = null
        return
      }

      if (advanceDuringPrepare) {
        generation += 1
      }
      if (command.generation != generation) {
        return
      }

      committedSource = command.source
      if (command.shouldAutoPlay) {
        wantsToPlay = true
        didPlay = true
      }
    }
  }

  @Test
  fun swapWhilePlayingResumesNewSource() {
    val model = Model(wantsToPlay = true)
    model.commit(model.beginReplace("source-a"))

    assertEquals("source-a", model.committedSource)
    assertTrue(model.didPlay)
    assertTrue(model.wantsToPlay)
  }

  @Test
  fun newerReplaceInvalidatesOlderCommit() {
    val model = Model(wantsToPlay = true)
    val older = model.beginReplace("source-a")
    val newer = model.beginReplace("source-b")

    model.commit(older)
    assertNull(model.committedSource)

    model.commit(newer)
    assertEquals("source-b", model.committedSource)
  }

  @Test
  fun clearInvalidatesOlderReplaceCommit() {
    val model = Model(wantsToPlay = true)
    val older = model.beginReplace("source-a")
    val clear = model.beginClear()

    model.commit(older)
    assertNull(model.committedSource)

    model.commit(clear)
    assertNull(model.committedSource)
    assertFalse(model.didPlay)
  }

  @Test
  fun generationAdvanceDuringPrepareDropsCommit() {
    val model = Model(wantsToPlay = true)

    model.commit(model.beginReplace("source-a"), advanceDuringPrepare = true)

    assertNull(model.committedSource)
    assertFalse(model.didPlay)
  }
}
