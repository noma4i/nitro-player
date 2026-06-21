import XCTest
@testable import NitroPlayLogic

final class HlsRuntimeStateTests: XCTestCase {
  func testStartResolvesPortAndMarksAutoStarted() {
    let state = HlsRuntimeState()

    let port = state.start(port: 9123)
    let snapshot = state.snapshot()

    XCTAssertEqual(port, 9123)
    XCTAssertEqual(snapshot.port, 9123)
    XCTAssertTrue(snapshot.didAutoStart)
    XCTAssertFalse(snapshot.isExplicitlyStopped)
  }

  func testImplicitStartIsIdempotentAndBlockedAfterExplicitStop() {
    let state = HlsRuntimeState()

    XCTAssertEqual(state.shouldStartForImplicitUse(), 0)
    XCTAssertNil(state.shouldStartForImplicitUse())

    state.stop()

    XCTAssertNil(state.shouldStartForImplicitUse())
    XCTAssertTrue(state.snapshot().isExplicitlyStopped)
  }

  func testRestartForPlaybackRecoveryPreservesDesiredPort() {
    let state = HlsRuntimeState()
    _ = state.start(port: 9456)

    XCTAssertEqual(state.shouldRestartForPlaybackRecovery(), 9456)

    state.stop()

    XCTAssertNil(state.shouldRestartForPlaybackRecovery())
  }
}
