import Foundation
import UIKit

final class HlsProxyServerController: NSObject {
  private let defaultPort: Int = 0
  private let prefetchClient = HlsNetworkClient()
  private let prefetchCache = HlsCacheStore()
  private let manifestRewriter = HlsManifestRewriter()
  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.ktv-proxy-state")
  private var requestedPort: Int = 0
  private var shouldBeRunning = false
  private var wasExplicitlyStopped = false
  private var needsRestartOnActive = false
  private var observersRegistered = false
  private var notificationObservers: [NSObjectProtocol] = []
  private var maxCacheBytes = HlsCacheBudget.defaultMaxBytes

  override init() {
    super.init()
    applyMaxCacheBytes(HlsCacheBudget.defaultMaxBytes)
  }

  func start(port: Int?) {
    let resolvedPort = (port ?? defaultPort) > 0 ? (port ?? defaultPort) : defaultPort
    stateQueue.sync {
      requestedPort = resolvedPort
      shouldBeRunning = true
      wasExplicitlyStopped = false
    }
    registerObserversIfNeeded()
    _ = ensureListening(forceRestart: true)
  }

  func stop() {
    stateQueue.sync {
      shouldBeRunning = false
      wasExplicitlyStopped = true
      needsRestartOnActive = false
    }
    unregisterObservers()
    KTVHTTPCache.proxyStop()
  }

  func proxiedManifestUrl(for url: String, headers: [String: String]?) -> String? {
    let needsObservers = stateQueue.sync { () -> Bool in
      if !shouldBeRunning && !wasExplicitlyStopped {
        shouldBeRunning = true
        return true
      }
      return false
    }
    if needsObservers {
      registerObserversIfNeeded()
    }
    guard ensureListening(forceRestart: false),
          let originalURL = URL(string: url)
    else {
      return nil
    }

    KTVHTTPCache.downloadSetAdditionalHeaders(normalizedHeaders(headers), for: originalURL)
    guard let proxyURL = KTVHTTPCache.proxyURL(withOriginalURL: originalURL, bindToLocalhost: true) else {
      return nil
    }
    guard proxyURL != originalURL else {
      return nil
    }
    return proxyURL.absoluteString
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    try await prefetchFirstSegment(
      url: url,
      headers: headers,
      streamKey: HlsIdentity.requestKey(url: url, headers: headers)
    )
  }

  func getCacheStats() -> [String: Any] {
    return [
      "totalSize": Int(KTVHTTPCache.cacheTotalCacheLength()),
      "fileCount": HlsKtvCacheStats.fileCount(from: KTVHTTPCache.cacheAllCacheItems()),
      "maxSize": maxCacheBytes
    ]
  }

  func getCacheStats(streamKey: String) -> [String: Any] {
    let stats = prefetchCache.getCacheStats(streamKey: streamKey)
    return [
      "totalSize": Int(KTVHTTPCache.cacheTotalCacheLength()),
      "fileCount": HlsKtvCacheStats.fileCount(from: KTVHTTPCache.cacheAllCacheItems()),
      "maxSize": maxCacheBytes,
      "streamSize": stats["streamSize"] as? Int ?? 0,
      "streamFileCount": stats["streamFileCount"] as? Int ?? 0
    ]
  }

  func configureCache(maxBytes: Int) {
    stateQueue.sync {
      applyMaxCacheBytes(maxBytes)
    }
  }

  func clearCache() {
    KTVHTTPCache.cacheDeleteAllCaches()
    prefetchCache.clearAll()
  }

  deinit {
    unregisterObservers()
    KTVHTTPCache.proxyStop()
  }

  var isRunning: Bool {
    KTVHTTPCache.proxyIsRunning()
  }

  private func ensureListening(forceRestart: Bool) -> Bool {
    let running = stateQueue.sync { shouldBeRunning }
    guard running else {
      return false
    }
    registerObserversIfNeeded()

    if KTVHTTPCache.proxyIsRunning() && !forceRestart {
      return true
    }

    if KTVHTTPCache.proxyIsRunning() {
      KTVHTTPCache.proxyStop()
    }

    let port = stateQueue.sync { requestedPort }
    KTVHTTPCache.proxySetPort(UInt16(max(0, port)))
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
    KTVHTTPCache.cacheSetMaxCacheLength(Int64(maxCacheBytes))

    if startProxy() {
      return true
    }
    if port != 0 {
      KTVHTTPCache.proxySetPort(0)
      return startProxy()
    }
    return false
  }

  private func startProxy() -> Bool {
    do {
      try KTVHTTPCache.proxyStart()
      return KTVHTTPCache.proxyIsRunning()
    } catch {
      return false
    }
  }

  private func applyMaxCacheBytes(_ bytes: Int) {
    maxCacheBytes = HlsCacheBudget.normalize(bytes)
    prefetchCache.setMaxBytes(maxCacheBytes)
    KTVHTTPCache.cacheSetMaxCacheLength(Int64(maxCacheBytes))
  }

  private func prefetchFirstSegment(url: String, headers: [String: String]?, streamKey: String) async throws {
    let manifest = try await prefetchClient.fetchText(url: url, headers: headers)
    if manifestRewriter.isMasterPlaylist(manifest) {
      if let firstVariant = manifestRewriter.extractVariantUrls(manifest).first {
        let resolved = manifestRewriter.resolveUrl(base: url, relative: firstVariant)
        try await prefetchFirstSegment(url: resolved, headers: headers, streamKey: streamKey)
      }
      return
    }

    let (initSegment, firstSegment) = manifestRewriter.extractInitAndFirstSegment(manifest)
    if let initSegment {
      let resolved = manifestRewriter.resolveUrl(base: url, relative: initSegment)
      let resourceKey = HlsIdentity.requestKey(url: resolved, headers: headers)
      if !prefetchCache.has(url: resourceKey) {
        let data = try await prefetchThroughProxy(url: resolved, headers: headers)
        prefetchCache.put(url: resourceKey, data: data, streamKey: streamKey)
      }
    }

    if let firstSegment {
      let resolved = manifestRewriter.resolveUrl(base: url, relative: firstSegment)
      let resourceKey = HlsIdentity.requestKey(url: resolved, headers: headers)
      if !prefetchCache.has(url: resourceKey) {
        let data = try await prefetchThroughProxy(url: resolved, headers: headers)
        prefetchCache.put(url: resourceKey, data: data, streamKey: streamKey)
      }
    }
  }

