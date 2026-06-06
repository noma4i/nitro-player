package com.nitroplay.video

import com.nitroplay.hls.HlsManifest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * NP-PREVIEW-01: HLS first-frame preview decodes the first media segment, because
 * MediaMetadataRetriever cannot open an .m3u8 manifest (and in-app surface readback
 * returns black on emulator GPUs). These pin the manifest -> first-segment URL
 * resolution chain that VideoPreviewRuntime.decodeFirstHlsSegment relies on. The
 * network fetch + segment decode itself is device-only (no headless codec on CI).
 */
class AuditPhase3FixesTest {

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

  @Test
  fun masterPlaylist_resolvesFirstVariantToAbsoluteUrl() {
    assertTrue(HlsManifest.isMaster(masterManifest))
    val variant = HlsManifest.extractVariants(masterManifest).first()
    val mediaUrl = HlsManifest.resolveUrl("https://cdn.example.com/live/master.m3u8", variant)
    assertEquals("https://cdn.example.com/live/low/index.m3u8", mediaUrl)
  }

  @Test
  fun fmp4MediaPlaylist_resolvesInitAndFirstSegment() {
    val (init, first) = HlsManifest.extractInitAndFirstSegment(fmp4MediaManifest)
    val base = "https://cdn.example.com/live/low/index.m3u8"
    assertEquals("https://cdn.example.com/live/low/init.mp4", HlsManifest.resolveUrl(base, init!!))
    assertEquals("https://cdn.example.com/live/low/segment0.m4s", HlsManifest.resolveUrl(base, first!!))
  }

  @Test
  fun tsMediaPlaylist_hasNoInitSegment() {
    val (init, first) = HlsManifest.extractInitAndFirstSegment(tsMediaManifest)
    assertNull(init)
    assertEquals("segment0.ts", first)
  }
}
