import CommonCrypto
import Foundation
import OSLog

private let cacheLogger = Logger(subsystem: "com.nitroplay.hls", category: "CacheStore")

final class HlsCacheStore {
  private var maxBytes: Int
  private let ttlSeconds: TimeInterval = 7 * 24 * 60 * 60
  private let cacheDir: URL
  private let indexUrl: URL
  private var index: [String: HlsCacheEntry] = [:]
  private let queue = DispatchQueue(label: "hls-cache-store")
  private var pendingSave: DispatchWorkItem?

  init(maxBytes: Int = HlsCacheBudget.defaultMaxBytes) {
    self.maxBytes = HlsCacheBudget.normalize(maxBytes)
    let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    cacheDir = base.appendingPathComponent("hls-cache", isDirectory: true)
    indexUrl = cacheDir.appendingPathComponent("index.json")
    loadIndex()
    ensureDir()
  }

  func setMaxBytes(_ bytes: Int) {
    queue.sync {
      maxBytes = HlsCacheBudget.normalize(bytes)
      evictIfNeeded()
      saveIndex()
    }
  }

  func get(url: String) -> Data? {
    guard let entry = queue.sync(execute: { index[url] }) else { return nil }
    if isExpired(entry) || !isSafeFileName(entry.fileName) {
      queue.async { [weak self] in
        self?.remove(url: url)
      }
      return nil
    }

    let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
    guard let data = try? Data(contentsOf: fileUrl),
          data.count > 0,
          data.count == entry.size
    else {
      queue.async { [weak self] in
        self?.remove(url: url)
      }
      return nil
    }

    queue.async { [weak self] in
      guard var current = self?.index[url] else { return }
      current.lastAccess = Date().timeIntervalSince1970
      self?.index[url] = current
      self?.scheduleSave()
    }

    return data
  }

  func put(url: String, data: Data, streamKey: String?) {
    queue.async {
      self.ensureDir()
      self.evictIfNeeded()
      let name = self.sha256(url) + ".seg"
      let fileUrl = self.cacheDir.appendingPathComponent(name)
      do {
        try data.write(to: fileUrl, options: .atomic)
        let entry = HlsCacheEntry(
          url: url,
          fileName: name,
          size: data.count,
          streamKey: streamKey,
          createdAt: Date().timeIntervalSince1970,
          lastAccess: Date().timeIntervalSince1970
        )
        self.index[url] = entry
        self.evictIfNeeded()
        self.scheduleSave()
      } catch {
        cacheLogger.error("Failed to write cache entry for \(url): \(error.localizedDescription)")
        return
      }
    }
  }

  func has(url: String) -> Bool {
    queue.sync {
      guard let entry = index[url] else { return false }
      if isExpired(entry) || !isSafeFileName(entry.fileName) {
        remove(url: url)
        return false
      }
      let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
      guard let size = fileSize(fileUrl), size > 0, size == entry.size else {
        remove(url: url)
        return false
      }
      return true
    }
  }

  func getFilePath(url: String) -> URL? {
    queue.sync {
      guard let entry = index[url] else { return nil }
      if isExpired(entry) || !isSafeFileName(entry.fileName) {
        remove(url: url)
        return nil
      }
      let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
      guard let size = fileSize(fileUrl), size > 0, size == entry.size else {
        remove(url: url)
        return nil
      }
      var current = entry
      current.lastAccess = Date().timeIntervalSince1970
      index[url] = current
      scheduleSave()
      return fileUrl
    }
  }

  func getCacheStats() -> [String: Any] {
    queue.sync {
      evictExpired()
      let totalSize = index.values.reduce(0) { $0 + $1.size }
      return [
        "totalSize": totalSize,
        "fileCount": index.count,
        "maxSize": maxBytes
      ]
    }
  }

  func getCacheStats(streamKey: String) -> [String: Any] {
    queue.sync {
      evictExpired()
      let totalSize = index.values.reduce(0) { $0 + $1.size }
      let streamEntries = index.values.filter { $0.streamKey == streamKey }
      return [
        "totalSize": totalSize,
        "fileCount": index.count,
        "maxSize": maxBytes,
        "streamSize": streamEntries.reduce(0) { $0 + $1.size },
        "streamFileCount": streamEntries.count
      ]
    }
  }

