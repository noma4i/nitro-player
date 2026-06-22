package com.nitroplay.video.behavior.hls

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import com.nitroplay.video.streaming.HlsProxyServer

@RunWith(RobolectricTestRunner::class)
class HlsProxyServerBehaviorTest {
  @Test
  fun prefetchAfterStopReportsErrorInsteadOfThrowing() {
    val appContext = ApplicationProvider.getApplicationContext<Context>()
    val server = HlsProxyServer(0, appContext)
    server.stop()
    val completionError = AtomicReference<Throwable?>()
    val thrown = try {
      server.prefetch(
        "https://cdn.example.com/live.m3u8",
        null,
        onComplete = { completionError.set(AssertionError("prefetch should not complete after stop")) },
        onError = { completionError.set(it) }
      )
      null
    } catch (error: Throwable) {
      error
    }

    assertNull(thrown)
    assertNotNull(completionError.get())
  }
}
