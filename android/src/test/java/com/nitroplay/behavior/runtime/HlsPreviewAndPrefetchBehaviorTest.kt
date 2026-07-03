package com.nitroplay.video.behavior.runtime

import com.nitroplay.video.streaming.HlsManifest
import com.nitroplay.video.streaming.HlsProxyRuntime
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HlsPreviewAndPrefetchBehaviorTest {
  private val masterManifest = """
    #EXTM3U
    #EXT-X-STREAM-INF:BANDWIDTH=1280000
    low/index.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=2560000
    high/index.m3u8
  """.trimIndent()

  private val fmp4MediaManifest = """
    #EXTM3U
    #EXT-X-MAP:URI="init.mp4"
    #EXTINF:6.0,
    segment0.m4s
    #EXT-X-ENDLIST
  """.trimIndent()

  private val tsMediaManifest = """
    #EXTM3U
    #EXTINF:6.0,
    segment0.ts
    #EXT-X-ENDLIST
  """.trimIndent()

  @After
  fun tearDown() {
    HlsProxyRuntime.resetStateForTests()
  }

  @Test
  fun masterPlaylist_resolvesFirstVariantToAbsoluteUrl() {
    assertTrue(HlsManifest.isMaster(masterManifest))
    val variant = HlsManifest.extractVariants(masterManifest).first()
    val mediaUrl = HlsManifest.resolveUrl("https://cdn.example.com/live/master.m3u8", variant)
    assertEquals("https://cdn.example.com/live/low/index.m3u8", mediaUrl)
  }

  @Test
  fun fmp4MediaPlaylist_resolvesInitAndFirstSegment() {
    val (init, segments) = HlsManifest.extractLeadingSegments(fmp4MediaManifest, 1)
    val base = "https://cdn.example.com/live/low/index.m3u8"
    assertEquals("https://cdn.example.com/live/low/init.mp4", HlsManifest.resolveUrl(base, init!!))
    assertEquals("https://cdn.example.com/live/low/segment0.m4s", HlsManifest.resolveUrl(base, segments.first()))
  }

  @Test
  fun tsMediaPlaylist_hasNoInitSegment() {
    val (init, segments) = HlsManifest.extractLeadingSegments(tsMediaManifest, 1)
    assertNull(init)
    assertEquals(listOf("segment0.ts"), segments)
  }

  @Test
  fun prefetchWithoutServerDoesNotPoisonDedupState() {
    val completions = AtomicInteger(0)

    repeat(550) { index ->
      HlsProxyRuntime.prefetchLeadingSegments(
        "https://cdn.example.com/live/$index/index.m3u8",
        null as Map<String, String>?,
        onComplete = { completions.incrementAndGet() },
        onError = { throw it }
      )
    }

    assertEquals(550, completions.get())
    assertEquals(0, HlsProxyRuntime.prefetchTimestampCountForTests())
  }

  @Test
  fun configureCacheBeforeServerStartIsVisibleInStats() {
    HlsProxyRuntime.configureCache((512L * 1024L * 1024L).toDouble())

    assertEquals(512L * 1024L * 1024L, HlsProxyRuntime.configuredMaxCacheBytesForTests())
  }

  @Test
  fun configureCacheWithoutMaxBytesKeepsExistingBudget() {
    HlsProxyRuntime.configureCache((512L * 1024L * 1024L).toDouble())
    HlsProxyRuntime.configureCache(null, 4.0)

    assertEquals(512L * 1024L * 1024L, HlsProxyRuntime.configuredMaxCacheBytesForTests())
    assertEquals(4, HlsProxyRuntime.configuredPrefetchSegmentCountForTests())
  }

  @Test
  fun configureCacheClampsPrefetchSegments() {
    HlsProxyRuntime.configureCache(null, 9.0)
    assertEquals(6, HlsProxyRuntime.configuredPrefetchSegmentCountForTests())

    HlsProxyRuntime.configureCache(null, 0.0)
    assertEquals(1, HlsProxyRuntime.configuredPrefetchSegmentCountForTests())
  }
}
