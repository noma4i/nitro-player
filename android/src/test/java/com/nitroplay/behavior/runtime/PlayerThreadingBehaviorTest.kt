package com.nitroplay.video.behavior.runtime

import android.os.Looper
import com.margelo.nitro.video.PlaybackCachedState
import com.nitroplay.video.support.Threading
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowLooper

@RunWith(RobolectricTestRunner::class)
@LooperMode(LooperMode.Mode.PAUSED)
class PlayerThreadingBehaviorTest {
  @Test
  fun runOnMainThreadSync_fromBackground_returnsWhenMainLooperRunsAction() {
    val result = AtomicReference<String?>()
    val error = AtomicReference<Throwable?>()
    val finished = CountDownLatch(1)

    Thread {
      try {
        result.set(Threading.runOnMainThreadSync(Callable { "main result" }))
      } catch (throwable: Throwable) {
        error.set(throwable)
      } finally {
        finished.countDown()
      }
    }.start()

    drainMainLooperUntil(finished, timeoutMs = 1_000)

    assertTrue(finished.await(1, TimeUnit.SECONDS))
    assertEquals("main result", result.get())
    assertEquals(null, error.get())
  }

  @Test
  fun runOnMainThreadSync_fromBackground_timesOutWhenMainLooperIsBlocked() {
    val error = AtomicReference<Throwable?>()
    val finished = CountDownLatch(1)

    Thread {
      try {
        Threading.runOnMainThreadSync(Callable { "should not run" })
      } catch (throwable: Throwable) {
        error.set(throwable)
      } finally {
        finished.countDown()
      }
    }.start()

    assertTrue(finished.await(6, TimeUnit.SECONDS))
    assertTrue(error.get() is IllegalStateException)
    assertTrue(error.get()?.message?.contains("main thread blocked") == true)
  }

  @Test
  fun runOnMainThreadSync_fromMainThread_runsInline() {
    val result = Threading.runOnMainThreadSync(Callable {
      assertEquals(Looper.getMainLooper(), Looper.myLooper())
      "inline"
    })

    assertEquals("inline", result)
  }

  @Test
  fun cachedPlaybackGetters_fromBackgroundDoNotWaitForPausedMainLooper() {
    val cachedState = PlaybackCachedState()
    Threading.runOnMainThread {
      cachedState.loop = true
      cachedState.muted = true
      cachedState.rate = 1.25
      cachedState.isBuffering = true
      cachedState.isVisualReady = true
    }
    ShadowLooper.idleMainLooper()

    val result = AtomicReference<List<Any>?>()
    val error = AtomicReference<Throwable?>()
    val finished = CountDownLatch(1)

    Thread {
      try {
        result.set(listOf(
          cachedState.loop,
          cachedState.muted,
          cachedState.rate,
          cachedState.isBuffering,
          cachedState.isVisualReady
        ))
      } catch (throwable: Throwable) {
        error.set(throwable)
      } finally {
        finished.countDown()
      }
    }.start()

    assertTrue("Cached getters must return without a main-looper drain", finished.await(1, TimeUnit.SECONDS))
    assertEquals(null, error.get())
    assertEquals(listOf(true, true, 1.25, true, true), result.get())
  }

  private fun drainMainLooperUntil(latch: CountDownLatch, timeoutMs: Long) {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (latch.count > 0 && System.nanoTime() < deadline) {
      ShadowLooper.idleMainLooper()
      Thread.sleep(10)
    }
  }
}
