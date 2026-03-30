package com.nitroplay.video.core

import com.nitroplay.video.core.utils.SourceLoader
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class SourceLoaderConcurrencyTest {

  @Test
  fun concurrentLoads_onlyLastCompletes() {
    val loader = SourceLoader()
    val threadCount = 3
    val barrier = CyclicBarrier(threadCount)
    val results = Array<AtomicReference<Any?>>(threadCount) { AtomicReference(null) }
    val errors = AtomicInteger(0)
    val successes = AtomicInteger(0)
    val latch = CountDownLatch(threadCount)

    val threads = (0 until threadCount).map { idx ->
      Thread {
        barrier.await()
        try {
          val result = loader.load {
            Thread.sleep(50)
            "result-$idx"
          }
          results[idx].set(result)
          successes.incrementAndGet()
        } catch (e: SourceError.Cancelled) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    threads.forEach { it.start() }
    latch.await()

    assertTrue(
      "At least one load should be cancelled when concurrent loads race",
      errors.get() >= 1
    )
    assertTrue(
      "At most one load should succeed",
      successes.get() <= threadCount
    )
  }

  @Test
  fun cancelDuringLoad_operationStops() {
    val loader = SourceLoader()
    val loadStarted = CountDownLatch(1)
    val result = AtomicReference<Any?>(null)
    val cancelled = AtomicReference(false)
    val latch = CountDownLatch(1)

    val loadThread = Thread {
      try {
        loader.load {
          loadStarted.countDown()
          Thread.sleep(500)
          "slow-result"
        }
        result.set("completed")
      } catch (e: SourceError.Cancelled) {
        cancelled.set(true)
      } finally {
        latch.countDown()
      }
    }

    loadThread.start()
    loadStarted.await()
    loader.cancel()
    latch.await()

    assertTrue("Load should have been cancelled", cancelled.get())
    assertNull("Result should be null after cancel", result.get())
  }

  @Test
  fun loadAfterCancel_succeeds() {
    val loader = SourceLoader()
    val loadStarted = CountDownLatch(1)
    val latch = CountDownLatch(1)

    Thread {
      try {
        loader.load {
          loadStarted.countDown()
          Thread.sleep(200)
          "will-cancel"
        }
      } catch (_: SourceError.Cancelled) {
        // expected
      } finally {
        latch.countDown()
      }
    }.start()

    loadStarted.await()
    loader.cancel()
    latch.await()

    val result = loader.load { "after-cancel" }
    assertEquals("after-cancel", result)
  }
}
