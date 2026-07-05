@testable import NitroPlaySourceCore
import XCTest

final class HlsTransportRoutePolicyTests: XCTestCase {
  func testAutoFeedPoolEligibleUsesProxyForHls() {
    XCTAssertTrue(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode: .auto,
        isHls: true,
        feedPoolEligible: true
      )
    )
  }

  func testAutoWithoutFeedPoolEligibleUsesDirectForHls() {
    XCTAssertFalse(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode: .auto,
        isHls: true,
        feedPoolEligible: false
      )
    )
  }

  func testExplicitProxyUsesProxyForHls() {
    XCTAssertTrue(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode: .proxy,
        isHls: true,
        feedPoolEligible: false
      )
    )
  }

  func testExplicitDirectUsesDirectForHls() {
    XCTAssertFalse(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode: .direct,
        isHls: true,
        feedPoolEligible: true
      )
    )
  }

  func testNonHlsNeverUsesProxy() {
    XCTAssertFalse(
      HlsTransportRoutePolicy.shouldUseProxyForPlayback(
        mode: .proxy,
        isHls: false,
        feedPoolEligible: true
      )
    )
  }

  func testProxyStartFailureDisablesStartupRecovery() {
    XCTAssertFalse(
      HlsTransportRoutePolicy.supportsStartupRecovery(
        isHls: true,
        isProxyRouteActive: false
      )
    )
  }

  func testActiveProxyRouteSupportsStartupRecovery() {
    XCTAssertTrue(
      HlsTransportRoutePolicy.supportsStartupRecovery(
        isHls: true,
        isProxyRouteActive: true
      )
    )
  }
}
