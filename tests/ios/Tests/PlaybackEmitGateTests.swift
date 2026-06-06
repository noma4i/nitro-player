import XCTest

/// Mirrors the equality gate added to `HybridNitroPlayer.emitPlaybackState()` /
/// `playbackStateSignature()`. The real method lives in a hybrid that pulls in
/// AVFoundation and the Nitro C++ bridge and cannot be compiled into the
/// SwiftPM test target, so this reproduces the exact decision logic (same
/// convention as BufferingStateLogicTests). Parity counterpart: the EmitGate
/// model in AuditPhase2FixesTest.kt on Android.
final class PlaybackEmitGateTests: XCTestCase {

  private struct TestState {
    var position: Double
    var isPlaying: Bool
    var errorCode: String?
    var timestamp: Double
  }

  private final class EmitGate {
    private var lastSignature: String?
    private(set) var emitCount = 0

    // Signature excludes the always-advancing timestamp, exactly like the
    // production playbackStateSignature.
    private func signature(_ state: TestState) -> String {
      return [
        String(state.position),
        String(state.isPlaying),
        state.errorCode ?? "nil"
      ].joined(separator: "|")
    }

    func emit(_ state: TestState) {
      let next = signature(state)
      if next == lastSignature {
        return
      }
      lastSignature = next
      emitCount += 1
    }

    // Mirrors beginSourceGeneration resetting the gate.
    func reset() {
      lastSignature = nil
    }
  }

  func testSuppressesIdenticalStatesAcrossTicks() {
    let gate = EmitGate()
    gate.emit(TestState(position: 10, isPlaying: false, errorCode: nil, timestamp: 1000))
    gate.emit(TestState(position: 10, isPlaying: false, errorCode: nil, timestamp: 1250))
    gate.emit(TestState(position: 10, isPlaying: false, errorCode: nil, timestamp: 1500))
    XCTAssertEqual(gate.emitCount, 1)
  }

  func testEmitsWhenAnyMeaningfulFieldChanges() {
    let gate = EmitGate()
    gate.emit(TestState(position: 10, isPlaying: false, errorCode: nil, timestamp: 1000))
    gate.emit(TestState(position: 11, isPlaying: false, errorCode: nil, timestamp: 1250))
    gate.emit(TestState(position: 11, isPlaying: true, errorCode: nil, timestamp: 1500))
    XCTAssertEqual(gate.emitCount, 3)
  }

  func testEmitsWhenErrorAppears() {
    let gate = EmitGate()
    gate.emit(TestState(position: 5, isPlaying: true, errorCode: nil, timestamp: 1000))
    gate.emit(TestState(position: 5, isPlaying: true, errorCode: "player/released", timestamp: 1250))
    XCTAssertEqual(gate.emitCount, 2)
  }

  func testResetForcesNextEmit() {
    let gate = EmitGate()
    gate.emit(TestState(position: 0, isPlaying: false, errorCode: nil, timestamp: 1000))
    // New source generation: the same logical state must emit again.
    gate.reset()
    gate.emit(TestState(position: 0, isPlaying: false, errorCode: nil, timestamp: 2000))
    XCTAssertEqual(gate.emitCount, 2)
  }
}
