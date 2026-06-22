package com.nitroplay.video.behavior.hls

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import com.nitroplay.video.streaming.HlsProxyServer
import com.nitroplay.video.streaming.NanoHttpdConfig

/**
 * #3 (proxy ephemeral port): a fixed proxy port collides when several proxies
 * share the loopback (e.g. multiple emulators / apps on one host), which makes
 * the bind fail and silently fall back to direct playback. Binding port 0 lets
 * the OS assign an ephemeral port; listeningPort() reports the actual one used
 * for proxied URLs. Parity counterpart: GCDWebServerOption_Port 0 on iOS.
 */
@RunWith(AndroidJUnit4::class)
class HlsProxyPortTest {

  private fun newStartedServer(): HlsProxyServer {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val server = HlsProxyServer(0, context)
    server.start(NanoHttpdConfig.TIMEOUT_MS, false)
    return server
  }

  @Test
  fun bindsEphemeralPortWhenRequestingZero() {
    val server = newStartedServer()
    try {
      assertTrue("expected OS-assigned port > 0", server.listeningPort() > 0)
    } finally {
      server.stop()
    }
  }

  @Test
  fun twoInstancesDoNotCollide() {
    val first = newStartedServer()
    val second = newStartedServer()
    try {
      assertTrue(first.listeningPort() > 0)
      assertTrue(second.listeningPort() > 0)
      assertNotEquals(first.listeningPort(), second.listeningPort())
    } finally {
      first.stop()
      second.stop()
    }
  }
}
