import XCTest
@testable import NitroPlayLogic

final class SingleOwnerResourceSlotTests: XCTestCase {
  private final class Resource {
    var stopCount = 0
  }

  func testReplaceStopsPreviousResourceAndKeepsLatest() {
    let slot = SingleOwnerResourceSlot<Resource> { $0.stopCount += 1 }
    let first = Resource()
    let second = Resource()

    let previous = slot.replace(first)
    XCTAssertNil(previous)

    let replaced = slot.replace(second)

    XCTAssertTrue(replaced === first)
    XCTAssertTrue(slot.current === second)
    XCTAssertEqual(first.stopCount, 1)
    XCTAssertEqual(second.stopCount, 0)
  }

  func testClearOnlyStopsCurrentResourceOnce() {
    let slot = SingleOwnerResourceSlot<Resource> { $0.stopCount += 1 }
    let first = Resource()
    let second = Resource()

    _ = slot.replace(first)
    _ = slot.replace(second)
    slot.clear()
    slot.clear()

    XCTAssertEqual(first.stopCount, 1)
    XCTAssertEqual(second.stopCount, 1)
    XCTAssertNil(slot.current)
  }
}
