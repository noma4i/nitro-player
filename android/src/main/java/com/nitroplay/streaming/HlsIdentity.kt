package com.nitroplay.video.streaming

import java.util.TreeMap

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
}
