package com.nitroplay.video.core.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ThreadingTest {

  @Test
  fun sourceLoader_cancelDuringLoadThrowsCancelled() {
    val loader = SourceLoader()
    var wasCancelled = false

    try {
      loader.load {
        loader.cancel()
        "stale result"
      }
    } catch (e: Throwable) {
      wasCancelled = true
    }

    assertTrue("Load should be cancelled when cancel() called during operation", wasCancelled)
  }

  @Test
  fun sourceLoader_concurrentReplaceSource_lastWins() {
    val loader = SourceLoader()
    val appliedSources = mutableListOf<String>()

    val result1 = loader.load {
      appliedSources.add("source1")
      "source1"
    }
    assertEquals("source1", result1)

    val result2 = loader.load {
      appliedSources.add("source2")
      "source2"
    }
    assertEquals("source2", result2)
    assertEquals(listOf("source1", "source2"), appliedSources)
  }
}
