package com.nitroplay.video.streaming

import com.margelo.nitro.video.NitroSourcePreviewConfig
import java.util.TreeMap
import com.nitroplay.video.preview.VideoPreviewProfile

object HlsIdentity {
  fun requestKey(url: String, headers: Map<String, String>?): String {
    if (headers.isNullOrEmpty()) {
      return url
    }

    val stableHeaders = TreeMap(headers)
      .entries
      .joinToString("&") { (key, value) -> "$key=$value" }

    return "$url\n$stableHeaders"
  }

  fun previewKey(url: String, headers: Map<String, String>?, preview: NitroSourcePreviewConfig?): String {
    val profile = VideoPreviewProfile.from(preview)
    return buildString {
      append(requestKey(url, headers))
      append("\npreview:")
      append(profile.maxWidth)
      append('x')
      append(profile.maxHeight)
      append('@')
      append(profile.quality)
    }
  }
}
