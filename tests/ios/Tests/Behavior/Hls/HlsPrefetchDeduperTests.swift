import XCTest
@testable import NitroPlayLogic

final class HlsPrefetchDeduperTests: XCTestCase {
  func testDuplicateInsideWindowIsSkipped() {
    var now = Date(timeIntervalSince1970: 1)
    let deduper = HlsPrefetchDeduper(window: 60, maxEntries: 500) { now }

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
    now = now.addingTimeInterval(1)

    XCTAssertFalse(deduper.shouldPrefetch(key: "stream-a"))
    XCTAssertEqual(deduper.size, 1)
  }

  func testStaleEntryCanPrefetchAgain() {
    var now = Date(timeIntervalSince1970: 1)
    let deduper = HlsPrefetchDeduper(window: 60, maxEntries: 500) { now }

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
    now = now.addingTimeInterval(61)

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
    XCTAssertEqual(deduper.size, 1)
  }

  func testFreshChurnIsHardCapped() {
    let deduper = HlsPrefetchDeduper(window: 60, maxEntries: 500) {
      Date(timeIntervalSince1970: 1)
    }

    for index in 0..<550 {
      XCTAssertTrue(deduper.shouldPrefetch(key: "stream-\(index)"))
    }

    XCTAssertEqual(deduper.size, 500)
  }

  func testStaleRefreshMovesKeyBehindOlderEntriesForEviction() {
    var now = Date(timeIntervalSince1970: 1)
    let deduper = HlsPrefetchDeduper(window: 60, maxEntries: 2) { now }

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-b"))
    now = now.addingTimeInterval(61)

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-c"))

    XCTAssertFalse(deduper.shouldPrefetch(key: "stream-a"))
    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-b"))
  }

  func testForgetAllowsImmediateRetryAfterFailure() {
    var now = Date(timeIntervalSince1970: 1)
    let deduper = HlsPrefetchDeduper(window: 60, maxEntries: 500) { now }

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
    now = now.addingTimeInterval(1)
    deduper.forget(key: "stream-a")

    XCTAssertTrue(deduper.shouldPrefetch(key: "stream-a"))
  }
}
