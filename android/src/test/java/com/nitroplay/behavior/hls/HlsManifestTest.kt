package com.nitroplay.video.behavior.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import com.nitroplay.video.streaming.HlsManifest

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
  fun extractLeadingSegments_returnsInitFromMap() {
    val (init, segments) = HlsManifest.extractLeadingSegments(mediaManifest, 10.0)
    assertEquals("init.mp4", init)
    assertEquals(listOf("segment0.ts"), segments)
  }

  @Test
  fun extractLeadingSegments_returnsNullForEmpty() {
    val (init, segments) = HlsManifest.extractLeadingSegments("#EXTM3U\n#EXT-X-ENDLIST", 20.0)
    assertNull(init)
    assertTrue(segments.isEmpty())
  }

  @Test
  fun extractLeadingSegments_noMap_returnsNullInit() {
    val manifest = "#EXTM3U\n#EXTINF:10.0,\nsegment0.ts"
    val (init, segments) = HlsManifest.extractLeadingSegments(manifest, 10.0)
    assertNull(init)
    assertEquals(listOf("segment0.ts"), segments)
  }

  @Test
  fun extractLeadingSegments_honorsMinDuration() {
    val manifest = """
      #EXTM3U
      #EXTINF:10.0,
      segment0.ts
      #EXTINF:10.0,
      segment1.ts
      #EXTINF:10.0,
      segment2.ts
      #EXTINF:10.0,
      segment3.ts
    """.trimIndent()

    val (_, segments) = HlsManifest.extractLeadingSegments(manifest, 20.0)

    assertEquals(listOf("segment0.ts", "segment1.ts"), segments)
  }

  @Test
  fun extractLeadingSegments_durationAbovePlaylistLengthReturnsAllSegments() {
    val (_, segments) = HlsManifest.extractLeadingSegments(mediaManifest, 60.0)

    assertEquals(listOf("segment0.ts", "segment1.ts"), segments)
  }

  @Test
  fun extractLeadingSegments_returnsMapAndLeadingSegments() {
    val (init, segments) = HlsManifest.extractLeadingSegments(mediaManifest, 20.0)

    assertEquals("init.mp4", init)
    assertEquals(listOf("segment0.ts", "segment1.ts"), segments)
  }

  @Test
  fun extractLeadingSegments_withoutDurationsKeepsRepeatedUriEntriesAndCapsAtTwo() {
    val manifest = """
      #EXTM3U
      #EXT-X-BYTERANGE:100@0
      shared.ts
      #EXT-X-BYTERANGE:100@100
      shared.ts
      #EXT-X-BYTERANGE:100@200
      next.ts
    """.trimIndent()

    val (_, segments) = HlsManifest.extractLeadingSegments(manifest, 30.0)

    assertEquals(listOf("shared.ts", "shared.ts"), segments)
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
  fun guessContentType_m3u8WithQueryAndFragment() {
    assertEquals("application/vnd.apple.mpegurl", HlsManifest.guessContentType("index.m3u8?token=abc#rendition"))
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

  // -- CRLF parity (NP-PARITY-02): a \r from a CRLF manifest must never leak
  // into a proxied URL. URLEncoder would encode it as %0D and break the request.
  // Mirrors the same CRLF fixture used by the iOS manifest parser.

  @Test
  fun rewriteMedia_crlfDoesNotLeakCarriageReturn() {
    val crlf = mediaManifest.replace("\n", "\r\n")
    val result = HlsManifest.rewriteMedia(crlf, "https://cdn.example.com/", null, 18181, "s1")
    assertFalse(result.contains("%0D"))
    assertTrue(result.contains("http://127.0.0.1:18181/hls/segment?"))
  }

  @Test
  fun rewriteMaster_crlfDoesNotLeakCarriageReturn() {
    val crlf = masterManifest.replace("\n", "\r\n")
    val result = HlsManifest.rewriteMaster(crlf, "https://cdn.example.com/", null, 18181, "s1")
    assertFalse(result.contains("%0D"))
    assertTrue(result.contains("http://127.0.0.1:18181/hls/manifest.m3u8?"))
  }
}
