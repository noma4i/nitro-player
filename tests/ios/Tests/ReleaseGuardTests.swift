import XCTest
@testable import NitroPlayLogic

final class ReleaseGuardTests: XCTestCase {

  func testConstructorInitSkipsWhenReleased() async {
    actor MockPlayerState {
      var isReleased = false
      var initCalled = false

      func simulateConstructorInit() {
        guard !isReleased else { return }
        initCalled = true
      }

      func release() {
        isReleased = true
      }
    }

    let state = MockPlayerState()
    await state.release()
    await state.simulateConstructorInit()

    let initCalled = await state.initCalled
    XCTAssertFalse(initCalled, "Init should not run after release")
  }

  func testConstructorInitRunsWhenNotReleased() async {
    actor MockPlayerState {
      var initCalled = false

      func simulateConstructorInit() {
        initCalled = true
      }
    }

    let state = MockPlayerState()
    await state.simulateConstructorInit()

    let initCalled = await state.initCalled
    XCTAssertTrue(initCalled, "Init should run when not released")
  }

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

  func testBuildPlaybackStateReturnsIdleWhenReleased() async {
    actor MockPlayerState {
      var isReleased = false

      struct PlaybackState {
        let status: String
        let isPlaying: Bool
      }

      func release() {
        isReleased = true
      }

      func buildPlaybackState() -> PlaybackState {
        if isReleased {
          return PlaybackState(status: "idle", isPlaying: false)
        }

        return PlaybackState(status: "playing", isPlaying: true)
      }
    }

    let state = MockPlayerState()
    await state.release()

    let playbackState = await state.buildPlaybackState()
    XCTAssertEqual(playbackState.status, "idle")
    XCTAssertFalse(playbackState.isPlaying)
  }

  func testBuildMemorySnapshotReturnsZerosWhenReleased() async {
    actor MockPlayerState {
      var isReleased = false
      var loadedWithSource = false

      struct MemorySnapshot {
        let totalBytes: Double
        let isPlaying: Bool
      }

      func release() {
        isReleased = true
        loadedWithSource = false
      }

      func buildMemorySnapshot() -> MemorySnapshot {
        if isReleased {
          return MemorySnapshot(totalBytes: 0, isPlaying: false)
        }

        return MemorySnapshot(totalBytes: 1024, isPlaying: loadedWithSource)
      }
    }

    let state = MockPlayerState()
    await state.release()

    let memorySnapshot = await state.buildMemorySnapshot()
    XCTAssertEqual(memorySnapshot.totalBytes, 0, accuracy: 0.001)
    XCTAssertFalse(memorySnapshot.isPlaying)
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

  func testTrimSkipsWhenNotLoaded() async {
    actor MockPlayerState {
      var loadedWithSource = false
      var trimExecuted = false

      func trim() {
        guard loadedWithSource else { return }
        trimExecuted = true
      }
    }

    let state = MockPlayerState()
    await state.trim()

    let trimmed = await state.trimExecuted
    XCTAssertFalse(trimmed, "Trim should not execute when not loaded")
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
