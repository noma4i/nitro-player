package com.nitroplay.video.source

enum class HlsTransportRouteMode {
  AUTO,
  DIRECT,
  PROXY
}

object HlsTransportRoutePolicy {
  fun shouldUseProxyForPlayback(
    mode: HlsTransportRouteMode?,
    isHls: Boolean,
    feedPoolEligible: Boolean,
    hasCachedStream: Boolean = false
  ): Boolean {
    if (!isHls) return false

    return when (mode ?: HlsTransportRouteMode.AUTO) {
      HlsTransportRouteMode.DIRECT -> false
      HlsTransportRouteMode.PROXY -> true
      HlsTransportRouteMode.AUTO -> feedPoolEligible || hasCachedStream
    }
  }

  fun supportsStartupRecovery(isHls: Boolean, isProxyRouteActive: Boolean): Boolean {
    return isHls && isProxyRouteActive
  }
}
