package com.nitroplay.video.behavior.hls

import android.content.Context
import android.graphics.Bitmap
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowLooper
import com.nitroplay.video.preview.PreviewDecodeBackend
import com.nitroplay.video.preview.PreviewWork
import com.nitroplay.video.preview.VideoPreviewResult
import com.nitroplay.video.preview.VideoPreviewRuntime
import com.nitroplay.video.streaming.HlsIdentity
import com.nitroplay.video.streaming.cache.HlsCacheStore

@RunWith(RobolectricTestRunner::class)
@LooperMode(LooperMode.Mode.PAUSED)
class VideoPreviewRuntimeBehaviorTest {
  private val executor = Executors.newSingleThreadExecutor()

  @After
  fun tearDown() {
    VideoPreviewRuntime.resetStateForTests()
    executor.shutdownNow()
  }

  @Test
  fun clearCancelsInflightPreviewRequestsBeforeClearingStore() {
    val request = VideoPreviewRuntime.acquirePreviewRequestForTests("video-a") {
      submitPreviewWork {
        TimeUnit.SECONDS.sleep(5)
        VideoPreviewResult(uri = "stale-frame", fromCache = false)
      }
    }

    VideoPreviewRuntime.clear()

    val startedAt = System.nanoTime()
    assertNull(request.await())
    val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)
    assertTrue("clear() must cancel in-flight preview work instead of waiting for stale writes", elapsedMs < 500)
  }

  @Test
  fun hlsPreviewSkipsDirectRetrieverAndUsesSegmentPath() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val store = HlsCacheStore(context)
    val manifestUrl = "https://cdn.example.com/hls/live.m3u8"
    val segmentUrl = "https://cdn.example.com/hls/segment0.ts"
    val backend = CountingPreviewBackend(
      responses = mapOf(
        manifestUrl to mediaManifest("segment0.ts").toByteArray(),
        segmentUrl to ByteArray(64) { 8 }
      )
    )

    try {
      store.clearAll()
      VideoPreviewRuntime.setDecodeBackendForTests(backend)

      val result = VideoPreviewRuntime.generatePreviewForTests(store, "preview:hls", manifestUrl)

      assertNull(result)
      assertEquals(emptyList<String>(), backend.directDecodeUrls)
      assertEquals(listOf(manifestUrl, segmentUrl), backend.fetchUrls)
      assertEquals(1, backend.fileDecodeCount.get())
    } finally {
      store.clearAll()
      store.close()
    }
  }

  @Test
  fun progressivePreviewStillAttemptsDirectRetrieverOnly() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val store = HlsCacheStore(context)
    val progressiveUrl = "https://cdn.example.com/video.mp4"
    val backend = CountingPreviewBackend()

    try {
      store.clearAll()
      VideoPreviewRuntime.setDecodeBackendForTests(backend)

      val result = VideoPreviewRuntime.generatePreviewForTests(store, "preview:mp4", progressiveUrl)

      assertNull(result)
      assertEquals(listOf(progressiveUrl), backend.directDecodeUrls)
      assertEquals(emptyList<String>(), backend.fetchUrls)
      assertEquals(0, backend.fileDecodeCount.get())
    } finally {
      store.clearAll()
      store.close()
    }
  }

  @Test
  fun hlsPreviewReusesCachedFirstSegmentFromSharedStore() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val segmentStore = HlsCacheStore(context)
    val previewStore = HlsCacheStore(context)
    val manifestUrl = "https://cdn.example.com/hls/live.m3u8"
    val segmentUrl = "https://cdn.example.com/hls/segment0.ts"
    val streamKey = HlsIdentity.requestKey(manifestUrl, null)
    val segmentKey = HlsIdentity.requestKey(segmentUrl, null)
    val backend = CountingPreviewBackend(
      responses = mapOf(manifestUrl to mediaManifest("segment0.ts").toByteArray())
    )

    try {
      segmentStore.clearAll()
      segmentStore.put(segmentKey, ByteArray(64) { 9 }, streamKey)
      VideoPreviewRuntime.setDecodeBackendForTests(backend)

      val result = VideoPreviewRuntime.generatePreviewForTests(previewStore, "preview:cached-hls", manifestUrl)

      assertNull(result)
      assertEquals(listOf(manifestUrl), backend.fetchUrls)
      assertEquals(1, backend.fileDecodeCount.get())
    } finally {
      segmentStore.clearAll()
      segmentStore.close()
      previewStore.close()
    }
  }

  @Test
  fun dispatchFirstFrameAwaitDeliversCompletionOnMain() {
    val request = VideoPreviewRuntime.acquirePreviewRequestForTests("video-main") {
      VideoPreviewRuntime.completedPreviewWorkForTests(VideoPreviewResult(uri = "frame", fromCache = false))
    }
    val delivered = CountDownLatch(1)
    val callbackLooper = AtomicReference<Looper?>()

    val task = VideoPreviewRuntime.dispatchFirstFrameAwait(request) {
      callbackLooper.set(Looper.myLooper())
      delivered.countDown()
    }
    task.get(1, TimeUnit.SECONDS)
    ShadowLooper.idleMainLooper()

    assertTrue(delivered.await(1, TimeUnit.SECONDS))
    assertEquals(Looper.getMainLooper(), callbackLooper.get())
    assertTrue(request.isCancelled)
  }

  private fun submitPreviewWork(block: () -> VideoPreviewResult?): PreviewWork<VideoPreviewResult> {
    val completion = CompletableFuture<VideoPreviewResult?>()
    val backing = executor.submit {
      try {
        completion.complete(block())
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        completion.complete(null)
      } catch (_: Exception) {
        completion.complete(null)
      }
    }
    return PreviewWork(completion) {
      backing.cancel(true)
    }
  }

  private fun mediaManifest(segment: String): String {
    return """
      #EXTM3U
      #EXT-X-TARGETDURATION:4
      #EXTINF:4.0,
      $segment
    """.trimIndent()
  }

  private class CountingPreviewBackend(
    private val responses: Map<String, ByteArray> = emptyMap()
  ) : PreviewDecodeBackend {
    val directDecodeUrls = mutableListOf<String>()
    val fetchUrls = mutableListOf<String>()
    val fileDecodeCount = AtomicInteger(0)

    override fun decodeBitmapFromUrl(url: String, headers: Map<String, String>?): Bitmap? {
      directDecodeUrls.add(url)
      return null
    }

    override fun decodeBitmapFromFile(file: File): Bitmap? {
      fileDecodeCount.incrementAndGet()
      return null
    }

    override fun fetchBytes(url: String, headers: Map<String, String>?): ByteArray? {
      fetchUrls.add(url)
      return responses[url]
    }
  }
}
