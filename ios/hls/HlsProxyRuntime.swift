import Foundation

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let defaultPort: Int = 18181
  private let prefetchDedupMs: TimeInterval = 60
  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.runtime-state")
  private let controller = HlsProxyServerController()

  private var port: Int = 18181
  private var isRegistered = false
  private var shouldBeRunning = false
  private var isExplicitlyStopped = false
  private var prefetchTimestamps: [String: Date] = [:]

  private init() {}

  func register() {
    let (resolvedPort, needsStart) = stateQueue.sync { () -> (Int, Bool) in
      let alreadyRunning = isRegistered && shouldBeRunning
      isRegistered = true
      shouldBeRunning = true
      isExplicitlyStopped = false
      return (port, !alreadyRunning)
    }
    guard needsStart else { return }
    _ = ensureControllerRunning(port: resolvedPort)
  }

  func start(port: Int?) {
    let (resolvedPort, shouldRestart) = stateQueue.sync { () -> (Int, Bool) in
      let previousPort = self.port
      let nextPort = (port ?? defaultPort) > 0 ? (port ?? defaultPort) : defaultPort
      self.port = nextPort
      isRegistered = true
      shouldBeRunning = true
      isExplicitlyStopped = false
      return (nextPort, previousPort != nextPort)
    }
    _ = ensureControllerRunning(port: resolvedPort, forceRestart: shouldRestart)
  }

  func stop() {
    stateQueue.sync {
      shouldBeRunning = false
      isExplicitlyStopped = true
    }
    runOnMainSync {
      controller.stop()
    }
  }

  func getProxiedUrl(url: String, headers: [String: String]?) -> String {
    let canUse = stateQueue.sync { isRegistered && shouldBeRunning && !isExplicitlyStopped }
    guard canUse else { return url }
    guard ensureControllerRunning(port: stateQueue.sync { port }) else { return url }
    return runOnMainSync {
      controller.proxiedManifestUrl(for: url, headers: headers) ?? url
    }
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    let canUse = stateQueue.sync { isRegistered && shouldBeRunning && !isExplicitlyStopped }
    guard canUse else { return }
    guard ensureControllerRunning(port: stateQueue.sync { port }) else { return }

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

    guard shouldPrefetch else { return }

    try await controller.prefetchFirstSegment(url: url, headers: headers)
  }

  func getCacheStats() -> [String: Any] {
    return runOnMainSync {
      controller.getCacheStats()
    }
  }

  func getStreamCacheStats(url: String) -> [String: Any] {
    return runOnMainSync {
      controller.getCacheStats(streamKey: url)
    }
  }

  func clearCache() {
    runOnMainSync {
      controller.clearCache()
    }
  }

  @discardableResult
  private func ensureControllerRunning(port: Int, forceRestart: Bool = false) -> Bool {
    return runOnMainSync {
      if !forceRestart && controller.isRunning {
        return true
      }
      controller.start(port: port)
      return controller.isRunning
    }
  }

  private func runOnMainSync<T>(_ work: () -> T) -> T {
    if Thread.isMainThread {
      return work()
    }
    return DispatchQueue.main.sync(execute: work)
  }
}
