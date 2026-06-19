import XCTest
@testable import NitroPlayLogic

final class PlaybackEmitGateTests: XCTestCase {
  func testSuppressesRepeatedMeaningfulStateSignature() {
    let gate = PlaybackStateEmissionGate()

    XCTAssertTrue(gate.shouldEmit(signature: "playing|10|nil"))
    XCTAssertFalse(gate.shouldEmit(signature: "playing|10|nil"))
    XCTAssertFalse(gate.shouldEmit(signature: "playing|10|nil"))
  }

  func testEmitsWhenMeaningfulStateSignatureChanges() {
    let gate = PlaybackStateEmissionGate()

    XCTAssertTrue(gate.shouldEmit(signature: "paused|10|nil"))
    XCTAssertTrue(gate.shouldEmit(signature: "playing|10|nil"))
    XCTAssertTrue(gate.shouldEmit(signature: "playing|11|nil"))
    XCTAssertTrue(gate.shouldEmit(signature: "error|11|player/not-initialized"))
  }

  func testResetAllowsNextSignatureToEmitAgain() {
    let gate = PlaybackStateEmissionGate()

    XCTAssertTrue(gate.shouldEmit(signature: "paused|10|nil"))
    XCTAssertFalse(gate.shouldEmit(signature: "paused|10|nil"))

    gate.reset()

    XCTAssertTrue(gate.shouldEmit(signature: "paused|10|nil"))
  }
}
