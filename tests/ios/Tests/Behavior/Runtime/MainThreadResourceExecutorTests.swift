import XCTest
@testable import NitroPlayLogic

final class MainThreadResourceExecutorTests: XCTestCase {
  func testBackgroundCallerExecutesResourceOperationOnMainThread() {
    let executor = MainThreadResourceExecutor()
    let completed = expectation(description: "background caller completed")

    DispatchQueue.global(qos: .userInitiated).async {
      let ranOnMainThread = executor.run {
        Thread.isMainThread
      }

      XCTAssertTrue(ranOnMainThread)
      completed.fulfill()
    }

    wait(for: [completed], timeout: 2)
  }

  func testMainThreadCallerRunsInline() {
    let executor = MainThreadResourceExecutor()

    XCTAssertTrue(executor.run { Thread.isMainThread })
  }
}
