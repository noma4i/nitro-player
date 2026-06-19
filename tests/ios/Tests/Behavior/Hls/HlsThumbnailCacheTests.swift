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

  func testClearThumbnails_persistsClearedIndexToDisk() {
    _ = store.putThumbnail(url: "https://cdn.example.com/poster.jpg", data: Data(count: 64))
    store.clearThumbnails()
    _ = store.getCacheStats()  // drains the serial queue so the async clear + saveIndex finished

    // A fresh store reloads index.json from disk; the cleared state must already
    // be persisted (clearThumbnails flushes immediately, not on the 5s debounce).
    let reloaded = HlsCacheStore()
    XCTAssertEqual(reloaded.getCacheStats()["fileCount"] as? Int, 0)
    XCTAssertFalse(reloaded.hasThumbnail(url: "https://cdn.example.com/poster.jpg"))
  }

  func testClearAll_sweepsOrphanFilesFromDisk() {
    _ = store.getCacheStats()  // ensure setUp's async clears completed before planting the orphan

    let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("hls-cache", isDirectory: true)
    try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    let orphan = cacheDir.appendingPathComponent("orphan.bin")
    try? Data(count: 16).write(to: orphan)
    store.put(url: "https://cdn.example.com/clip.ts", data: Data(count: 40), streamKey: "s1")

    store.clearAll()
    _ = store.getCacheStats()  // drain the queue

    XCTAssertFalse(FileManager.default.fileExists(atPath: orphan.path), "orphan must be swept")
    XCTAssertEqual(store.getCacheStats()["fileCount"] as? Int, 0)
  }
}
