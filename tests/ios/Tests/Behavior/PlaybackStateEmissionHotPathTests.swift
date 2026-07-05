@testable import NitroPlayPlayerCore
@testable import NitroPlaySupportCore
import XCTest

final class PlaybackStateEmissionHotPathTests: XCTestCase {
  func testNoPlaybackStateListenerSkipsSnapshotWork() {
    let registry = ListenerRegistryCore()
    var didBuildSnapshot = false

    if PlaybackStateEmissionCoordinator.shouldBuildSnapshot(
      canEmitForLifecycle: true,
      hasPlaybackStateListeners: registry.hasListeners(event: "onPlaybackState")
    ) {
      didBuildSnapshot = true
    }

    XCTAssertFalse(didBuildSnapshot)

    _ = registry.add(event: "onPlaybackState", listener: { (_: Int) in })

    XCTAssertTrue(
      PlaybackStateEmissionCoordinator.shouldBuildSnapshot(
        canEmitForLifecycle: true,
        hasPlaybackStateListeners: registry.hasListeners(event: "onPlaybackState")
      )
    )
  }

  func testGateSuppressesIdenticalConsecutiveFingerprints() {
    let gate = PlaybackStateEmissionGate()
    let fingerprint = makeFingerprint(currentTime: 1)

    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertFalse(gate.shouldEmit(fingerprint: fingerprint))
    XCTAssertTrue(gate.shouldEmit(fingerprint: makeFingerprint(currentTime: 2)))

    gate.reset()
    XCTAssertTrue(gate.shouldEmit(fingerprint: fingerprint))
  }

  func testGateNormalizesNaNFieldsForDedupe() {
    let gate = PlaybackStateEmissionGate()

    XCTAssertTrue(gate.shouldEmit(fingerprint: makeFingerprint(duration: .nan)))
    XCTAssertFalse(gate.shouldEmit(fingerprint: makeFingerprint(duration: .nan)))
  }

  func testPeriodicObserverLifecycleInstallsOnlyWhenItemExists() {
    var lifecycle = PeriodicTimeObserverLifecycle()

    XCTAssertFalse(lifecycle.isInstalled)
    XCTAssertEqual(lifecycle.update(hasCurrentItem: false), .none)
    XCTAssertFalse(lifecycle.isInstalled)

    XCTAssertEqual(lifecycle.update(hasCurrentItem: true), .install)
    XCTAssertTrue(lifecycle.isInstalled)
    XCTAssertEqual(lifecycle.update(hasCurrentItem: true), .none)

    XCTAssertEqual(lifecycle.update(hasCurrentItem: false), .remove)
    XCTAssertFalse(lifecycle.isInstalled)
    XCTAssertEqual(lifecycle.invalidate(), .none)
  }

  private func makeFingerprint(currentTime: Double = 0, duration: Double = 100) -> PlaybackStateFingerprint {
    PlaybackStateFingerprint(
      status: 3,
      currentTime: currentTime,
      duration: duration,
      bufferDuration: 5,
      bufferedPosition: currentTime + 5,
      rate: 1,
      isPlaying: true,
      isBuffering: false,
      isVisualReady: true,
      errorCode: nil,
      errorMessageHash: nil
    )
  }
}
