import AVKit
import XCTest
@testable import NitroPlay

final class HybridNitroPlayerViewManagerTests: XCTestCase {
  func testCanEnterPictureInPictureMatchesSystemCapability() throws {
    let view = NitroPlayerComponentView(frame: .zero)
    view.setNitroId(nitroId: 7)

    let manager = try HybridNitroPlayerViewManager(nitroId: 7)

    XCTAssertEqual(
      manager.canEnterPictureInPicture(),
      AVPictureInPictureController.isPictureInPictureSupported()
    )
  }
}
