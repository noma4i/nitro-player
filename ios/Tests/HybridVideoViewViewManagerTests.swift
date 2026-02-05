import AVKit
import XCTest
@testable import JustPlayer

final class HybridVideoViewViewManagerTests: XCTestCase {
  func testCanEnterPictureInPictureMatchesSystemCapability() throws {
    let view = VideoComponentView(frame: .zero)
    view.setNitroId(nitroId: 7)

    let manager = try HybridVideoViewViewManager(nitroId: 7)

    XCTAssertEqual(
      manager.canEnterPictureInPicture(),
      AVPictureInPictureController.isPictureInPictureSupported()
    )
  }
}
