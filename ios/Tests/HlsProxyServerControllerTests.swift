import XCTest
@testable import JustPlayer

final class HlsProxyServerControllerTests: XCTestCase {
  func testCacheStatsContainExpectedKeys() {
    let controller = HlsProxyServerController()

    let stats = controller.getCacheStats()

    XCTAssertNotNil(stats["totalSize"])
    XCTAssertNotNil(stats["fileCount"])
    XCTAssertNotNil(stats["maxSize"])
  }
}