  private func prefetchThroughProxy(url: String, headers: [String: String]?) async throws -> Data {
    guard ensureListening(forceRestart: false),
          let originalURL = URL(string: url)
    else {
      return try await prefetchClient.fetchData(url: url, headers: headers, cachePolicy: .reloadIgnoringLocalCacheData)
    }

    KTVHTTPCache.downloadSetAdditionalHeaders(normalizedHeaders(headers), for: originalURL)
    guard let proxyURL = KTVHTTPCache.proxyURL(withOriginalURL: originalURL, bindToLocalhost: true),
          proxyURL != originalURL
    else {
      return try await prefetchClient.fetchData(url: url, headers: headers, cachePolicy: .reloadIgnoringLocalCacheData)
    }

    return try await prefetchClient.fetchData(
      url: proxyURL.absoluteString,
      headers: nil,
      cachePolicy: .reloadIgnoringLocalCacheData
    )
  }

  private func normalizedHeaders(_ headers: [String: String]?) -> [String: String] {
    guard let headers else {
      return [:]
    }
    return headers.filter { !$0.key.isEmpty && !$0.value.isEmpty }
  }

  private func handleWillResignActive() {
    stateQueue.sync {
      if shouldBeRunning {
        needsRestartOnActive = true
      }
    }
  }

  private func handleDidEnterBackground() {
    stateQueue.sync {
      if shouldBeRunning {
        needsRestartOnActive = true
      }
    }
  }

  private func handleDidBecomeActive() {
    let pendingRestart = stateQueue.sync { () -> Bool? in
      guard shouldBeRunning else {
        return nil
      }
      let pending = needsRestartOnActive
      needsRestartOnActive = false
      return pending
    }
    guard pendingRestart != nil else {
      return
    }
    _ = ensureListening(forceRestart: pendingRestart == true || !KTVHTTPCache.proxyIsRunning())
  }

  private func registerObserversIfNeeded() {
    let shouldRegister = stateQueue.sync { () -> Bool in
      if observersRegistered {
        return false
      }
      observersRegistered = true
      return true
    }
    guard shouldRegister else {
      return
    }

    let center = NotificationCenter.default
    notificationObservers = [
      center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.handleWillResignActive()
      },
      center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
        self?.handleDidEnterBackground()
      },
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.handleDidBecomeActive()
      }
    ]
  }

  private func unregisterObservers() {
    let shouldUnregister = stateQueue.sync { () -> Bool in
      if !observersRegistered {
        return false
      }
      observersRegistered = false
      return true
    }
    guard shouldUnregister else {
      return
    }

    notificationObservers.forEach(NotificationCenter.default.removeObserver)
    notificationObservers.removeAll()
  }
}

final class HlsNetworkClient {
  private let retryDelaysNs: [UInt64] = [100_000_000, 300_000_000]

  func fetchText(url: String, headers: [String: String]?, cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy) async throws -> String {
    let data = try await fetchData(url: url, headers: headers, cachePolicy: cachePolicy)
    guard let text = String(data: data, encoding: .utf8) else {
      throw NSError(domain: "hls", code: 1)
    }
    return text
  }

  func fetchData(url: String, headers: [String: String]?, cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy) async throws -> Data {
    var lastError: Error?

    for attempt in 0...retryDelaysNs.count {
      do {
        let data = try await performFetchData(url: url, headers: headers, cachePolicy: cachePolicy)
        guard !data.isEmpty else {
          throw NSError(domain: "hls", code: 4, userInfo: [NSLocalizedDescriptionKey: "Empty response body"])
        }
        return data
      } catch {
        lastError = error
        guard attempt < retryDelaysNs.count, shouldRetry(error) else {
          throw error
        }
        try? await Task.sleep(nanoseconds: retryDelaysNs[attempt])
      }
    }

    throw lastError ?? NSError(domain: "hls", code: 5)
  }

  private func performFetchData(url: String, headers: [String: String]?, cachePolicy: URLRequest.CachePolicy) async throws -> Data {
    guard let parsed = URL(string: url) else {
      throw NSError(domain: "hls", code: 2)
    }
    var request = URLRequest(url: parsed)
    request.cachePolicy = cachePolicy
    // HLS fetch timeout. parity-divergent: Android HlsProxyServer uses 12s (intentional until measured).
    let requestTimeoutSeconds: TimeInterval = 10
    request.timeoutInterval = requestTimeoutSeconds
    headers?.forEach { key, value in
      request.setValue(value, forHTTPHeaderField: key)
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
      throw NSError(
        domain: "hls",
        code: http.statusCode,
        userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode)"]
      )
    }
    return data
  }

  private func shouldRetry(_ error: Error) -> Bool {
    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
      return [
        NSURLErrorTimedOut,
        NSURLErrorNetworkConnectionLost,
        NSURLErrorCannotFindHost,
        NSURLErrorCannotConnectToHost,
        NSURLErrorDNSLookupFailed,
        NSURLErrorNotConnectedToInternet
      ].contains(nsError.code)
    }
    return false
  }
}
