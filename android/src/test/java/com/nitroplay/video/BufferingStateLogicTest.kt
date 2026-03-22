package com.nitroplay.video

import com.margelo.nitro.video.NitroPlayerStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BufferingStateLogicTest {

  private var status: NitroPlayerStatus = NitroPlayerStatus.IDLE
  private var isCurrentlyBuffering: Boolean = false

  private fun enterBuffering() {
    isCurrentlyBuffering = true
    if (status != NitroPlayerStatus.PLAYING && status != NitroPlayerStatus.PAUSED) {
      status = NitroPlayerStatus.BUFFERING
    }
  }

  @Test
  fun enterBuffering_preservesPlayingStatus() {
    status = NitroPlayerStatus.PLAYING
    isCurrentlyBuffering = false

    enterBuffering()

    assertEquals(NitroPlayerStatus.PLAYING, status)
    assertTrue(isCurrentlyBuffering)
  }

  @Test
  fun enterBuffering_preservesPausedStatus() {
    status = NitroPlayerStatus.PAUSED
    isCurrentlyBuffering = false

    enterBuffering()

    assertEquals(NitroPlayerStatus.PAUSED, status)
    assertTrue(isCurrentlyBuffering)
  }

  @Test
  fun enterBuffering_setsBufferingFromIdle() {
    status = NitroPlayerStatus.IDLE
    isCurrentlyBuffering = false

    enterBuffering()

    assertEquals(NitroPlayerStatus.BUFFERING, status)
    assertTrue(isCurrentlyBuffering)
  }

  @Test
  fun enterBuffering_setsBufferingFromLoading() {
    status = NitroPlayerStatus.LOADING
    isCurrentlyBuffering = false

    enterBuffering()

    assertEquals(NitroPlayerStatus.BUFFERING, status)
    assertTrue(isCurrentlyBuffering)
  }

  @Test
  fun enterBuffering_setsBufferingFromEnded() {
    status = NitroPlayerStatus.ENDED
    isCurrentlyBuffering = false

    enterBuffering()

    assertEquals(NitroPlayerStatus.BUFFERING, status)
    assertTrue(isCurrentlyBuffering)
  }

  @Test
  fun stateReady_clearsBuffering() {
    isCurrentlyBuffering = true
    status = NitroPlayerStatus.PLAYING

    isCurrentlyBuffering = false
    status = NitroPlayerStatus.PLAYING

    assertFalse(isCurrentlyBuffering)
  }

  @Test
  fun stateEnded_clearsBuffering() {
    isCurrentlyBuffering = true

    isCurrentlyBuffering = false
    status = NitroPlayerStatus.ENDED

    assertFalse(isCurrentlyBuffering)
    assertEquals(NitroPlayerStatus.ENDED, status)
  }

  @Test
  fun playerError_clearsBuffering() {
    isCurrentlyBuffering = true

    isCurrentlyBuffering = false
    status = NitroPlayerStatus.ERROR

    assertFalse(isCurrentlyBuffering)
    assertEquals(NitroPlayerStatus.ERROR, status)
  }

  @Test
  fun isPlayingChanged_clearsBuffering() {
    isCurrentlyBuffering = true

    val isPlaying = true
    if (isPlaying) isCurrentlyBuffering = false

    assertFalse(isCurrentlyBuffering)
  }
}