  func clearAll() {
    queue.sync {
      for entry in self.index.values {
        let fileUrl = self.cacheDir.appendingPathComponent(entry.fileName)
        try? FileManager.default.removeItem(at: fileUrl)
      }
      self.index.removeAll()
      // Sweep any orphan files (written but never indexed, or left by a crash) so
      // the directory matches the now-empty index.
      let urls = (try? FileManager.default.contentsOfDirectory(at: self.cacheDir, includingPropertiesForKeys: nil)) ?? []
      for url in urls where url.lastPathComponent != self.indexUrl.lastPathComponent {
        try? FileManager.default.removeItem(at: url)
      }
      self.saveIndex()
    }
  }

  func clearThumbnails() {
    queue.async {
      // Drop indexed thumbnails (deletes file + index entry) ...
      let indexedThumbs = self.index.values.filter { $0.fileName.hasSuffix(".thumb") }
      for entry in indexedThumbs {
        self.remove(url: entry.url)
      }
      // ... and sweep any legacy/un-indexed thumbnail files left on disk.
      let urls = (try? FileManager.default.contentsOfDirectory(at: self.cacheDir, includingPropertiesForKeys: nil)) ?? []
      urls
        .filter { $0.lastPathComponent.hasSuffix(".thumb") }
        .forEach { try? FileManager.default.removeItem(at: $0) }
      // Reconcile: drop any index entry whose backing file no longer exists.
      for entry in Array(self.index.values)
      where !FileManager.default.fileExists(atPath: self.cacheDir.appendingPathComponent(entry.fileName).path) {
        self.index.removeValue(forKey: entry.url)
      }
      // Persist immediately so the on-disk index never lags the cleared state.
      self.saveIndex()
    }
  }

  private func ensureDir() {
    if !FileManager.default.fileExists(atPath: cacheDir.path) {
      try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }
  }

  private func evictIfNeeded() {
    evictExpired()
    var total = index.values.reduce(0) { $0 + $1.size }
    guard total > maxBytes else { return }
    let target = HlsCacheBudget.evictionTarget(for: maxBytes)

    var streams: [String: [HlsCacheEntry]] = [:]
    for entry in index.values {
      let key = entry.streamKey ?? entry.url
      streams[key, default: []].append(entry)
    }
    let sorted = streams.sorted { stream1, stream2 in
      let oldest1 = stream1.value.map(\.lastAccess).min() ?? 0
      let oldest2 = stream2.value.map(\.lastAccess).min() ?? 0
      return oldest1 < oldest2
    }

    for (_, entries) in sorted {
      if total <= target { break }
      for entry in entries {
        remove(url: entry.url)
        total -= entry.size
      }
    }
  }

  private func evictExpired() {
    let now = Date().timeIntervalSince1970
    let entries = Array(index.values)
    for entry in entries where now - entry.createdAt > ttlSeconds {
      remove(url: entry.url)
    }
  }

  private func remove(url: String) {
    guard let entry = index[url] else { return }
    let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
    try? FileManager.default.removeItem(at: fileUrl)
    index.removeValue(forKey: url)
    scheduleSave()
  }

  private func isExpired(_ entry: HlsCacheEntry) -> Bool {
    let now = Date().timeIntervalSince1970
    return now - entry.createdAt > ttlSeconds
  }

  private func loadIndex() {
    guard let data = try? Data(contentsOf: indexUrl) else { return }
    if let decoded = try? JSONDecoder().decode([String: HlsCacheEntry].self, from: data) {
      index = decoded.filter { _, entry in
        guard isSafeFileName(entry.fileName),
              let size = fileSize(cacheDir.appendingPathComponent(entry.fileName))
        else {
          return false
        }
        return size > 0 && size == entry.size
      }
    } else {
      index = [:]
      try? FileManager.default.removeItem(at: indexUrl)
    }
  }

