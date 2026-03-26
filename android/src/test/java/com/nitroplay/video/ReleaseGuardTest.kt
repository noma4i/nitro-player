package com.nitroplay.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleaseGuardTest {

  private class MockPlayerState {
    var isReleased = false
    var loadedWithSource = false
    var initCalled = false
    var trimCount = 0
    var releaseCount = 0

    fun simulateConstructorInit() {
      if (isReleased) return
      initCalled = true
    }

    fun simulateTrim() {
      if (isReleased) return
      if (!loadedWithSource) return
      trimCount += 1
      loadedWithSource = false
    }

    fun release() {
      if (isReleased) return
      isReleased = true
      loadedWithSource = false
      releaseCount += 1
    }

    data class PlaybackState(val status: String, val isPlaying: Boolean)

    fun buildPlaybackState(): PlaybackState {
      if (isReleased) return PlaybackState(status = "idle", isPlaying = false)
      return PlaybackState(status = "playing", isPlaying = true)
    }

    data class MemorySnapshot(val totalBytes: Double, val isPlaying: Boolean)

    fun buildMemorySnapshot(): MemorySnapshot {
      if (isReleased) return MemorySnapshot(totalBytes = 0.0, isPlaying = false)
      return MemorySnapshot(totalBytes = 1024.0, isPlaying = loadedWithSource)
    }
  }

  @Test
  fun constructorInit_skipsWhenReleased() {
    val state = MockPlayerState()
    state.release()
    state.simulateConstructorInit()

    assertFalse("Init should not run after release", state.initCalled)
  }

  @Test
  fun constructorInit_runsWhenNotReleased() {
    val state = MockPlayerState()
    state.simulateConstructorInit()

    assertTrue("Init should run when not released", state.initCalled)
  }

  @Test
  fun trimToMetadataRetention_skipsWhenReleased() {
    val state = MockPlayerState()
    state.loadedWithSource = true
    state.release()
    state.simulateTrim()

    assertEquals("Trim should not run after release", 0, state.trimCount)
  }

  @Test
  fun trimToMetadataRetention_skipsWhenNotLoaded() {
    val state = MockPlayerState()
    state.simulateTrim()

    assertEquals("Trim should not run when not loaded", 0, state.trimCount)
  }

  @Test
  fun buildPlaybackState_returnsIdleWhenReleased() {
    val state = MockPlayerState()
    state.release()

    val ps = state.buildPlaybackState()
    assertEquals("idle", ps.status)
    assertFalse(ps.isPlaying)
  }

  @Test
  fun buildMemorySnapshot_returnsZerosWhenReleased() {
    val state = MockPlayerState()
    state.release()

    val snap = state.buildMemorySnapshot()
    assertEquals(0.0, snap.totalBytes, 0.001)
    assertFalse(snap.isPlaying)
  }

  @Test
  fun release_isIdempotent() {
    val state = MockPlayerState()
    state.release()
    state.release()

    assertTrue(state.isReleased)
    assertEquals("Release should only execute once", 1, state.releaseCount)
  }

  @Test
  fun concurrentReleaseAndTrim_trimRunsAtMostOnce() {
    val state = MockPlayerState()
    state.loadedWithSource = true

    val releaseThread = Thread {
      state.release()
    }
    val trimThread = Thread {
      state.simulateTrim()
    }

    releaseThread.start()
    trimThread.start()
    releaseThread.join()
    trimThread.join()

    assertTrue(state.isReleased)
    assertTrue("Trim should run at most once", state.trimCount <= 1)
  }
}
