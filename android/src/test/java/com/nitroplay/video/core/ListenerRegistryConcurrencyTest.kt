package com.nitroplay.video.core

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

class ListenerRegistryConcurrencyTest {

  @Test
  fun concurrentAddAndEmit_nocrash() {
    val registry = ListenerRegistry()
    val threadCount = 50
    val iterations = 100
    val latch = CountDownLatch(threadCount * 2)
    val emitCount = AtomicInteger(0)
    val errors = AtomicInteger(0)

    val adders = (0 until threadCount).map {
      Thread {
        try {
          repeat(iterations) {
            registry.add("event", { emitCount.incrementAndGet() } as () -> Unit)
          }
        } catch (e: Exception) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    val emitters = (0 until threadCount).map {
      Thread {
        try {
          repeat(iterations) {
            registry.emit<() -> Unit>("event") { it() }
          }
        } catch (e: Exception) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    (adders + emitters).forEach { it.start() }
    latch.await()

    assertEquals("No errors should occur during concurrent add/emit", 0, errors.get())
    assertTrue("Some emissions should have occurred", emitCount.get() > 0)
  }

  @Test
  fun removeWhileEmitting_nocrash() {
    val registry = ListenerRegistry()
    val listenerCount = 100
    val emitCount = AtomicInteger(0)
    val errors = AtomicInteger(0)

    val subscriptions = (0 until listenerCount).map {
      registry.add("event", { emitCount.incrementAndGet() } as () -> Unit)
    }

    val emitThreads = 10
    val removeThreads = 10
    val latch = CountDownLatch(emitThreads + removeThreads)

    val emitters = (0 until emitThreads).map {
      Thread {
        try {
          repeat(50) {
            registry.emit<() -> Unit>("event") { it() }
          }
        } catch (e: Exception) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    val removers = (0 until removeThreads).map { idx ->
      Thread {
        try {
          val start = idx * (listenerCount / removeThreads)
          val end = minOf(start + (listenerCount / removeThreads), listenerCount)
          for (i in start until end) {
            subscriptions[i].remove()
          }
        } catch (e: Exception) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    (emitters + removers).forEach { it.start() }
    latch.await()

    assertEquals("No errors should occur during concurrent remove/emit", 0, errors.get())
  }

  @Test
  fun concurrentClearAndEmit_nocrash() {
    val registry = ListenerRegistry()
    val errors = AtomicInteger(0)
    val emitCount = AtomicInteger(0)
    val threadCount = 20
    val latch = CountDownLatch(threadCount * 2)

    repeat(200) {
      registry.add("event", { emitCount.incrementAndGet() } as () -> Unit)
    }

    val emitters = (0 until threadCount).map {
      Thread {
        try {
          repeat(50) {
            registry.emit<() -> Unit>("event") { it() }
          }
        } catch (e: Exception) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    val clearers = (0 until threadCount).map {
      Thread {
        try {
          repeat(10) {
            registry.clearAll()
            repeat(5) {
              registry.add("event", { emitCount.incrementAndGet() } as () -> Unit)
            }
          }
        } catch (e: Exception) {
          errors.incrementAndGet()
        } finally {
          latch.countDown()
        }
      }
    }

    (emitters + clearers).forEach { it.start() }
    latch.await()

    assertEquals("No errors should occur during concurrent clear/emit", 0, errors.get())
  }
}
