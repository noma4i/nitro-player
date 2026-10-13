@testable import NitroPlayRuntimeCore
import XCTest

final class PlaybackSuspensionRegistryTests: XCTestCase {
  private final class Recorder {
    var acquired: [String] = []
    var released: [String] = []
    lazy var registry = PlaybackSuspensionRegistry { [unowned self] key, groups in
      let label = "\(key):\((groups ?? []).joined(separator: ","))"
      self.acquired.append(label)
      return { self.released.append(label) }
    }
  }

  func testActiveSetAcquiresOnceAndInactiveSetReleases() {
    let recorder = Recorder()

    recorder.registry.set(key: "modal", active: true)
    recorder.registry.set(key: "modal", active: true)
    XCTAssertEqual(recorder.acquired, ["modal:"])

    recorder.registry.set(key: "modal", active: false)
    recorder.registry.set(key: "modal", active: false)
    XCTAssertEqual(recorder.released, ["modal:"])
  }

  func testChangedAllowGroupsAcquireReplacementBeforeReleasingOldOne() {
    let recorder = Recorder()
    recorder.registry.set(key: "modal", active: true, allowGroups: ["a"])

    recorder.registry.set(key: "modal", active: true, allowGroups: ["b"])

    XCTAssertEqual(recorder.acquired, ["modal:a", "modal:b"])
    XCTAssertEqual(recorder.released, ["modal:a"])
  }

  func testAllowGroupsAreNormalizedSoOrderAndDuplicatesDoNotReacquire() {
    let recorder = Recorder()
    recorder.registry.set(key: "k", active: true, allowGroups: ["b", "a", "a"])

    recorder.registry.set(key: "k", active: true, allowGroups: ["a", "b"])

    XCTAssertEqual(recorder.acquired, ["k:a,b"])
    XCTAssertEqual(recorder.registry.snapshot().entries.first?.allowGroups ?? [], ["a", "b"])
  }

  func testClearByPrefixReleasesOnlyMatchingKeys() {
    let recorder = Recorder()
    recorder.registry.set(key: "feed:1", active: true)
    recorder.registry.set(key: "feed:2", active: true)
    recorder.registry.set(key: "hero", active: true)

    recorder.registry.clear(keyPrefix: "feed:")

    XCTAssertEqual(recorder.released, ["feed:1:", "feed:2:"])
    XCTAssertEqual(recorder.registry.snapshot().entries.map(\.key), ["hero"])
  }
}
