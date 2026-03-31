package com.nitroplay.hls

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HlsProxyRuntimeBehaviorTest {

  @After
  fun tearDown() {
    HlsProxyRuntime.resetStateForTests()
  }

  @Test
  fun register_doesNotAutoStartRuntime() {
    HlsProxyRuntime.registerForTests()

    val state = HlsProxyRuntime.snapshotStateForTests()
    assertTrue(state.isRegistered)
    assertFalse(state.didAutoStart)
    assertFalse(state.isExplicitlyStopped)
  }

  @Test
  fun getProxiedUrl_marksRuntimeAutoStarted() {
    val originalUrl = "https://cdn.example.com/live.m3u8"

    val result = HlsProxyRuntime.getProxiedUrl(originalUrl, emptyMap())

    assertEquals(originalUrl, result)
    val state = HlsProxyRuntime.snapshotStateForTests()
    assertTrue(state.isRegistered)
    assertTrue(state.didAutoStart)
    assertFalse(state.isExplicitlyStopped)
  }

  @Test
  fun resolvePlaybackRoute_withoutServer_fallsBackToOriginalUrl() {
    val originalUrl = "https://cdn.example.com/live.m3u8"

    val result = HlsProxyRuntime.resolvePlaybackRoute(originalUrl, emptyMap())

    assertEquals(originalUrl, result.url)
    assertFalse(result.isProxying)
  }

  @Test
  fun stop_preventsImplicitRestart() {
    val url = "https://cdn.example.com/live.m3u8"

    HlsProxyRuntime.getProxiedUrl(url, emptyMap())
    HlsProxyRuntime.stop()

    val result = HlsProxyRuntime.getProxiedUrl(url, emptyMap())

    assertEquals(url, result)
    val state = HlsProxyRuntime.snapshotStateForTests()
    assertFalse(state.didAutoStart)
    assertTrue(state.isExplicitlyStopped)
  }
}
