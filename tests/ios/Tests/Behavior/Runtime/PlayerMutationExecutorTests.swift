import XCTest
@testable import NitroPlayLogic

final class PlayerMutationExecutorTests: XCTestCase {
  func testRunAndWaitExecutesOffMainWhenSubmittedFromMain() async {
    let executor = PlayerMutationExecutor(label: "com.nitroplay.tests.player-mutation.main")
    let completed = expectation(description: "executor completed")
    let capture = ThreadCapture()

    DispatchQueue.main.async {
      Task {
        await executor.runAndWait {
          capture.set(Thread.isMainThread)
        }
        completed.fulfill()
      }
    }

    await fulfillment(of: [completed], timeout: 2)
    XCTAssertEqual(capture.value, false)
  }

  func testRunAndWaitExecutesOffMainWhenSubmittedFromBackground() async {
    let executor = PlayerMutationExecutor(label: "com.nitroplay.tests.player-mutation.background")
    let capture = ThreadCapture()

    await executor.runAndWait {
      capture.set(Thread.isMainThread)
    }

    XCTAssertEqual(capture.value, false)
  }

  func testRunAndWaitPreservesSerialOrdering() async {
    let executor = PlayerMutationExecutor(label: "com.nitroplay.tests.player-mutation.order")
    let values = LockedArray<Int>()

    await executor.runAndWait {
      values.append(1)
    }
    await executor.runAndWait {
      values.append(2)
    }

    XCTAssertEqual(values.snapshot, [1, 2])
  }
}

private final class ThreadCapture: @unchecked Sendable {
  private let lock = NSLock()
  private var capturedValue: Bool?

  var value: Bool? {
    lock.withLock {
      capturedValue
    }
  }

  func set(_ value: Bool) {
    lock.withLock {
      capturedValue = value
    }
  }
}

private final class LockedArray<Element>: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [Element] = []

  var snapshot: [Element] {
    lock.withLock {
      values
    }
  }

  func append(_ value: Element) {
    lock.withLock {
      values.append(value)
    }
  }
}
