package com.nitroplay.video.behavior.hls

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import fi.iki.elonen.NanoHTTPD
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import com.nitroplay.video.streaming.HlsIdentity
import com.nitroplay.video.streaming.HlsProxyServer
import com.nitroplay.video.streaming.NanoHttpdConfig

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
        2,
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

  @Test
  fun segmentCacheMissStreamsBeforeUpstreamCompletesAndCommitsAfterFullStream() {
    val body = ByteArray(512) { index -> (index % 251).toByte() }
    val upstream = SlowSegmentServer(body).startServer()
    val proxy = startedProxy()
    val upstreamUrl = upstream.segmentUrl()
    val resourceKey = HlsIdentity.requestKey(upstreamUrl, null)
    val connection = openProxyConnection(proxy, upstreamUrl)

    try {
      val stream = connection.inputStream
      val firstByte = stream.read()

      assertEquals(body[0].toInt() and 0xff, firstByte)
      assertTrue(upstream.firstByteServed.await(1, TimeUnit.SECONDS))
      assertFalse(proxy.cacheStore.has(resourceKey))

      upstream.allowFinish.countDown()
      val received = byteArrayOf(firstByte.toByte()) + stream.readBytes()

      assertArrayEquals(body, received)
      assertTrue(proxy.cacheStore.has(resourceKey))
    } finally {
      connection.disconnect()
      upstream.allowFinish.countDown()
      upstream.stop()
      proxy.stop()
    }
  }

  @Test
  fun abortedSegmentStreamDoesNotCommitPartialCacheEntry() {
    val body = ByteArray(512) { index -> (index % 241).toByte() }
    val upstream = SlowSegmentServer(body).startServer()
    val proxy = startedProxy()
    val upstreamUrl = upstream.segmentUrl()
    val resourceKey = HlsIdentity.requestKey(upstreamUrl, null)
    val connection = openProxyConnection(proxy, upstreamUrl)

    try {
      val stream = connection.inputStream
      assertEquals(body[0].toInt() and 0xff, stream.read())
      assertTrue(upstream.firstByteServed.await(1, TimeUnit.SECONDS))

      stream.close()
      connection.disconnect()
      upstream.allowFinish.countDown()

      assertTrue(upstream.closed.await(2, TimeUnit.SECONDS))
      assertFalse(proxy.cacheStore.has(resourceKey))
    } finally {
      connection.disconnect()
      upstream.allowFinish.countDown()
      upstream.stop()
      proxy.stop()
    }
  }

  @Test
  fun concurrentSameSegmentRequestWaitsForFirstCommitThenServesCache() {
    val body = ByteArray(768) { index -> (index % 239).toByte() }
    val upstream = SlowSegmentServer(body).startServer()
    val proxy = startedProxy()
    val upstreamUrl = upstream.segmentUrl()
    val firstConnection = openProxyConnection(proxy, upstreamUrl)
    val secondExecutor = Executors.newSingleThreadExecutor()

    try {
      val firstStream = firstConnection.inputStream
      val firstByte = firstStream.read()
      assertEquals(body[0].toInt() and 0xff, firstByte)
      assertTrue(upstream.firstByteServed.await(1, TimeUnit.SECONDS))

      val second = secondExecutor.submit<ByteArray> {
        val connection = openProxyConnection(proxy, upstreamUrl)
        try {
          connection.inputStream.use { it.readBytes() }
        } finally {
          connection.disconnect()
        }
      }
      Thread.sleep(100)
      assertEquals(1, upstream.requestCount.get())

      upstream.allowFinish.countDown()
      val firstReceived = byteArrayOf(firstByte.toByte()) + firstStream.readBytes()
      val secondReceived = second.get(2, TimeUnit.SECONDS)

      assertArrayEquals(body, firstReceived)
      assertArrayEquals(body, secondReceived)
      assertEquals(1, upstream.requestCount.get())
    } finally {
      firstConnection.disconnect()
      secondExecutor.shutdownNow()
      upstream.allowFinish.countDown()
      upstream.stop()
      proxy.stop()
    }
  }

  private fun startedProxy(): HlsProxyServer {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val server = HlsProxyServer(0, context)
    server.cacheStore.clearAll()
    server.start(NanoHttpdConfig.TIMEOUT_MS, false)
    return server
  }

  private fun openProxyConnection(proxy: HlsProxyServer, upstreamUrl: String): HttpURLConnection {
    val encodedUrl = URLEncoder.encode(upstreamUrl, "UTF-8")
    val proxyUrl = "http://127.0.0.1:${proxy.listeningPort()}/hls/segment?url=$encodedUrl&streamKey=stream"
    return (URL(proxyUrl).openConnection() as HttpURLConnection).apply {
      connectTimeout = 1_000
      readTimeout = 2_000
    }
  }

  private class SlowSegmentServer(private val body: ByteArray) : NanoHTTPD("127.0.0.1", 0) {
    val firstByteServed = CountDownLatch(1)
    val allowFinish = CountDownLatch(1)
    val closed = CountDownLatch(1)
    val requestCount = AtomicInteger(0)

    fun startServer(): SlowSegmentServer {
      start(NanoHttpdConfig.TIMEOUT_MS, false)
      return this
    }

    fun segmentUrl(): String = "http://127.0.0.1:${getListeningPort()}/segment.ts"

    override fun serve(session: IHTTPSession): Response {
      if (session.uri != "/segment.ts") {
        return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
      }
      requestCount.incrementAndGet()
      return newFixedLengthResponse(
        Response.Status.OK,
        "video/MP2T",
        SlowSegmentInputStream(body, firstByteServed, allowFinish, closed),
        body.size.toLong()
      )
    }
  }

  private class SlowSegmentInputStream(
    private val body: ByteArray,
    private val firstByteServed: CountDownLatch,
    private val allowFinish: CountDownLatch,
    private val closed: CountDownLatch
  ) : InputStream() {
    private var index = 0
    private var waiting = false

    override fun read(): Int {
      val buffer = ByteArray(1)
      val count = read(buffer, 0, 1)
      return if (count < 0) -1 else buffer[0].toInt() and 0xff
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
      if (length == 0) return 0
      if (index >= body.size) return -1
      if (index == 0) {
        firstByteServed.countDown()
        buffer[offset] = body[index++]
        return 1
      }
      if (!waiting) {
        waiting = true
        if (!allowFinish.await(2, TimeUnit.SECONDS)) {
          throw IOException("Timed out waiting to finish segment")
        }
      }
      val count = minOf(length, body.size - index)
      System.arraycopy(body, index, buffer, offset, count)
      index += count
      return count
    }

    override fun close() {
      closed.countDown()
    }
  }
}
