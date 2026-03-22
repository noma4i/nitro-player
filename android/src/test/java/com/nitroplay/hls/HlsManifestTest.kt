package com.nitroplay.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HlsManifestTest {

  private val masterManifest = """
    #EXTM3U
    #EXT-X-STREAM-INF:BANDWIDTH=1280000
    low/index.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=2560000
    mid/index.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=7680000
    high/index.m3u8
  """.trimIndent()

  private val mediaManifest = """
    #EXTM3U
    #EXT-X-TARGETDURATION:10
    #EXT-X-MAP:URI="init.mp4"
    #EXTINF:10.0,
    segment0.ts
    #EXTINF:10.0,
    segment1.ts
    #EXT-X-ENDLIST
  """.trimIndent()

  private val mediaManifestWithKey = """
    #EXTM3U
    #EXT-X-TARGETDURATION:10
    #EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/key.bin",IV=0x1234
    #EXTINF:10.0,
    segment0.ts
  """.trimIndent()

  @Test
  fun isMaster_returnsTrue_forMasterManifest() {
    assertTrue(HlsManifest.isMaster(masterManifest))
  }

  @Test
  fun isMaster_returnsFalse_forMediaManifest() {
    assertFalse(HlsManifest.isMaster(mediaManifest))
  }

  @Test
  fun extractVariants_returnsUrls_fromMasterManifest() {
    val variants = HlsManifest.extractVariants(masterManifest)
    assertEquals(listOf("low/index.m3u8", "mid/index.m3u8", "high/index.m3u8"), variants)
  }

  @Test
  fun extractVariants_returnsEmpty_forMediaManifest() {
    val variants = HlsManifest.extractVariants(mediaManifest)
    assertTrue(variants.isEmpty())
  }

  @Test
  fun extractInitAndFirstSegment_returnsInitFromMap() {
    val (init, first) = HlsManifest.extractInitAndFirstSegment(mediaManifest)
    assertEquals("init.mp4", init)
    assertEquals("segment0.ts", first)
  }

  @Test
  fun extractInitAndFirstSegment_returnsNullForEmpty() {
    val (init, first) = HlsManifest.extractInitAndFirstSegment("#EXTM3U\n#EXT-X-ENDLIST")
    assertNull(init)
    assertNull(first)
  }

  @Test
  fun extractInitAndFirstSegment_noMap_returnsNullInit() {
    val manifest = "#EXTM3U\n#EXTINF:10.0,\nsegment0.ts"
    val (init, first) = HlsManifest.extractInitAndFirstSegment(manifest)
    assertNull(init)
    assertEquals("segment0.ts", first)
  }

  @Test
  fun rewriteMaster_proxiesVariantUrls() {
    val result = HlsManifest.rewriteMaster(
      masterManifest,
      "https://cdn.example.com/",
      null,
      18181,
      "stream1"
    )
    assertTrue(result.contains("http://127.0.0.1:18181/hls/manifest.m3u8?"))
    assertTrue(result.contains("url="))
    assertFalse(result.contains("\nlow/index.m3u8"))
  }

  @Test
  fun rewriteMaster_preservesStreamInfLines() {
    val result = HlsManifest.rewriteMaster(
      masterManifest,
      "https://cdn.example.com/",
      null,
      18181,
      "stream1"
    )
    assertTrue(result.contains("#EXT-X-STREAM-INF:BANDWIDTH=1280000"))
    assertTrue(result.contains("#EXT-X-STREAM-INF:BANDWIDTH=7680000"))
  }

  @Test
  fun rewriteMedia_proxiesSegmentUrls() {
    val result = HlsManifest.rewriteMedia(
      mediaManifest,
      "https://cdn.example.com/",
      null,
      18181,
      "stream1"
    )
    assertTrue(result.contains("http://127.0.0.1:18181/hls/segment?"))
    assertFalse(result.contains("\nsegment0.ts"))
    assertFalse(result.contains("\nsegment1.ts"))
  }

  @Test
  fun rewriteMedia_proxiesMapUri() {
    val result = HlsManifest.rewriteMedia(
      mediaManifest,
      "https://cdn.example.com/",
      null,
      18181,
      "stream1"
    )
    assertTrue(result.contains("#EXT-X-MAP:URI=\"http://127.0.0.1:18181/hls/segment?"))
    assertFalse(result.contains("URI=\"init.mp4\""))
  }

  @Test
  fun rewriteMedia_proxiesKeyUri() {
    val result = HlsManifest.rewriteMedia(
      mediaManifestWithKey,
      "https://cdn.example.com/",
      null,
      18181,
      "stream1"
    )
    assertTrue(result.contains("#EXT-X-KEY:METHOD=AES-128,URI=\"http://127.0.0.1:18181/hls/segment?"))
  }

  @Test
  fun rewriteMedia_preservesCommentLines() {
    val result = HlsManifest.rewriteMedia(
      mediaManifest,
      "https://cdn.example.com/",
      null,
      18181,
      "stream1"
    )
    assertTrue(result.contains("#EXTM3U"))
    assertTrue(result.contains("#EXT-X-TARGETDURATION:10"))
    assertTrue(result.contains("#EXTINF:10.0,"))
    assertTrue(result.contains("#EXT-X-ENDLIST"))
  }

  @Test
  fun resolveUrl_resolvesRelativeAgainstBase() {
    val result = HlsManifest.resolveUrl("https://cdn.example.com/live/master.m3u8", "low/index.m3u8")
    assertEquals("https://cdn.example.com/live/low/index.m3u8", result)
  }

  @Test
  fun resolveUrl_handlesAbsoluteUrl() {
    val result = HlsManifest.resolveUrl("https://cdn.example.com/live/", "https://other.cdn.com/seg.ts")
    assertEquals("https://other.cdn.com/seg.ts", result)
  }

  @Test
  fun resolveUrl_returnsRelativeForInvalidBase() {
    val result = HlsManifest.resolveUrl("not-a-url", "segment.ts")
    assertEquals("segment.ts", result)
  }

  @Test
  fun guessContentType_m3u8() {
    assertEquals("application/vnd.apple.mpegurl", HlsManifest.guessContentType("index.m3u8"))
  }

  @Test
  fun guessContentType_m4s() {
    assertEquals("video/iso.segment", HlsManifest.guessContentType("init.m4s"))
  }

  @Test
  fun guessContentType_mp4() {
    assertEquals("video/mp4", HlsManifest.guessContentType("video.mp4"))
  }

  @Test
  fun guessContentType_ts() {
    assertEquals("video/MP2T", HlsManifest.guessContentType("segment.ts"))
  }

  @Test
  fun guessContentType_unknown() {
    assertEquals("video/MP2T", HlsManifest.guessContentType("something.xyz"))
  }
}
