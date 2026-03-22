import XCTest
@testable import NitroPlay

final class NitroPlayerComponentViewTests: XCTestCase {
  func testNitroIdRegistersViewInGlobalMap() {
    let view = NitroPlayerComponentView(frame: .zero)

    view.setNitroId(nitroId: 42)

    let resolved = NitroPlayerComponentView.globalViewsMap.object(forKey: 42)
    XCTAssertTrue(resolved === view)
  }

  func testKeepScreenAwakeWithoutPlayerIsFalse() {
    let view = NitroPlayerComponentView(frame: .zero)

    XCTAssertFalse(view.keepScreenAwake)
  }
}
