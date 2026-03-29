package com.nitroplay.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HlsProxyRuntimeStateTest {
  @Test
  fun register_enablesRunningForProxyUse() {
    val state = HlsProxyRuntimeState()

    val port = state.register()

    assertEquals(18181, port)
    assertTrue(state.shouldEnsureRunningForUse())
  }

  @Test
  fun start_updatesPortAndClearsExplicitStop() {
    val state = HlsProxyRuntimeState()
    state.register()
    state.stop()

    val port = state.start(19191)

    assertEquals(19191, port)
    assertTrue(state.shouldEnsureRunningForUse())
  }

  @Test
  fun stop_disablesProxyUseUntilExplicitStart() {
    val state = HlsProxyRuntimeState()
    state.register()

    state.stop()

    assertFalse(state.shouldEnsureRunningForUse())
    assertFalse(state.onHostResume())
  }

  @Test
  fun hostDestroy_disablesUseUntilRegistrationRunsAgain() {
    val state = HlsProxyRuntimeState()
    state.register()

    state.onHostDestroy()

    assertFalse(state.shouldEnsureRunningForUse())
  }

  @Test
  fun requestPath_doesNotBootstrapUnregisteredRuntime() {
    val state = HlsProxyRuntimeState()

    assertFalse(state.shouldEnsureRunningForUse())
    assertFalse(state.onHostResume())
  }
}
