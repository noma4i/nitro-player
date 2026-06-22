import XCTest
@testable import NitroPlayLogic

final class PlaybackEmitGateTests: XCTestCase {
  func testSuppressesRepeatedMeaningfulStateFingerprint() {
    let gate = PlaybackStateEmissionGate()
    let fingerprint = makeFingerprint(status: 3, currentTime: 10)

    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertFalse(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertFalse(gate.shouldEmit(fingerprint: fingerprint))
  }

  func testEmitsWhenMeaningfulStateFingerprintChanges() {
    let gate = PlaybackStateEmissionGate()

    XCTAssertTrue(gate.shouldEmit(fingerprint: makeFingerprint(status: 4, currentTime: 10)))
    XCTAssertTrue(gate.shouldEmit(fingerprint: makeFingerprint(status: 3, currentTime: 10)))
    XCTAssertTrue(gate.shouldEmit(fingerprint: makeFingerprint(status: 3, currentTime: 11)))
    XCTAssertTrue(gate.shouldEmit(fingerprint: makeFingerprint(status: 6, currentTime: 11, errorCode: 4, errorMessageHash: 99)))
  }

  func testResetAllowsNextFingerprintToEmitAgain() {
    let gate = PlaybackStateEmissionGate()
    let fingerprint = makeFingerprint(status: 4, currentTime: 10)

    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertFalse(gate.shouldEmit(fingerprint: fingerprint))

    gate.reset()

    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
  }

  func testNaNFieldsAreStableForDeduping() {
    let gate = PlaybackStateEmissionGate()
    let fingerprint = makeFingerprint(status: 1, currentTime: .nan, duration: .nan)

    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertFalse(gate.shouldEmit(fingerprint: makeFingerprint(status: 1, currentTime: .nan, duration: .nan)))
  }

  func testConcurrentCallersDoNotRaceSharedState() {
    let gate = PlaybackStateEmissionGate()
    let iterations = 1000

    DispatchQueue.concurrentPerform(iterations: iterations) { index in
      _ = gate.shouldEmit(fingerprint: makeFingerprint(status: index % 7, currentTime: Double(index % 5)))
    }

    gate.reset()
    let fingerprint = makeFingerprint(status: 3, currentTime: 1)
    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertFalse(gate.shouldEmit(fingerprint: fingerprint))
  }

  private func makeFingerprint(
    status: Int,
    currentTime: Double = 0,
    duration: Double = 12,
    bufferDuration: Double = 2,
    bufferedPosition: Double = 2,
    rate: Double = 1,
    isPlaying: Bool = false,
    isBuffering: Bool = false,
    isVisualReady: Bool = false,
    errorCode: Int? = nil,
    errorMessageHash: UInt64? = nil
  ) -> PlaybackStateFingerprint {
    PlaybackStateFingerprint(
      status: status,
      currentTime: currentTime,
      duration: duration,
      bufferDuration: bufferDuration,
      bufferedPosition: bufferedPosition,
      rate: rate,
      isPlaying: isPlaying,
      isBuffering: isBuffering,
      isVisualReady: isVisualReady,
      errorCode: errorCode,
      errorMessageHash: errorMessageHash
    )
  }
}
