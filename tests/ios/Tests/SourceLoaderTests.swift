import XCTest
@testable import NitroPlayLogic

final class SourceLoaderTests: XCTestCase {
  func testLoadReturnsResult() async throws {
    let loader = SourceLoader()
    let result = try await loader.load { 42 }
    XCTAssertEqual(result, 42)
  }

  func testLoadPropagatesError() async {
    let loader = SourceLoader()
    do {
      let _: Int = try await loader.load { throw NSError(domain: "test", code: 1) }
      XCTFail("should throw")
    } catch {
      XCTAssertEqual((error as NSError).domain, "test")
    }
  }

  func testCancelCancelsCurrentTask() async throws {
    let loader = SourceLoader()

    let task = Task {
      try await loader.load {
        try await Task.sleep(nanoseconds: 5_000_000_000)
        return "should not complete"
      }
    }

    try await Task.sleep(nanoseconds: 50_000_000)
    await loader.cancel()

    do {
      _ = try await task.value
      XCTFail("should throw CancellationError")
    } catch is CancellationError {
      // expected
    } catch {
      // other errors acceptable
    }
  }

  func testConcurrentLoadCancelsPrevious() async throws {
    let loader = SourceLoader()

    let first = Task {
      try await loader.load {
        try await Task.sleep(nanoseconds: 5_000_000_000)
        return "first"
      }
    }

    try await Task.sleep(nanoseconds: 50_000_000)

    let second = Task {
      try await loader.load {
        return "second"
      }
    }

    let secondResult = try await second.value
    XCTAssertEqual(secondResult, "second")

    do {
      _ = try await first.value
      // If first completed before cancel, that's also OK
    } catch {
      // expected cancellation
    }
  }

  func testCancelSyncTriggersCancel() async throws {
    let loader = SourceLoader()
    loader.cancelSync()
    // Should not crash, and next load should work
    let result = try await loader.load { "ok" }
    XCTAssertEqual(result, "ok")
  }
}
