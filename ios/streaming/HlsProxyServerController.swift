import Foundation

final class HlsProxyServerController: NSObject {
  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.ktv-proxy-state")
  private var cacheMaxBytes = HlsCacheBudget.defaultMaxBytes
  private var shouldBeRunning = false
  private var boundPort = 0
  private var routeGeneration = 0
  private var needsHealthCheck = true
  private var isRecovering = false
  private var pendingRecoveryCompletions: [() -> Void] = []
  private let recoveryQueue = DispatchQueue(label: "com.nitroplay.hls.transport-recovery")

  var currentRouteGeneration: Int {
    stateQueue.sync { routeGeneration }
  }

  /// Non-blocking readiness snapshot. Never performs the blocking probe.
  func readiness() -> HlsTransportReadiness {
    let state = stateQueue.sync { (shouldBeRunning, needsHealthCheck, boundPort) }
    guard state.0 else {
      return .stopped
    }
    guard !state.1, state.2 > 0, KTVHTTPCache.proxyIsRunning() else {
      return .unhealthy
    }
    return .ready
  }

  func start(port: Int?) -> Int? {
    let resolvedPort = max(0, port ?? 0)
    stateQueue.sync {
      shouldBeRunning = true
    }
    guard restartListener(preferredPort: resolvedPort) else {
      return nil
    }
    let port = currentBoundPort()
    stateQueue.sync {
      boundPort = port
      needsHealthCheck = port <= 0
    }
    return port > 0 ? port : nil
  }

  func stop() {
    stateQueue.sync {
      shouldBeRunning = false
      needsHealthCheck = true
      boundPort = 0
    }
    KTVHTTPCache.proxyStop()
  }

  func configureCache(maxBytes: Int64) {
    stateQueue.sync {
      cacheMaxBytes = maxBytes
    }
  }

  func proxiedManifestUrl(for url: String) -> String? {
    stateQueue.sync {
      shouldBeRunning = true
    }

    guard case .ready = readiness() else {
      recoverIfNeeded()
      return nil
    }

    guard let originalURL = URL(string: url),
          let proxyURL = KTVHTTPCache.proxyURL(withOriginalURL: originalURL, bindToLocalhost: true),
          proxyURL != originalURL else {
      return nil
    }
    return proxyURL.absoluteString
  }

  func purgeCache(url: String, headers: [String: String]?) {
    guard let originalURL = URL(string: url) else {
      return
    }
    let namespace = HlsRequestIdentity.cacheNamespace(url: url, headers: headers)
    let cacheURL = KTVHTTPCache.cacheURL(withOriginalURL: originalURL, namespace: namespace)
    KTVHTTPCache.cacheDelete(with: cacheURL)
    KTVHTTPCache.logCleanError(for: cacheURL)
    let stem = Self.streamStem(from: url)
    guard !stem.isEmpty else {
      return
    }
    for item in KTVHTTPCache.cacheAllCacheItems() {
      guard let itemURL = item.url else {
        continue
      }
      if Self.streamStem(from: itemURL.absoluteString) == stem,
         KTVHTTPCache.cacheURL(itemURL, belongsToNamespace: namespace) {
        KTVHTTPCache.cacheDelete(with: itemURL)
        KTVHTTPCache.logCleanError(for: itemURL)
      }
    }
  }

  func cacheStats() -> (totalBytes: Int64, fileCount: Int, maxBytes: Int64) {
    (
      totalBytes: KTVHTTPCache.cacheTotalCacheLength(),
      fileCount: KTVHTTPCache.cacheAllCacheItems().count,
      maxBytes: KTVHTTPCache.cacheMaxCacheLength()
    )
  }

  func clearCache() {
    KTVHTTPCache.cacheDeleteAllCaches()
  }

