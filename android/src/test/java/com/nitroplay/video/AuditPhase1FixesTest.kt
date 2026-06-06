package com.nitroplay.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Behavior tests for Phase 1 audit fixes whose production code lives in
 * JNI-bound hybrids that cannot be instantiated under plain JUnit. Each test
 * mirrors the exact decision logic of the referenced production code (same
 * convention as NitroPlayerManagerBehaviorTest / BufferingStateLogicTest).
 */
class AuditPhase1FixesTest {

  // -- NP-LOGIC-06: onLoad / first-frame fire once per source generation --
  // Mirrors HybridNitroPlayerListeners.kt STATE_READY and iOS
  // HybridNitroPlayerEvents.swift .readyToPlay: emit only on the first ready of
  // a generation; beginSourceGeneration() resets hasLoadedCurrentSource.

  private class GenerationModel {
    var hasLoadedCurrentSource = false
    var onLoadCount = 0

    fun beginSourceGeneration() {
      hasLoadedCurrentSource = false
    }

    fun onReady() {
      val isFirstLoadForGeneration = !hasLoadedCurrentSource
      hasLoadedCurrentSource = true
      if (isFirstLoadForGeneration) {
        onLoadCount += 1
      }
    }
  }

  @Test
  fun onLoad_emittedOncePerGeneration_despiteRepeatedReady() {
    val model = GenerationModel()
    model.beginSourceGeneration()

    model.onReady() // first ready -> emit
    model.onReady() // rebuffer/seek READY -> no re-emit
    model.onReady()

    assertEquals(1, model.onLoadCount)
  }

  @Test
  fun onLoad_reEmittedAfterNewSourceGeneration() {
    val model = GenerationModel()
    model.beginSourceGeneration()
    model.onReady()

    model.beginSourceGeneration() // replaceSourceAsync starts a new generation
    model.onReady()

    assertEquals(2, model.onLoadCount)
  }

  // -- NP-THREAD-10: HlsProxyServer skips cache writes after stop()/close --
  // Mirrors HlsProxyServer.putToCache(): no-op once closed=true.

  private class ProxyCacheModel {
    @Volatile var closed = false
    val writes = mutableListOf<String>()

    fun putToCache(key: String) {
      if (closed) return
      writes.add(key)
    }

    fun stop() {
      closed = true
    }
  }

  @Test
  fun proxyServer_putToCache_noOpAfterClose() {
    val model = ProxyCacheModel()
    model.putToCache("seg1")
    model.stop()
    model.putToCache("seg2") // in-flight prefetch/segment task after close

    assertEquals(listOf("seg1"), model.writes)
  }

  // -- NP-LOGIC-04: wasAutoPaused survives a failed resume --
  // Mirrors HybridNitroPlayer.play() (clears the flag only after a successful
  // player.play()) + NitroPlayerManager.onAppEnterForeground() (no pre-clear).

  private class AutoPauseModel(var wasAutoPaused: Boolean) {
    var playCount = 0
    var failNext = false

    fun play() {
      if (failNext) {
        failNext = false
        throw RuntimeException("initializePlayer failed")
      }
      playCount += 1
      wasAutoPaused = false // cleared only on a successful start
    }

    fun onForeground() {
      if (wasAutoPaused) {
        play()
      }
    }
  }

  @Test
  fun wasAutoPaused_survivesFailedResume_thenRetries() {
    val model = AutoPauseModel(wasAutoPaused = true).apply { failNext = true }

    try {
      model.onForeground() // play() throws -> flag must stay set
    } catch (_: Exception) {
      // initializePlayer failure propagates out of the posted runnable
    }
    assertEquals(0, model.playCount)
    assertTrue("Flag must survive a failed resume so the next foreground retries", model.wasAutoPaused)

    model.onForeground() // retry succeeds
    assertEquals(1, model.playCount)
    assertFalse(model.wasAutoPaused)
  }

  // -- NP-THREAD-08: runOnMainThreadSync waits with a bounded timeout --
  // Mirrors Threading.runOnMainThreadSync: a task that never runs must time out
  // (FutureTask.get(timeout)) instead of blocking the calling thread forever.

  @Test
  fun futureTaskGet_withTimeout_throwsInsteadOfHanging() {
    val neverRuns = FutureTask { "value" } // never posted/run
    var timedOut = false
    try {
      neverRuns.get(200, TimeUnit.MILLISECONDS)
    } catch (_: TimeoutException) {
      timedOut = true
    }
    assertTrue("Bounded get must time out, not hang", timedOut)
  }

  // -- NP-THREAD-06: source retentionState/memorySize read under stateLock --
  // Mirrors HybridNitroPlayerSource.kt: the synchronized getter must be
  // reentrant with writers (which mutate the field while already holding
  // stateLock) and must return a consistent value under concurrent access.

  private class StateLockedSource {
    private val stateLock = Any()
    private var retention = "COLD"

    // getter mirrors `get() = synchronized(stateLock) { field }`
    fun retention(): String = synchronized(stateLock) { retention }

    // writer mirrors createOrGetMediaSource(): mutates under the same lock and
    // nests another synchronized read on the same monitor (reentrant).
    fun promoteToHot(): String = synchronized(stateLock) {
      retention = "HOT"
      readUnderLock()
    }

    private fun readUnderLock(): String = synchronized(stateLock) { retention }
  }

  @Test
  fun stateLock_reentrantWriterReadsLatestValue_noDeadlock() {
    val source = StateLockedSource()
    assertEquals("COLD", source.retention())

    val afterPromote = source.promoteToHot() // nested reentrant lock, no deadlock
    assertEquals("HOT", afterPromote)
    assertEquals("HOT", source.retention())
  }

  @Test
  fun stateLock_concurrentReadsAndWrites_neverTear() {
    val source = StateLockedSource()
    val errors = java.util.concurrent.atomic.AtomicInteger(0)

    val threads = (1..8).map {
      Thread {
        repeat(200) {
          source.promoteToHot()
          val value = source.retention()
          if (value != "COLD" && value != "HOT") {
            errors.incrementAndGet()
          }
        }
      }
    }
    threads.forEach { it.start() }
    threads.forEach { it.join() }

    assertEquals(0, errors.get())
  }
}
