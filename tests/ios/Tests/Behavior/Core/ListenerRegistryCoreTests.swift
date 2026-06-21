import XCTest
@testable import NitroPlayLogic

final class ListenerRegistryCoreTests: XCTestCase {
  // Locks in the lifetime contract behind the iOS EXC_BAD_ACCESS fix (Sentry
  // YUPIV3-TN): a listener removed mid-emit must NOT be invoked, because its JS
  // owner may already be gone. iOS twin of the Kotlin ListenerRegistryRemovalTest.
  // With the old snapshot-then-invoke registry, "B" would still be called.
  func test_listenerRemovedDuringEmit_isNotInvoked() {
    let core = ListenerRegistryCore()
    var calls: [String] = []
    var idB: UUID?

    _ = core.add(event: "e", listener: {
      calls.append("A")
      if let idB { core.remove(id: idB) }
    } as () -> Void)
    idB = core.add(event: "e", listener: { calls.append("B") } as () -> Void)

    core.emit(event: "e") { (callback: () -> Void) in callback() }

    XCTAssertEqual(calls, ["A"])
  }

  func test_add_emit_invokesListener() {
    let core = ListenerRegistryCore()
    var count = 0
    _ = core.add(event: "e", listener: { count += 1 } as () -> Void)
    core.emit(event: "e") { (callback: () -> Void) in callback() }
    XCTAssertEqual(count, 1)
  }

  func test_remove_preventsInvocation() {
    let core = ListenerRegistryCore()
    var count = 0
    let id = core.add(event: "e", listener: { count += 1 } as () -> Void)
    core.remove(id: id)
    core.emit(event: "e") { (callback: () -> Void) in callback() }
    XCTAssertEqual(count, 0)
  }

  func test_clearAll_removesAllListeners() {
    let core = ListenerRegistryCore()
    var count = 0
    _ = core.add(event: "e", listener: { count += 1 } as () -> Void)
    _ = core.add(event: "e", listener: { count += 1 } as () -> Void)
    core.clearAll()
    core.emit(event: "e") { (callback: () -> Void) in callback() }
    XCTAssertEqual(count, 0)
    XCTAssertFalse(core.hasListeners(event: "e"))
  }

  func test_emit_onlyTargetsMatchingEvent() {
    let core = ListenerRegistryCore()
    var a = 0
    var b = 0
    _ = core.add(event: "a", listener: { a += 1 } as () -> Void)
    _ = core.add(event: "b", listener: { b += 1 } as () -> Void)
    core.emit(event: "a") { (callback: () -> Void) in callback() }
    XCTAssertEqual(a, 1)
    XCTAssertEqual(b, 0)
  }
}
