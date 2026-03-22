import XCTest
@testable import NitroPlayLogic

final class WeakTests: XCTestCase {
  private class Dummy {}

  func testValueReturnsStoredObject() {
    let obj = Dummy()
    let weak = Weak(value: obj)
    XCTAssertTrue(weak.value === obj)
  }

  func testValueReturnsNilAfterDeallocation() {
    var obj: Dummy? = Dummy()
    let weak = Weak(value: obj!)
    obj = nil
    XCTAssertNil(weak.value)
  }

  func testMultipleWeakRefsToSameObject() {
    let obj = Dummy()
    let w1 = Weak(value: obj)
    let w2 = Weak(value: obj)
    XCTAssertTrue(w1.value === w2.value)
  }

  func testWeakWithDifferentObjects() {
    let a = Dummy()
    let b = Dummy()
    let wa = Weak(value: a)
    let wb = Weak(value: b)
    XCTAssertFalse(wa.value === wb.value)
  }
}
