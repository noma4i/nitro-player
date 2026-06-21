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

  func testClearAll_persistsBeforeReturning() {
    store.put(url: "https://cdn.example.com/clip.ts", data: Data(count: 40), streamKey: "s1")
    _ = store.getCacheStats()

    store.clearAll()

    let reloaded = HlsCacheStore()
    XCTAssertEqual(reloaded.getCacheStats()["fileCount"] as? Int, 0)
    XCTAssertNil(reloaded.getFilePath(url: "https://cdn.example.com/clip.ts"))
  }

  func testStaleZeroByteSegmentIsInvalidatedBeforePlayback() {
    let url = "https://cdn.example.com/stale-zero.ts"
    writeLegacySegmentIndex(url: url, fileName: "zero.seg", indexedSize: 64, bytes: Data())

    let reloaded = HlsCacheStore()

    XCTAssertNil(reloaded.getFilePath(url: url))
    XCTAssertFalse(reloaded.has(url: url))
    XCTAssertEqual(reloaded.getCacheStats()["fileCount"] as? Int, 0)
  }

  func testSizeMismatchSegmentIsInvalidatedBeforePlayback() {
    let url = "https://cdn.example.com/stale-partial.ts"
    writeLegacySegmentIndex(url: url, fileName: "partial.seg", indexedSize: 64, bytes: Data(count: 8))

    let reloaded = HlsCacheStore()

    XCTAssertNil(reloaded.getFilePath(url: url))
    XCTAssertNil(reloaded.get(url: url))
    XCTAssertEqual(reloaded.getCacheStats()["fileCount"] as? Int, 0)
  }

  func testUnsafeLegacyFileNameIsIgnoredAndRemoved() {
    let url = "https://cdn.example.com/unsafe.ts"
    writeLegacySegmentIndex(url: url, fileName: "../unsafe.seg", indexedSize: 8, bytes: Data(count: 8))

    let reloaded = HlsCacheStore()

    XCTAssertNil(reloaded.getFilePath(url: url))
    XCTAssertFalse(reloaded.has(url: url))
    XCTAssertEqual(reloaded.getCacheStats()["fileCount"] as? Int, 0)
  }

  func testCorruptIndexDoesNotCrashStoreInitialization() {
    let cacheDir = hlsCacheDir()
    try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    try? Data("{".utf8).write(to: cacheDir.appendingPathComponent("index.json"))

    let reloaded = HlsCacheStore()

    XCTAssertEqual(reloaded.getCacheStats()["fileCount"] as? Int, 0)
  }

  func testDefaultCacheBudgetIsFourGiB() {
    let stats = store.getCacheStats()

    XCTAssertEqual(stats["maxSize"] as? Int, HlsCacheBudget.defaultMaxBytes)
  }

  func testKtvEmptyCacheItemsAreReportedAsZeroFiles() {
    XCTAssertEqual(HlsKtvCacheStats.fileCount(from: Optional<[String]>.none), 0)
    XCTAssertEqual(HlsKtvCacheStats.fileCount(from: [String]()), 0)
  }

  func testSetMaxBytesClampsAndEvictsAfterSegmentWrite() {
    store.setMaxBytes(1)
    store.put(url: "https://cdn.example.com/first.ts", data: Data(count: 36 * 1_024 * 1_024), streamKey: "s1")
    store.put(url: "https://cdn.example.com/second.ts", data: Data(count: 36 * 1_024 * 1_024), streamKey: "s2")

    let stats = store.getCacheStats()

    XCTAssertEqual(stats["maxSize"] as? Int, HlsCacheBudget.minimumMaxBytes)
    XCTAssertLessThanOrEqual(stats["totalSize"] as? Int ?? Int.max, HlsCacheBudget.minimumMaxBytes)
    XCTAssertEqual(stats["fileCount"] as? Int, 1)
  }

  private func writeLegacySegmentIndex(url: String, fileName: String, indexedSize: Int, bytes: Data) {
    let cacheDir = hlsCacheDir()
    try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    try? bytes.write(to: cacheDir.appendingPathComponent(fileName), options: .atomic)
    let now = Date().timeIntervalSince1970
    let index = [
      url: HlsCacheEntry(
        url: url,
        fileName: fileName,
        size: indexedSize,
        streamKey: "stream",
        createdAt: now,
        lastAccess: now
      )
    ]
    let data = try! JSONEncoder().encode(index)
    try? data.write(to: cacheDir.appendingPathComponent("index.json"), options: .atomic)
  }

  private func hlsCacheDir() -> URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("hls-cache", isDirectory: true)
  }
}
