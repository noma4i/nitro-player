package com.nitroplay.video.core.utils

import com.nitroplay.video.core.SourceError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SourceLoaderTest {

  @Test
  fun load_returnsResult() {
    val loader = SourceLoader()
    val result = loader.load { 42 }
    assertEquals(42, result)
  }

  @Test
  fun load_propagatesException() {
    val loader = SourceLoader()
    assertThrows(IllegalStateException::class.java) {
      loader.load { throw IllegalStateException("boom") }
    }
  }

  @Test
  fun cancel_beforeLoad_nextLoadSucceeds() {
    val loader = SourceLoader()
    loader.cancel()
    val result = loader.load { "ok" }
    assertEquals("ok", result)
  }

  @Test
  fun cancel_isIdempotent() {
    val loader = SourceLoader()
    loader.cancel()
    loader.cancel()
    val result = loader.load { "still ok" }
    assertEquals("still ok", result)
  }

  @Test
  fun load_cancelsDuringOperation_throwsCancelled() {
    val loader = SourceLoader()

    assertThrows(SourceError.Cancelled::class.java) {
      loader.load {
        loader.cancel()
        "should not return"
      }
    }
  }

  @Test
  fun consecutiveLoads_lastOneWins() {
    val loader = SourceLoader()
    val result1 = loader.load { "first" }
    assertEquals("first", result1)

    val result2 = loader.load { "second" }
    assertEquals("second", result2)
  }

  @Test
  fun load_cancelDuringOperation_propagatesCancelledNotOriginalError() {
    val loader = SourceLoader()

    assertThrows(SourceError.Cancelled::class.java) {
      loader.load {
        loader.cancel()
        throw RuntimeException("original error")
      }
    }
  }
}
