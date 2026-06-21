import XCTest
@testable import NitroPlayLogic

final class HlsRuntimeStateTests: XCTestCase {
  func testStartResolvesPortAndClearsExplicitStop() {
    let state = HlsRuntimeState()

    let port = state.start(port: 9123)
    let snapshot = state.snapshot()

    XCTAssertEqual(port, 9123)
    XCTAssertEqual(snapshot.port, 9123)
    XCTAssertFalse(snapshot.didAutoStart)
    XCTAssertFalse(snapshot.isExplicitlyStopped)
  }

  func testImplicitStartIsCommittedOnlyAfterRuntimeStarts() {
    let state = HlsRuntimeState()

    XCTAssertEqual(state.portForImplicitStart(), 0)
    XCTAssertEqual(state.portForImplicitStart(), 0)

    state.markAutoStarted()

    XCTAssertNil(state.portForImplicitStart())
  }

  func testImplicitStartIsBlockedAfterExplicitStop() {
    let state = HlsRuntimeState()

    state.stop()

    XCTAssertNil(state.portForImplicitStart())
    XCTAssertTrue(state.snapshot().isExplicitlyStopped)
  }

  func testHostLifecycleSuspendDoesNotBecomeExplicitStop() {
    let state = HlsRuntimeState()
    state.markAutoStarted()

    state.suspendForHostLifecycle()

    let snapshot = state.snapshot()
    XCTAssertFalse(snapshot.didAutoStart)
    XCTAssertFalse(snapshot.isExplicitlyStopped)
    XCTAssertEqual(state.portForImplicitStart(), 0)
  }

  func testRestartForPlaybackRecoveryPreservesDesiredPort() {
    let state = HlsRuntimeState()
    _ = state.start(port: 9456)

    XCTAssertEqual(state.portForPlaybackRecoveryRestart(), 9456)
    XCTAssertFalse(state.snapshot().didAutoStart)

    state.markAutoStarted()
    XCTAssertTrue(state.snapshot().didAutoStart)

    state.stop()

    XCTAssertNil(state.portForPlaybackRecoveryRestart())
  }
}
