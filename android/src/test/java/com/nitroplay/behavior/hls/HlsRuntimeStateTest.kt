package com.nitroplay.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HlsRuntimeStateTest {
  @Test
  fun startResolvesPortAndMarksAutoStarted() {
    val state = HlsRuntimeState()

    val port = state.start(9123)
    val snapshot = state.snapshot()

    assertEquals(9123, port)
    assertEquals(9123, snapshot.port)
    assertTrue(snapshot.didAutoStart)
    assertFalse(snapshot.isExplicitlyStopped)
  }

  @Test
  fun implicitStartIsIdempotentAndBlockedAfterExplicitStop() {
    val state = HlsRuntimeState()

    assertEquals(0, state.shouldStartForImplicitUse())
    assertNull(state.shouldStartForImplicitUse())

    state.stop()

    assertNull(state.shouldStartForImplicitUse())
    assertTrue(state.snapshot().isExplicitlyStopped)
  }

  @Test
  fun restartForPlaybackRecoveryPreservesDesiredPort() {
    val state = HlsRuntimeState()
    state.start(9456)

    assertEquals(9456, state.shouldRestartForPlaybackRecovery())

    state.stop()

    assertNull(state.shouldRestartForPlaybackRecovery())
  }
}
