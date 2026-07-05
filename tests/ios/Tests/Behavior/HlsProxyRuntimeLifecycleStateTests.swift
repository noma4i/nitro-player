@testable import NitroPlayStreamingCore
import XCTest

final class HlsProxyRuntimeLifecycleStateTests: XCTestCase {
  func testStartResolvesPortAndClearsExplicitStop() {
    var state = HlsProxyRuntimeLifecycleState()

    let port = state.start(port: 9123)
    let snapshot = state.snapshot()

    XCTAssertEqual(port, 9123)
    XCTAssertEqual(snapshot.port, 9123)
    XCTAssertFalse(snapshot.didAutoStart)
    XCTAssertFalse(snapshot.isExplicitlyStopped)
  }

  func testImplicitStartIsCommittedOnlyAfterRuntimeStarts() {
    var state = HlsProxyRuntimeLifecycleState()

    XCTAssertEqual(state.portForImplicitStart(), 0)
    XCTAssertEqual(state.portForImplicitStart(), 0)

    state.markAutoStarted()

    XCTAssertNil(state.portForImplicitStart())
  }

  func testImplicitStartIsBlockedAfterExplicitStop() {
    var state = HlsProxyRuntimeLifecycleState()

    state.stop()

    XCTAssertNil(state.portForImplicitStart())
    XCTAssertTrue(state.snapshot().isExplicitlyStopped)
  }

  func testHostLifecycleSuspendDoesNotBecomeExplicitStop() {
    var state = HlsProxyRuntimeLifecycleState()
    state.markAutoStarted()

    state.suspendForHostLifecycle()

    let snapshot = state.snapshot()
    XCTAssertFalse(snapshot.didAutoStart)
    XCTAssertFalse(snapshot.isExplicitlyStopped)
    XCTAssertEqual(state.portForImplicitStart(), 0)
  }

  func testRestartForPlaybackRecoveryPreservesDesiredPort() {
    var state = HlsProxyRuntimeLifecycleState()
    _ = state.start(port: 9456)

    XCTAssertEqual(state.portForPlaybackRecoveryRestart(), 9456)
    XCTAssertFalse(state.snapshot().didAutoStart)

    state.markAutoStarted()
    XCTAssertTrue(state.snapshot().didAutoStart)

    state.stop()

    XCTAssertNil(state.portForPlaybackRecoveryRestart())
  }

  func testStartClearsStaleAutoStartMarkerForRetryableRestart() {
    var state = HlsProxyRuntimeLifecycleState()
    state.markAutoStarted()

    XCTAssertEqual(state.start(port: 0), 0)

    XCTAssertEqual(state.portForImplicitStart(), 0)
    XCTAssertFalse(state.snapshot().didAutoStart)
  }
}
