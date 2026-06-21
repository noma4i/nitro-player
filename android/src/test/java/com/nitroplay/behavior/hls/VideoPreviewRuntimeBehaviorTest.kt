package com.nitroplay.hls

import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoPreviewRuntimeBehaviorTest {
  private val executor = Executors.newSingleThreadExecutor()

  @After
  fun tearDown() {
    VideoPreviewRuntime.resetStateForTests()
    executor.shutdownNow()
  }

  @Test
  fun clearCancelsInflightPreviewRequestsBeforeClearingStore() {
    val request = VideoPreviewRuntime.acquirePreviewRequestForTests("video-a") {
      executor.submit(Callable {
        TimeUnit.SECONDS.sleep(5)
        VideoPreviewResult(uri = "stale-frame", fromCache = false)
      })
    }

    VideoPreviewRuntime.clear()

    val startedAt = System.nanoTime()
    assertNull(request.await())
    val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)
    assertTrue("clear() must cancel in-flight preview work instead of waiting for stale writes", elapsedMs < 500)
  }
}
