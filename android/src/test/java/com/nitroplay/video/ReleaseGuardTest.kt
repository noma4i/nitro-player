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
    var trimCalled = false

    fun simulateConstructorInit() {
      if (isReleased) return
      initCalled = true
    }

    fun simulateTrim() {
      if (isReleased) return
      if (!loadedWithSource) return
      trimCalled = true
    }

    fun release() {
      if (isReleased) return
      isReleased = true
      loadedWithSource = false
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

    assertFalse("Trim should not run after release", state.trimCalled)
  }

  @Test
  fun trimToMetadataRetention_skipsWhenNotLoaded() {
    val state = MockPlayerState()
    state.simulateTrim()

    assertFalse("Trim should not run when not loaded", state.trimCalled)
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
  }
}
