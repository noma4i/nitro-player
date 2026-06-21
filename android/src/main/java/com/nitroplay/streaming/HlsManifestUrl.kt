package com.nitroplay.hls

/**
 * Single source of truth for "is this URL an HLS manifest" detection, shared by the
 * proxy runtime, source factory and source so the `.m3u8` rule lives in one place.
 */
object HlsManifestUrl {
  fun matches(url: String): Boolean {
    val withoutHash = url.substringBefore('#')
    val withoutQuery = withoutHash.substringBefore('?')
    return withoutQuery.lowercase().endsWith(".m3u8")
  }
}
