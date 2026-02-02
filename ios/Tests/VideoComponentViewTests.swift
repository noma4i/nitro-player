import XCTest
@testable import ReactNativeVideo

final class VideoComponentViewTests: XCTestCase {
  func testNitroIdRegistersViewInGlobalMap() {
    let view = VideoComponentView(frame: .zero)

    view.setNitroId(nitroId: 42)

    let resolved = VideoComponentView.globalViewsMap.object(forKey: 42)
    XCTAssertTrue(resolved === view)
  }

  func testKeepScreenAwakeWithoutPlayerIsFalse() {
    let view = VideoComponentView(frame: .zero)

    XCTAssertFalse(view.keepScreenAwake)
  }
}
