import Foundation

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let defaultPort: Int = 18181
  private let prefetchDedupMs: TimeInterval = 60
  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.runtime-state")
  private let controller = HlsProxyServerController()

  private var port: Int = 18181
  private var didAutoStart = false
  private var isExplicitlyStopped = false
  private var prefetchTimestamps: [String: Date] = [:]

  private init() {}

  func start(port: Int?) {
    let resolvedPort = (port ?? defaultPort) > 0 ? (port ?? defaultPort) : defaultPort
    stateQueue.sync {
      self.port = resolvedPort
      self.isExplicitlyStopped = false
      self.didAutoStart = true
    }
    runOnMainSync {
      controller.start(port: resolvedPort)
    }
  }

  func stop() {
    stateQueue.sync {
      isExplicitlyStopped = true
      didAutoStart = false
    }
    runOnMainSync {
      controller.stop()
    }
  }

  func getProxiedUrl(url: String, headers: [String: String]?) -> String {
    ensureStarted()
    return runOnMainSync {
      controller.proxiedManifestUrl(for: url, headers: headers) ?? url
    }
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    ensureStarted()

    let shouldPrefetch = stateQueue.sync { () -> Bool in
      let now = Date()
      if let last = prefetchTimestamps[url], now.timeIntervalSince(last) < prefetchDedupMs {
        return false
      }
      prefetchTimestamps[url] = now
      if prefetchTimestamps.count > 500 {
        prefetchTimestamps = prefetchTimestamps.filter { now.timeIntervalSince($0.value) < prefetchDedupMs }
      }
      return true
    }

    guard shouldPrefetch else {
      return
    }

    try await controller.prefetchFirstSegment(url: url, headers: headers)
  }

  func getCacheStats() -> [String: Any] {
    ensureStarted()
    return runOnMainSync {
      controller.getCacheStats()
    }
  }

  func getStreamCacheStats(url: String) -> [String: Any] {
    ensureStarted()
    return runOnMainSync {
      controller.getCacheStats(streamKey: url)
    }
  }

  func getThumbnailUrl(url: String, headers: [String: String]?) async -> String? {
    ensureStarted()
    return await controller.getThumbnailUrl(for: url, headers: headers)
  }

  func clearCache() {
    runOnMainSync {
      controller.clearCache()
    }
  }

  private func ensureStarted() {
    let shouldStart = stateQueue.sync { () -> Bool in
      guard !isExplicitlyStopped else {
        return false
      }
      if didAutoStart {
        return false
      }
      didAutoStart = true
      return true
    }

    if shouldStart {
      runOnMainSync {
        controller.start(port: port)
      }
    }
  }

  private func runOnMainSync<T>(_ work: () -> T) -> T {
    if Thread.isMainThread {
      return work()
    }
    return DispatchQueue.main.sync(execute: work)
  }
}
