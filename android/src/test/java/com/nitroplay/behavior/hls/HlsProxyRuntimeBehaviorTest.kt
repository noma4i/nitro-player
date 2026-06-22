package com.nitroplay.hls

import android.content.Context
import androidx.test.core.app.ApplicationProvider
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
  fun getProxiedUrl_withoutReactContextKeepsImplicitStartRetryable() {
    val originalUrl = "https://cdn.example.com/live.m3u8"

    val result = HlsProxyRuntime.getProxiedUrl(originalUrl, emptyMap())

    assertEquals(originalUrl, result)
    val state = HlsProxyRuntime.snapshotStateForTests()
    assertTrue(state.isRegistered)
    assertFalse(state.didAutoStart)
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
  fun clearCache_withoutActiveServerClearsPersistedDiskCache() {
    val appContext = ApplicationProvider.getApplicationContext<Context>()
    val seedStore = HlsCacheStore(appContext)
    seedStore.clearAll()
    seedStore.put(
      HlsIdentity.requestKey("https://cdn.example.com/legacy.ts", null),
      ByteArray(64),
      HlsIdentity.requestKey("https://cdn.example.com/live.m3u8", null)
    )
    seedStore.close()
    HlsProxyRuntime.registerForTests(appContext)

    HlsProxyRuntime.clearCache()

    val reloaded = HlsCacheStore(appContext)
    val stats = reloaded.getCacheStats()
    assertEquals(0L, stats["totalSize"])
    assertEquals(0, stats["fileCount"])
    reloaded.close()
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

  @Test
  fun hostDestroy_doesNotBlockFutureImplicitRestart() {
    val url = "https://cdn.example.com/live.m3u8"

    HlsProxyRuntime.getProxiedUrl(url, emptyMap())
    HlsProxyRuntime.onHostDestroy()

    val stateAfterDestroy = HlsProxyRuntime.snapshotStateForTests()
    assertFalse(stateAfterDestroy.didAutoStart)
    assertFalse(stateAfterDestroy.isExplicitlyStopped)

    HlsProxyRuntime.getProxiedUrl(url, emptyMap())

    val stateAfterImplicitUse = HlsProxyRuntime.snapshotStateForTests()
    assertFalse(
      "A failed server start without a React context must leave implicit start retryable",
      stateAfterImplicitUse.didAutoStart
    )
    assertFalse(stateAfterImplicitUse.isExplicitlyStopped)
  }
}
