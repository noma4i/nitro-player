import XCTest
@testable import NitroPlayLogic

final class PreviewRequestCoordinatorTests: XCTestCase {
  private final class CountingJob: CancellablePreviewTask, @unchecked Sendable {
    typealias Output = String

    let valueResult: String?
    private(set) var cancelCount = 0
    private(set) var valueCount = 0

    init(_ valueResult: String?) {
      self.valueResult = valueResult
    }

    func value() async -> String? {
      valueCount += 1
      return valueResult
    }

    func cancel() {
      cancelCount += 1
    }
  }

  private final class DelayedReturnAfterCancelJob: CancellablePreviewTask, @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<String?, Never>?
    private(set) var cancelCount = 0

    func value() async -> String? {
      await withCheckedContinuation { continuation in
        lock.lock()
        self.continuation = continuation
        lock.unlock()
      }
    }

    func cancel() {
      lock.lock()
      cancelCount += 1
      let pending = continuation
      continuation = nil
      lock.unlock()
      pending?.resume(returning: "stale-frame")
    }
  }

  func testAcquireCoalescesSameKeyIntoOneJob() async {
    let coordinator = PreviewRequestCoordinator<String>()
    let job = CountingJob("frame-a")
    var executions = 0

    let first = coordinator.acquire(key: "video-a") {
      executions += 1
      return job
    }
    let second = coordinator.acquire(key: "video-a") {
      executions += 1
      return CountingJob("wrong-frame")
    }

    let firstValue = await first.value()
    let secondValue = await second.value()
    XCTAssertEqual(firstValue, "frame-a")
    XCTAssertEqual(secondValue, "frame-a")
    first.cancel()
    second.cancel()

    XCTAssertEqual(executions, 1)
    XCTAssertEqual(job.cancelCount, 1)
  }

  func testAcquireDoesNotCoalesceDifferentKeys() async {
    let coordinator = PreviewRequestCoordinator<String>()
    var executions = 0

    let first = coordinator.acquire(key: "video-a") {
      executions += 1
      return CountingJob("frame-a")
    }
    let second = coordinator.acquire(key: "video-b") {
      executions += 1
      return CountingJob("frame-b")
    }

    let firstValue = await first.value()
    let secondValue = await second.value()
    XCTAssertEqual(firstValue, "frame-a")
    XCTAssertEqual(secondValue, "frame-b")
    first.cancel()
    second.cancel()
    XCTAssertEqual(executions, 2)
  }

  func testCancelKeepsSharedJobAliveUntilLastWaiterCancels() async {
    let coordinator = PreviewRequestCoordinator<String>()
    let job = CountingJob("frame-a")
    let first = coordinator.acquire(key: "video-a") { job }
    let second = coordinator.acquire(key: "video-a") { CountingJob("wrong-frame") }

    first.cancel()

    XCTAssertFalse(second.isCancelled)
    XCTAssertEqual(job.cancelCount, 0)
    let secondValue = await second.value()
    XCTAssertEqual(secondValue, "frame-a")
    second.cancel()
    XCTAssertEqual(job.cancelCount, 1)
  }

  func testCancelLastWaiterCancelsSharedJobAndRemovesEntry() async {
    let coordinator = PreviewRequestCoordinator<String>()
    let job = CountingJob("late-frame")
    let request = coordinator.acquire(key: "video-a") { job }

    request.cancel()

    XCTAssertTrue(request.isCancelled)
    XCTAssertEqual(coordinator.inflightCount, 0)
    XCTAssertEqual(job.cancelCount, 1)

    let next = coordinator.acquire(key: "video-a") { CountingJob("new-frame") }
    let nextValue = await next.value()
    XCTAssertEqual(nextValue, "new-frame")
    next.cancel()
  }

  func testCancelAllCancelsEveryInflightJobAndAwaitDoesNotDeliver() async {
    let coordinator = PreviewRequestCoordinator<String>()
    let firstJob = CountingJob("late-a")
    let secondJob = CountingJob("late-b")
    let first = coordinator.acquire(key: "video-a") { firstJob }
    let second = coordinator.acquire(key: "video-b") { secondJob }

    XCTAssertEqual(coordinator.inflightCount, 2)
    coordinator.cancelAll()

    XCTAssertEqual(coordinator.inflightCount, 0)
    let firstValue = await first.value()
    let secondValue = await second.value()
    XCTAssertNil(firstValue)
    XCTAssertNil(secondValue)
    XCTAssertEqual(firstJob.cancelCount, 1)
    XCTAssertEqual(secondJob.cancelCount, 1)
  }

  func testCancelAllDuringAwaitDoesNotDeliverJobResult() async {
    let coordinator = PreviewRequestCoordinator<String>()
    let job = DelayedReturnAfterCancelJob()
    let request = coordinator.acquire(key: "video-a") { job }

    async let value = request.value()
    await Task.yield()
    coordinator.cancelAll()

    let resolved = await value
    XCTAssertNil(resolved)
    XCTAssertEqual(job.cancelCount, 1)
  }

  func testAwaitAfterCancelReturnsNil() async {
    let coordinator = PreviewRequestCoordinator<String>()
    let request = coordinator.acquire(key: "video-a") { CountingJob("frame-a") }

    request.cancel()

    let value = await request.value()
    XCTAssertNil(value)
  }
}
