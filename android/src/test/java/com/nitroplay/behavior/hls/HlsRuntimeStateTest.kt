package com.nitroplay.video.behavior.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.nitroplay.video.streaming.HlsRuntimeState

class HlsRuntimeStateTest {
  @Test
  fun startResolvesPortAndClearsExplicitStop() {
    val state = HlsRuntimeState()

    val port = state.start(9123)
    val snapshot = state.snapshot()

    assertEquals(9123, port)
    assertEquals(9123, snapshot.port)
    assertFalse(snapshot.didAutoStart)
    assertFalse(snapshot.isExplicitlyStopped)
  }

  @Test
  fun implicitStartIsCommittedOnlyAfterRuntimeStarts() {
    val state = HlsRuntimeState()

    assertEquals(0, state.portForImplicitStart())
    assertEquals(0, state.portForImplicitStart())

    state.markAutoStarted()

    assertNull(state.portForImplicitStart())
  }

  @Test
  fun implicitStartIsBlockedAfterExplicitStop() {
    val state = HlsRuntimeState()

    state.stop()

    assertNull(state.portForImplicitStart())
    assertTrue(state.snapshot().isExplicitlyStopped)
  }

  @Test
  fun hostLifecycleSuspendDoesNotBecomeExplicitStop() {
    val state = HlsRuntimeState()
    state.markAutoStarted()

    state.suspendForHostLifecycle()

    val snapshot = state.snapshot()
    assertFalse(snapshot.didAutoStart)
    assertFalse(snapshot.isExplicitlyStopped)
    assertEquals(0, state.portForImplicitStart())
  }

  @Test
  fun restartForPlaybackRecoveryPreservesDesiredPort() {
    val state = HlsRuntimeState()
    state.start(9456)

    assertEquals(9456, state.portForPlaybackRecoveryRestart())
    assertFalse(state.snapshot().didAutoStart)

    state.markAutoStarted()
    assertTrue(state.snapshot().didAutoStart)

    state.stop()

    assertNull(state.portForPlaybackRecoveryRestart())
  }
}