  /// Probes the transport off the main thread and restarts it when the probe fails.
  /// `completion` is always invoked on the main thread. When a pass is already running, the
  /// completion joins that pass instead of reporting a stale snapshot.
  func recoverIfNeeded(completion: (() -> Void)? = nil) {
    let decision = stateQueue.sync { () -> (shouldRun: Bool, joined: Bool) in
      guard shouldBeRunning else {
        return (false, false)
      }
      if let completion {
        pendingRecoveryCompletions.append(completion)
      }
      if isRecovering {
        return (false, true)
      }
      isRecovering = true
      return (true, false)
    }

    if decision.joined {
      return
    }

    guard decision.shouldRun else {
      flushRecoveryCompletions()
      completion.map { pending in
        DispatchQueue.main.async {
          pending()
        }
      }
      return
    }

    recoveryQueue.async { [weak self] in
      guard let self else {
        return
      }
      self.performRecovery()
      self.stateQueue.sync {
        self.isRecovering = false
      }
      self.flushRecoveryCompletions()
    }
  }

  private func flushRecoveryCompletions() {
    let completions = stateQueue.sync { () -> [() -> Void] in
      let pending = pendingRecoveryCompletions
      pendingRecoveryCompletions.removeAll()
      return pending
    }
    guard !completions.isEmpty else {
      return
    }
    DispatchQueue.main.async {
      completions.forEach { $0() }
    }
  }

  private func performRecovery() {
    let healthy = KTVHTTPCache.proxyIsRunning() && KTVHTTPCache.proxyPing()
    if healthy {
      let port = currentBoundPort()
      stateQueue.sync {
        if port > 0 {
          boundPort = port
        }
        needsHealthCheck = false
      }
      return
    }

    let previousPort = stateQueue.sync { boundPort }
    restartListener(preferredPort: previousPort)
    let port = currentBoundPort()
    stateQueue.sync {
      let changed = port > 0 && port != previousPort
      if changed {
        routeGeneration += 1
      }
      if port > 0 {
        boundPort = port
      }
      needsHealthCheck = port <= 0
    }
  }

  deinit {
    KTVHTTPCache.proxyStop()
  }

  /// Marks the transport as requiring an application-level probe before it is trusted again.
  /// Called by the single lifecycle owner when the process may have been suspended.
  func markNeedsHealthCheck() {
    stateQueue.sync {
      needsHealthCheck = true
    }
  }

  @discardableResult
  private func restartListener(preferredPort: Int) -> Bool {
    if KTVHTTPCache.proxyIsRunning() {
      KTVHTTPCache.proxyStop()
    }

    KTVHTTPCache.proxySetPort(UInt16(max(0, preferredPort)))
    KTVHTTPCache.downloadSetWhitelistHeaderKeys([
      "Authorization",
      "Cookie",
      "User-Agent",
      "Connection",
      "Accept",
      "Accept-Encoding",
      "Accept-Language",
      "Range"
    ])
    KTVHTTPCache.downloadSetTimeoutInterval(30)
    KTVHTTPCache.logSetConsoleLogEnable(false)
    KTVHTTPCache.cacheSetMaxCacheLength(stateQueue.sync { cacheMaxBytes })

    if startProxy() {
      return true
    }
    guard preferredPort != 0 else {
      return false
    }
    KTVHTTPCache.proxySetPort(0)
    return startProxy()
  }

  private func startProxy() -> Bool {
    do {
      try KTVHTTPCache.proxyStart()
      return KTVHTTPCache.proxyIsRunning()
    } catch {
      return false
    }
  }

  private func currentBoundPort() -> Int {
    let probeURL = URL(string: "https://localhost/nitro-play-port-probe.m3u8")
    return KTVHTTPCache.proxyURL(withOriginalURL: probeURL, bindToLocalhost: true)?.port ?? -1
  }

  private static func streamStem(from url: String) -> String {
    let fileName = URL(string: url)?.lastPathComponent ?? String(url.split(separator: "/").last ?? "")
    guard let hlsRange = fileName.range(of: "-hls", options: .caseInsensitive) else {
      return fileName
    }
    return String(fileName[..<hlsRange.lowerBound])
  }

}
