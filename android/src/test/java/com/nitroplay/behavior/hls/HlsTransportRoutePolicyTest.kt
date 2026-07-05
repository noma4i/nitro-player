package com.nitroplay.video.behavior.hls

import com.nitroplay.video.source.HlsTransportRouteMode
import com.nitroplay.video.source.HlsTransportRoutePolicy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HlsTransportRoutePolicyTest {
  @Test
  fun autoFeedPoolEligibleUsesProxyForHls() {
    assertTrue(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode = HlsTransportRouteMode.AUTO,
        isHls = true,
        feedPoolEligible = true
      )
    )
  }

  @Test
  fun autoWithoutFeedPoolEligibleUsesDirectForHls() {
    assertFalse(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode = HlsTransportRouteMode.AUTO,
        isHls = true,
        feedPoolEligible = false
      )
    )
  }

  @Test
  fun explicitProxyUsesProxyForHls() {
    assertTrue(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode = HlsTransportRouteMode.PROXY,
        isHls = true,
        feedPoolEligible = false
      )
    )
  }

  @Test
  fun explicitDirectUsesDirectForHls() {
    assertFalse(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode = HlsTransportRouteMode.DIRECT,
        isHls = true,
        feedPoolEligible = true
      )
    )
  }

  @Test
  fun nonHlsNeverUsesProxy() {
    assertFalse(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode = HlsTransportRouteMode.PROXY,
        isHls = false,
        feedPoolEligible = true
      )
    )
  }

  @Test
  fun proxyStartFailureDisablesStartupRecovery() {
    assertFalse(
      HlsTransportRoutePolicy.supportsStartupRecovery(
        isHls = true,
        isProxyRouteActive = false
      )
    )
  }

  @Test
  fun activeProxyRouteSupportsStartupRecovery() {
    assertTrue(
      HlsTransportRoutePolicy.supportsStartupRecovery(
        isHls = true,
        isProxyRouteActive = true
      )
    )
  }
}
