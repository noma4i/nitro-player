import Foundation

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let prefetchDedupMs: TimeInterval = 60
  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.runtime-state")
  private let controller = HlsProxyServerController()
  private let runtimeState = HlsProxyRuntimeState()

  private var port: Int = 18181
  private var prefetchTimestamps: [String: Date] = [:]

  private init() {}

  func register() {
    let resolvedPort = stateQueue.sync { () -> Int in
      self.port = runtimeState.register()
      return self.port
    }
    _ = ensureControllerRunning(port: resolvedPort)
  }

  func start(port: Int?) {
    let (resolvedPort, shouldRestart) = stateQueue.sync { () -> (Int, Bool) in
      let previousPort = self.port
      self.port = runtimeState.start(port: port)
      return (self.port, previousPort != self.port)
    }
    _ = ensureControllerRunning(port: resolvedPort, forceRestart: shouldRestart)
  }

  func stop() {
    stateQueue.sync {
      runtimeState.stop()
    }
    runOnMainSync {
      controller.stop()
    }
  }

  func getProxiedUrl(url: String, headers: [String: String]?) -> String {
    guard ensureRuntimeAvailableForUse() else {
      return url
    }
    return runOnMainSync {
      controller.proxiedManifestUrl(for: url, headers: headers) ?? url
    }
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    guard ensureRuntimeAvailableForUse() else {
      return
    }

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

  private func ensureRuntimeAvailableForUse() -> Bool {
    let shouldStart = stateQueue.sync { runtimeState.shouldEnsureRunningForUse() }
    guard shouldStart else {
      return false
    }
    return ensureControllerRunning(port: stateQueue.sync { port })
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
