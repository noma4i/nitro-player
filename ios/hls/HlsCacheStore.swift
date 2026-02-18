import CommonCrypto
import Foundation

final class HlsCacheStore {
  private let maxBytes: Int = 5_368_709_120
  private let ttlSeconds: TimeInterval = 7 * 24 * 60 * 60
  private let cacheDir: URL
  private let indexUrl: URL
  private var index: [String: HlsCacheEntry] = [:]
  private let queue = DispatchQueue(label: "hls-cache-store")
  private var pendingSave: DispatchWorkItem?

  init() {
    let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    cacheDir = base.appendingPathComponent("hls-cache", isDirectory: true)
    indexUrl = cacheDir.appendingPathComponent("index.json")
    loadIndex()
    ensureDir()
  }

  func get(url: String) -> Data? {
    guard let entry = queue.sync(execute: { index[url] }) else { return nil }
    if isExpired(entry) {
      queue.async { [weak self] in
        self?.remove(url: url)
      }
      return nil
    }

    let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
    guard let data = try? Data(contentsOf: fileUrl) else {
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
        return
      }
    }
  }

  func has(url: String) -> Bool {
    queue.sync {
      guard let entry = index[url] else { return false }
      if isExpired(entry) {
        remove(url: url)
        return false
      }
      let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
      return FileManager.default.fileExists(atPath: fileUrl.path)
    }
  }

  func getFilePath(url: String) -> URL? {
    queue.sync {
      guard let entry = index[url] else { return nil }
      if isExpired(entry) {
        remove(url: url)
        return nil
      }
      let fileUrl = cacheDir.appendingPathComponent(entry.fileName)
      guard FileManager.default.fileExists(atPath: fileUrl.path) else {
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
    queue.async {
      for entry in self.index.values {
        let fileUrl = self.cacheDir.appendingPathComponent(entry.fileName)
        try? FileManager.default.removeItem(at: fileUrl)
      }
      self.index.removeAll()
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
    if total <= maxBytes { return }
    let entries = index.values.sorted { $0.lastAccess < $1.lastAccess }
    for entry in entries {
      if total <= maxBytes { break }
      remove(url: entry.url)
      total = index.values.reduce(0) { $0 + $1.size }
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
      index = decoded
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
}

struct HlsCacheEntry: Codable {
  let url: String
  let fileName: String
  let size: Int
  let streamKey: String?
  let createdAt: TimeInterval
  var lastAccess: TimeInterval
}
