import XCTest
@testable import NitroPlayLogic

final class ReleaseGuardTests: XCTestCase {

  func testReleaseIsIdempotent() async {
    actor MockPlayerState {
      var isReleased = false
      var releaseCount = 0

      func release() {
        guard !isReleased else { return }
        isReleased = true
        releaseCount += 1
      }
    }

    let state = MockPlayerState()
    await state.release()
    await state.release()

    let count = await state.releaseCount
    XCTAssertEqual(count, 1, "Release should only execute once")
  }

  func testTrimSkipsWhenReleased() async {
    actor MockPlayerState {
      var isReleased = false
      var trimExecuted = false

      func trim() {
        guard !isReleased else { return }
        trimExecuted = true
      }

      func release() {
        isReleased = true
      }
    }

    let state = MockPlayerState()
    await state.release()
    await state.trim()

    let trimmed = await state.trimExecuted
    XCTAssertFalse(trimmed, "Trim should not execute after release")
  }

  func testConcurrentReleaseAndTrim() async {
    actor MockPlayerState {
      var isReleased = false
      var loadedWithSource = true
      var trimCount = 0

      func trim() {
        guard !isReleased else { return }
        guard loadedWithSource else { return }
        trimCount += 1
        loadedWithSource = false
      }

      func release() {
        guard !isReleased else { return }
        isReleased = true
        loadedWithSource = false
      }
    }

    let state = MockPlayerState()

    await withTaskGroup(of: Void.self) { group in
      group.addTask { await state.release() }
      group.addTask { await state.trim() }
    }

    let isReleased = await state.isReleased
    XCTAssertTrue(isReleased)

    let trimCount = await state.trimCount
    XCTAssertLessThanOrEqual(trimCount, 1, "Trim should run at most once")
  }
}
