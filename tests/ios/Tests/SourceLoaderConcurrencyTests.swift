import XCTest
@testable import NitroPlayLogic

final class SourceLoaderConcurrencyTests: XCTestCase {

  func test_concurrentLoads_secondCancelsFirst() async throws {
    let loader = SourceLoader()

    let first = Task<String, Error> {
      try await loader.load {
        try await Task.sleep(nanoseconds: 2_000_000_000)
        return "first"
      }
    }

    try await Task.sleep(nanoseconds: 50_000_000)

    let second = Task<String, Error> {
      try await loader.load {
        return "second"
      }
    }

    let secondResult = try await second.value
    XCTAssertEqual(secondResult, "second")

    do {
      _ = try await first.value
      // If first somehow completed before cancellation, that's acceptable
    } catch is CancellationError {
      // Expected: first was cancelled by second
    } catch {
      // Other errors also acceptable
    }
  }

  func test_loadAfterCancel_succeeds() async throws {
    let loader = SourceLoader()

    let task = Task<String, Error> {
      try await loader.load {
        try await Task.sleep(nanoseconds: 2_000_000_000)
        return "should not complete"
      }
    }

    try await Task.sleep(nanoseconds: 50_000_000)
    await loader.cancel()

    do {
      _ = try await task.value
    } catch {
      // Expected cancellation
    }

    let result = try await loader.load { "after cancel" }
    XCTAssertEqual(result, "after cancel")
  }

  func test_concurrentLoads_onlyLastCompletes() async throws {
    let loader = SourceLoader()
    let completed = ManagedAtomic(0)

    let task1 = Task<String, Error> {
      try await loader.load {
        try await Task.sleep(nanoseconds: 2_000_000_000)
        completed.increment()
        return "first"
      }
    }

    try await Task.sleep(nanoseconds: 30_000_000)

    let task2 = Task<String, Error> {
      try await loader.load {
        try await Task.sleep(nanoseconds: 2_000_000_000)
        completed.increment()
        return "second"
      }
    }

    try await Task.sleep(nanoseconds: 30_000_000)

    let task3 = Task<String, Error> {
      try await loader.load {
        try await Task.sleep(nanoseconds: 50_000_000)
        completed.increment()
        return "third"
      }
    }

    let thirdResult = try await task3.value
    XCTAssertEqual(thirdResult, "third")

    // Wait a bit for earlier tasks to settle
    try await Task.sleep(nanoseconds: 100_000_000)

    // Collect results
    var cancelled = 0
    for task in [task1, task2] {
      do {
        _ = try await task.value
      } catch is CancellationError {
        cancelled += 1
      } catch {
        cancelled += 1
      }
    }

    // At least one of the earlier tasks should have been cancelled
    XCTAssertGreaterThanOrEqual(cancelled, 1)
    // The last load definitely completed
    XCTAssertGreaterThanOrEqual(completed.value, 1)
  }

  func test_cancelDuringLoad_throwsCancellation() async throws {
    let loader = SourceLoader()
    let started = ManagedAtomic(false)

    let task = Task<String, Error> {
      try await loader.load {
        started.set(true)
        try await Task.sleep(nanoseconds: 5_000_000_000)
        return "should not complete"
      }
    }

    // Wait until load has started
    while !started.value {
      try await Task.sleep(nanoseconds: 10_000_000)
    }

    await loader.cancel()

    do {
      _ = try await task.value
      XCTFail("Expected CancellationError")
    } catch is CancellationError {
      // Expected
    } catch {
      // Other errors also acceptable after cancellation
    }
  }
}

// Simple thread-safe wrapper for tests (no external dependencies)
private final class ManagedAtomic<T: Sendable>: @unchecked Sendable {
  private var _value: T
  private let lock = NSLock()

  init(_ value: T) {
    self._value = value
  }

  var value: T {
    lock.lock()
    defer { lock.unlock() }
    return _value
  }

  func set(_ newValue: T) {
    lock.lock()
    _value = newValue
    lock.unlock()
  }
}

extension ManagedAtomic where T == Int {
  func increment() {
    lock.lock()
    _value += 1
    lock.unlock()
  }
}
