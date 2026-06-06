import XCTest
@testable import NitroPlayLogic

/// NP-MEMORY-05: thumbnails must be registered in the cache index so they take
/// part in the same TTL and size eviction as segments. Exercises the real
/// HlsCacheStore. Parity counterpart: HlsThumbnailCacheTest.kt on Android.
final class HlsThumbnailCacheTests: XCTestCase {
  var store: HlsCacheStore!

  override func setUp() {
    super.setUp()
    store = HlsCacheStore()
    store.clearAll()
    store.clearThumbnails()
  }

  override func tearDown() {
    store.clearAll()
    store.clearThumbnails()
    store = nil
    super.tearDown()
  }

  func testPutThumbnail_registersEntryInIndex() {
    let path = store.putThumbnail(url: "https://cdn.example.com/poster.jpg", data: Data(count: 128))
    XCTAssertNotNil(path)

    let stats = store.getCacheStats()
    XCTAssertEqual(stats["fileCount"] as? Int, 1)
    XCTAssertEqual(stats["totalSize"] as? Int, 128)
  }

  func testClearThumbnails_removesIndexEntryAndFile() {
    _ = store.putThumbnail(url: "https://cdn.example.com/poster.jpg", data: Data(count: 64))

    store.clearThumbnails()

    let stats = store.getCacheStats()
    XCTAssertEqual(stats["fileCount"] as? Int, 0)
    XCTAssertNil(store.getThumbnailPath(url: "https://cdn.example.com/poster.jpg"))
    XCTAssertFalse(store.hasThumbnail(url: "https://cdn.example.com/poster.jpg"))
  }

  func testGetThumbnailPath_returnsStoredFile() {
    let url = "https://cdn.example.com/poster.jpg"
    let written = store.putThumbnail(url: url, data: Data(count: 32))

    let resolved = store.getThumbnailPath(url: url)

    XCTAssertNotNil(resolved)
    XCTAssertEqual(written, resolved)
    XCTAssertTrue(store.hasThumbnail(url: url))
  }

  func testThumbnailAndSegment_coexistWithoutCollision() {
    let url = "https://cdn.example.com/clip.ts"
    store.put(url: url, data: Data(count: 100), streamKey: "stream1")
    _ = store.putThumbnail(url: url, data: Data(count: 50))

    // The "thumb:" namespace keeps the two entries distinct even for the same URL.
    let stats = store.getCacheStats()
    XCTAssertEqual(stats["fileCount"] as? Int, 2)
    XCTAssertEqual(stats["totalSize"] as? Int, 150)
    XCTAssertNotNil(store.getFilePath(url: url))
    XCTAssertNotNil(store.getThumbnailPath(url: url))
  }
}
