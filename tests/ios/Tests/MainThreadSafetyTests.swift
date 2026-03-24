import XCTest
@testable import NitroPlayLogic

final class MainThreadSafetyTests: XCTestCase {

  func testAtomicPlayerItemAssignment() async {
    actor MockPlayerState {
      var playerItem: String? = nil
      var isReleased = false

      func commitBufferedState(item: String) {
        guard !isReleased else { return }
        playerItem = item
      }

      func release() {
        isReleased = true
        playerItem = nil
      }
    }

    let state = MockPlayerState()

    await state.release()
    await state.commitBufferedState(item: "newItem")

    let item = await state.playerItem
    XCTAssertNil(item, "playerItem should be nil after release + commit guard")
  }

  func testConcurrentPrepareAndRelease() async {
    actor MockPlayerState {
      var playerItem: String? = nil
      var isReleased = false

      func commitBufferedState(item: String) {
        guard !isReleased else { return }
        playerItem = item
      }

      func release() {
        isReleased = true
        playerItem = nil
      }
    }

    let state = MockPlayerState()

    await withTaskGroup(of: Void.self) { group in
      group.addTask {
        await state.commitBufferedState(item: "video.mp4")
      }
      group.addTask {
        await state.release()
      }
    }

    let isReleased = await state.isReleased
    XCTAssertTrue(isReleased)

    let item = await state.playerItem
    XCTAssertNil(item, "playerItem should be nil after concurrent release")
  }
}
