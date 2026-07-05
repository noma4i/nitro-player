@testable import NitroPlaySupportCore
import XCTest

final class SourceCommandCoordinatorTests: XCTestCase {
  func testBeginFromBackgroundDoesNotRequireMainQueueRoundTrip() {
    let lifecycleGate = LifecycleGate()
    let coordinator = SourceCommandCoordinator(lifecycleGate: lifecycleGate)
    let finished = expectation(description: "background command begin finished")

    DispatchQueue.global(qos: .userInitiated).async {
      var wantsToPlay = true
      let command = coordinator.begin(allowAutoPlay: true, wantsToPlay: &wantsToPlay)

      XCTAssertEqual(command, SourceCommandBeginResult(generation: 1, shouldAutoPlay: true))
      XCTAssertFalse(wantsToPlay)
      finished.fulfill()
    }

    wait(for: [finished], timeout: 1.0)
  }

  func testBeginInvalidatesStaleGenerationAndClearsPlayIntent() {
    let lifecycleGate = LifecycleGate()
    let coordinator = SourceCommandCoordinator(lifecycleGate: lifecycleGate)
    var wantsToPlay = true

    let first = coordinator.begin(allowAutoPlay: true, wantsToPlay: &wantsToPlay)
    wantsToPlay = true
    let second = coordinator.begin(allowAutoPlay: false, wantsToPlay: &wantsToPlay)

    XCTAssertEqual(first, SourceCommandBeginResult(generation: 1, shouldAutoPlay: true))
    XCTAssertEqual(second, SourceCommandBeginResult(generation: 2, shouldAutoPlay: false))
    XCTAssertFalse(lifecycleGate.shouldDeliverCallback(capturedGeneration: first?.generation ?? -1))
    XCTAssertFalse(wantsToPlay)
  }

  func testBeginNoopsAfterRelease() {
    let lifecycleGate = LifecycleGate()
    let coordinator = SourceCommandCoordinator(lifecycleGate: lifecycleGate)
    var wantsToPlay = true

    lifecycleGate.markReleased()

    XCTAssertNil(coordinator.begin(allowAutoPlay: true, wantsToPlay: &wantsToPlay))
    XCTAssertTrue(wantsToPlay)
  }
}
