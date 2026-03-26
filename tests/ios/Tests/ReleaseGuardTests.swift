import XCTest
@testable import NitroPlayLogic

final class ReleaseGuardTests: XCTestCase {

  // Tests SourceLoader cancellation - REAL production code (symlinked).
  // HybridNitroPlayer.release() calls sourceLoader.cancelSync(),
  // so SourceLoader cancellation IS the release guard for async operations.

  func testConcurrentCancelDuringLoad() async {
    let loader = SourceLoader()

    // Start load and cancel concurrently - should not crash
    let loadTask = Task {
      try? await loader.load {
        try await Task.sleep(nanoseconds: 10_000_000) // 10ms
        return "result"
      }
    }

    // Cancel immediately (simulates release during load)
    await loader.cancel()
    loadTask.cancel()

    // No crash = success
  }

  func testCancelIsIdempotent() async {
    let loader = SourceLoader()
    await loader.cancel()
    await loader.cancel()
    // No crash = idempotent
  }

  func testLoadAfterCancelWorks() async throws {
    let loader = SourceLoader()
    await loader.cancel()

    let result: String = try await loader.load { "fresh" }
    XCTAssertEqual(result, "fresh", "New load should work after cancel")
  }

  func testRapidCreateDestroyCycles() async {
    // Simulates rapid create/release in feed scroll
    for _ in 0..<50 {
      let loader = SourceLoader()
      let task = Task {
        try? await loader.load {
          try? await Task.sleep(nanoseconds: 1_000)
          return "result"
        }
      }
      await loader.cancel()
      task.cancel()
    }
    // No crash, no leak = success
  }
}
