package com.nitroplay.hls

import java.util.concurrent.Callable
import java.util.concurrent.Future
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PreviewRequestCoordinatorTest {
  private val executor = Executors.newCachedThreadPool()

  private class CountingFuture<T>(
    private val value: T?
  ) : Future<T?> {
    val cancelCount = AtomicInteger(0)
    @Volatile private var cancelled = false

    override fun cancel(mayInterruptIfRunning: Boolean): Boolean {
      if (!cancelled) {
        cancelled = true
        cancelCount.incrementAndGet()
      }
      return true
    }

    override fun isCancelled(): Boolean = cancelled
    override fun isDone(): Boolean = true
    override fun get(): T? = value
    override fun get(timeout: Long, unit: TimeUnit): T? = value
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
      executor.submit(Callable {
        executions.incrementAndGet()
        "frame-a"
      })
    }
    val second = coordinator.acquire("video-a") {
      executor.submit(Callable {
        executions.incrementAndGet()
        "wrong-frame"
      })
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
      executor.submit(Callable {
        executions.incrementAndGet()
        "frame-a"
      })
    }
    val second = coordinator.acquire("video-b") {
      executor.submit(Callable {
        executions.incrementAndGet()
        "frame-b"
      })
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
      executor.submit(Callable {
        TimeUnit.MILLISECONDS.sleep(150)
        "frame-a"
      })
    }
    val second = coordinator.acquire("video-a") {
      executor.submit(Callable { "wrong-frame" })
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
      executor.submit(Callable {
        TimeUnit.SECONDS.sleep(5)
        "late-frame"
      })
    }

    request.cancel()

    assertTrue(request.isCancelled)
    assertEquals(0, coordinator.inflightCount)

    val next = coordinator.acquire("video-a") {
      executor.submit(Callable { "new-frame" })
    }
    assertEquals("new-frame", next.await())
    next.cancel()
  }

  @Test
  fun cancel_isIdempotentForTheSameWaiter() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val future = CountingFuture("frame-a")
    val request = coordinator.acquire("video-a") { future }

    request.cancel()
    request.cancel()

    assertTrue(request.isCancelled)
    assertEquals(0, coordinator.inflightCount)
    assertEquals(1, future.cancelCount.get())
  }

  @Test
  fun cancelAll_cancelsEveryInflightJobAndAwaitDoesNotBlock() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val first = coordinator.acquire("video-a") {
      executor.submit(Callable {
        TimeUnit.SECONDS.sleep(5)
        "late-a"
      })
    }
    val second = coordinator.acquire("video-b") {
      executor.submit(Callable {
        TimeUnit.SECONDS.sleep(5)
        "late-b"
      })
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
  fun awaitAfterCancel_returnsNull() {
    val coordinator = PreviewRequestCoordinator<String, String>()
    val request = coordinator.acquire("video-a") {
      executor.submit(Callable { "frame-a" })
    }

    request.cancel()

    assertNull(request.await())
  }
}