  private func scheduleSave() {
    pendingSave?.cancel()
    let work = DispatchWorkItem { [weak self] in
      self?.saveIndex()
    }
    pendingSave = work
    queue.asyncAfter(deadline: .now() + 5, execute: work)
  }

  private func saveIndex() {
    if let data = try? JSONEncoder().encode(index) {
      try? data.write(to: indexUrl, options: .atomic)
    }
  }

  private func sha256(_ input: String) -> String {
    let data = Data(input.utf8)
    var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes {
      _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
    }
    return hash.map { String(format: "%02x", $0) }.joined()
  }

  private func isSafeFileName(_ fileName: String) -> Bool {
    guard !fileName.isEmpty,
          fileName == (fileName as NSString).lastPathComponent,
          !fileName.contains("/"),
          !fileName.contains("\\"),
          !fileName.contains("..")
    else {
      return false
    }
    return true
  }

  private func fileSize(_ url: URL) -> Int? {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
          let size = attributes[.size] as? NSNumber
    else {
      return nil
    }
    return size.intValue
  }

  // Thumbnails share the segment index so they participate in the same TTL and
  // size eviction. They are keyed under a "thumb:" namespace to avoid colliding
  // with a segment cached under the same URL; the on-disk file keeps the plain
  // sha256(url).thumb name so previously written thumbnails still resolve.
  private func thumbnailKey(_ url: String) -> String { "thumb:\(url)" }

  func putThumbnail(url: String, data: Data) -> URL? {
    queue.sync {
      ensureDir()
      evictIfNeeded()
      let name = sha256(url) + ".thumb"
      let fileUrl = cacheDir.appendingPathComponent(name)
      do {
        try data.write(to: fileUrl, options: .atomic)
        let now = Date().timeIntervalSince1970
        let key = thumbnailKey(url)
        index[key] = HlsCacheEntry(
          url: key,
          fileName: name,
          size: data.count,
          streamKey: nil,
          createdAt: now,
          lastAccess: now
        )
        evictIfNeeded()
        scheduleSave()
        return fileUrl
      } catch {
        cacheLogger.error("Failed to write thumbnail for \(url): \(error.localizedDescription)")
        return nil
      }
    }
  }

  func getThumbnailPath(url: String) -> URL? {
    queue.sync {
      let name = sha256(url) + ".thumb"
      let fileUrl = cacheDir.appendingPathComponent(name)
      let key = thumbnailKey(url)
      if let entry = index[key] {
        if isExpired(entry) || !FileManager.default.fileExists(atPath: fileUrl.path) {
          remove(url: key)
          return nil
        }
        var current = entry
        current.lastAccess = Date().timeIntervalSince1970
        index[key] = current
        scheduleSave()
        return fileUrl
      }
      // Legacy thumbnail written before indexing: register it lazily so it now
      // participates in TTL/size eviction.
      guard FileManager.default.fileExists(atPath: fileUrl.path) else { return nil }
      let attrs = try? FileManager.default.attributesOfItem(atPath: fileUrl.path)
      let size = (attrs?[.size] as? Int) ?? 0
      let now = Date().timeIntervalSince1970
      index[key] = HlsCacheEntry(
        url: key,
        fileName: name,
        size: size,
        streamKey: nil,
        createdAt: now,
        lastAccess: now
      )
      scheduleSave()
      return fileUrl
    }
  }

  func hasThumbnail(url: String) -> Bool {
    queue.sync {
      let key = thumbnailKey(url)
      if let entry = index[key], isExpired(entry) {
        remove(url: key)
        return false
      }
      let name = sha256(url) + ".thumb"
      let fileUrl = cacheDir.appendingPathComponent(name)
      return FileManager.default.fileExists(atPath: fileUrl.path)
    }
  }
}

struct HlsCacheEntry: Codable {
  let url: String
  let fileName: String
  let size: Int
  let streamKey: String?
  let createdAt: TimeInterval
  var lastAccess: TimeInterval
}
