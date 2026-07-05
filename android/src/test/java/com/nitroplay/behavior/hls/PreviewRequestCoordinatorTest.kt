package com.nitroplay.video.behavior.hls

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.nitroplay.video.preview.PreviewRequestCoordinator
import com.nitroplay.video.preview.PreviewWork

class PreviewRequestCoordinatorTest {
  private val executor = Executors.newCachedThreadPool()

  private class CountingWork<T>(
    private val value: T?
  ) {
    val cancelCount = AtomicInteger(0)

    fun work(): PreviewWork<T> {
      return PreviewWork(CompletableFuture.completedFuture(value)) {
        cancelCount.incrementAndGet()
      }
    }
  }

  @After
  fun tearDown() {
    executor.shutdownNow()
  }

  @Test
  fun acquire_coalescesSameKeyIntoOneFuture() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val executions = AtomicInteger(0)

    val first = coordinator.acquire("video-a") {
      submitWork {
        executions.incrementAndGet()
        "frame-a"
      }
    }
    val second = coordinator.acquire("video-a") {
      submitWork {
        executions.incrementAndGet()
        "wrong-frame"
      }
    }

    assertEquals("frame-a", first.await())
    assertEquals("frame-a", second.await())
    first.cancel()
    second.cancel()
    assertEquals(1, executions.get())
  }

  @Test
  fun acquire_doesNotCoalesceDifferentKeys() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val executions = AtomicInteger(0)

    val first = coordinator.acquire("video-a") {
      submitWork {
        executions.incrementAndGet()
        "frame-a"
      }
    }
    val second = coordinator.acquire("video-b") {
      submitWork {
        executions.incrementAndGet()
        "frame-b"
      }
    }

    assertEquals("frame-a", first.await())
    assertEquals("frame-b", second.await())
    first.cancel()
    second.cancel()
    assertEquals(2, executions.get())
  }

  @Test
  fun cancel_keepsSharedFutureAliveUntilLastWaiterCancels() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val first = coordinator.acquire("video-a") {
      submitWork {
        TimeUnit.MILLISECONDS.sleep(150)
        "frame-a"
      }
    }
    val second = coordinator.acquire("video-a") {
      submitWork { "wrong-frame" }
    }

    first.cancel()

    assertFalse("One cancelled waiter must not cancel the shared job while another waiter remains", second.isCancelled)
    assertEquals("frame-a", second.await())
    second.cancel()
  }

  @Test
  fun cancelLastWaiter_cancelsSharedFutureAndRemovesEntry() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val request = coordinator.acquire("video-a") {
      submitWork {
        TimeUnit.SECONDS.sleep(5)
        "late-frame"
      }
    }

    request.cancel()

    assertTrue(request.isCancelled)
    assertEquals(0, coordinator.inflightCount)

    val next = coordinator.acquire("video-a") {
      submitWork { "new-frame" }
    }
    assertEquals("new-frame", next.await())
    next.cancel()
  }

  @Test
  fun cancel_isIdempotentForTheSameWaiter() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val countingWork = CountingWork("frame-a")
    val request = coordinator.acquire("video-a") { countingWork.work() }

    request.cancel()
    request.cancel()

    assertTrue(request.isCancelled)
    assertEquals(0, coordinator.inflightCount)
    assertEquals(1, countingWork.cancelCount.get())
  }

  @Test
  fun cancelAll_cancelsEveryInflightJobAndAwaitDoesNotBlock() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val first = coordinator.acquire("video-a") {
      submitWork {
        TimeUnit.SECONDS.sleep(5)
        "late-a"
      }
    }
    val second = coordinator.acquire("video-b") {
      submitWork {
        TimeUnit.SECONDS.sleep(5)
        "late-b"
      }
    }

    assertEquals(2, coordinator.inflightCount)

    coordinator.cancelAll()

    val startedAt = System.nanoTime()
    assertNull(first.await())
    assertNull(second.await())
    val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)

    assertEquals(0, coordinator.inflightCount)
    assertTrue("Await after cancelAll must return promptly instead of blocking a worker thread", elapsedMs < 500)
  }

  @Test
  fun cancelAll_preventsCompletedFutureFromDeliveringStaleValue() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val request = coordinator.acquire("video-a") { CountingWork("already-finished-frame").work() }

    coordinator.cancelAll()

    assertNull(request.await())
  }

  @Test
  fun cancelAllDuringAwait_preventsFutureResultFromDeliveringStaleValue() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val enteredGet = CountDownLatch(1)
    val allowReturn = CountDownLatch(1)
    val completion = CompletableFuture<String?>()
    val backing = executor.submit {
      enteredGet.countDown()
      allowReturn.await(1, TimeUnit.SECONDS)
      completion.complete("stale-frame")
    }
    val work = PreviewWork(completion) {
        allowReturn.countDown()
        backing.cancel(true)
    }
    val request = coordinator.acquire("video-a") { work }
    val result = executor.submit<String?> { request.await() }

    assertTrue(enteredGet.await(1, TimeUnit.SECONDS))
    coordinator.cancelAll()

    assertNull(result.get(1, TimeUnit.SECONDS))
  }

  @Test
  fun awaitAfterCancel_returnsNull() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val request = coordinator.acquire("video-a") {
      submitWork { "frame-a" }
    }

    request.cancel()

    assertNull(request.await())
  }

  private fun <T> submitWork(block: () -> T?): PreviewWork<T> {
    val completion = CompletableFuture<T?>()
    val backing = executor.submit {
      try {
        completion.complete(block())
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        completion.complete(null)
      } catch (_: Exception) {
        completion.complete(null)
      }
    }
    return PreviewWork(completion) {
      backing.cancel(true)
    }
  }
}
