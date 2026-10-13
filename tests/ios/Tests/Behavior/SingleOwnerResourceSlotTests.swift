@testable import NitroPlaySupportCore
import XCTest

final class SingleOwnerResourceSlotTests: XCTestCase {
  private final class Resource {}

  func testReplaceReleasesPreviousOwnerOnly() {
    var released: [Resource] = []
    let slot = SingleOwnerResourceSlot<Resource> { released.append($0) }
    let first = Resource()
    let second = Resource()

    XCTAssertNil(slot.replace(first))
    XCTAssertTrue(slot.replace(second) === first)

    XCTAssertEqual(released.count, 1)
    XCTAssertTrue(released[0] === first)
    XCTAssertTrue(slot.current === second)
  }

  func testTakeAndSwapDoNotRelease() {
    var releaseCount = 0
    let slot = SingleOwnerResourceSlot<Resource> { _ in releaseCount += 1 }
    let first = Resource()
    let second = Resource()
    slot.swap(first)

    XCTAssertTrue(slot.swap(second) === first)
    XCTAssertTrue(slot.take() === second)

    XCTAssertNil(slot.current)
    XCTAssertEqual(releaseCount, 0)
  }

  func testClearReleasesCurrentOwnerOnce() {
    var releaseCount = 0
    let slot = SingleOwnerResourceSlot<Resource> { _ in releaseCount += 1 }
    slot.swap(Resource())

    XCTAssertNotNil(slot.clear())
    XCTAssertNil(slot.clear())

    XCTAssertEqual(releaseCount, 1)
  }
}
