import Foundation
import GCDWebServer
import UIKit

final class HlsProxyServerController: NSObject {
  private let defaultPort: Int = 18181
  private let cache = HlsCacheStore()
  private let manifestRewriter = HlsManifestRewriter()
  private let networkClient = HlsNetworkClient()

  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.proxy-state")
  private var port: Int = 18181
  private var server: GCDWebServer?
  private var shouldBeRunning = false
  private var wasExplicitlyStopped = false
  private var needsRestartOnActive = false
  private var observersRegistered = false

  func start(port: Int?) {
    let resolvedPort = (port ?? defaultPort) > 0 ? (port ?? defaultPort) : defaultPort
    self.port = resolvedPort
    shouldBeRunning = true
    wasExplicitlyStopped = false
    registerObserversIfNeeded()
    _ = ensureListening(forceRestart: true)
  }

  func stop() {
    shouldBeRunning = false
    wasExplicitlyStopped = true
    needsRestartOnActive = false
    unregisterObservers()
    stopServer()
  }

  func proxiedManifestUrl(for url: String, headers: [String: String]?) -> String? {
    stateQueue.sync {
      if !shouldBeRunning && !wasExplicitlyStopped {
        shouldBeRunning = true
        registerObserversIfNeeded()
      }
    }

    guard ensureListening(forceRestart: false) else {
      return nil
    }

    return manifestRewriter.manifestProxyUrl(url: url, headers: headers, port: port, streamKey: url)
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    try await prefetchFirstSegment(url: url, headers: headers, streamKey: url)
  }

  private func prefetchFirstSegment(url: String, headers: [String: String]?, streamKey: String) async throws {
    let manifest = try await networkClient.fetchText(url: url, headers: headers)
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
      if !cache.has(url: resolved) {
        let data = try await networkClient.fetchData(url: resolved, headers: headers)
        cache.put(url: resolved, data: data, streamKey: streamKey)
      }
    }

    if let firstSegment {
      let resolved = manifestRewriter.resolveUrl(base: url, relative: firstSegment)
      if !cache.has(url: resolved) {
        let data = try await networkClient.fetchData(url: resolved, headers: headers)
        cache.put(url: resolved, data: data, streamKey: streamKey)
      }
    }
  }

  func getCacheStats() -> [String: Any] {
    cache.getCacheStats()
  }

  func getCacheStats(streamKey: String) -> [String: Any] {
    cache.getCacheStats(streamKey: streamKey)
  }

  func clearCache() {
    cache.clearAll()
  }

  deinit {
    unregisterObservers()
  }

  @objc private func handleWillResignActive() {
    if shouldBeRunning {
      needsRestartOnActive = true
    }
  }

  @objc private func handleDidEnterBackground() {
    if shouldBeRunning {
      needsRestartOnActive = true
    }
  }

  @objc private func handleDidBecomeActive() {
    guard shouldBeRunning else {
      return
    }

    let forceRestart = needsRestartOnActive || !hasLiveServer
    needsRestartOnActive = false
    _ = ensureListening(forceRestart: forceRestart)
  }

  private var hasLiveServer: Bool {
    server?.isRunning == true
  }

  var isRunning: Bool {
    hasLiveServer
  }

  private func ensureListening(forceRestart: Bool) -> Bool {
    guard shouldBeRunning else {
      return false
    }

    registerObserversIfNeeded()

    if forceRestart || !hasLiveServer {
      return restartServer()
    }

    return true
  }

  private func restartServer() -> Bool {
    stopServer()

    let webServer = GCDWebServer()
    bindHandlers(to: webServer)

    do {
      try webServer.start(options: [
        GCDWebServerOption_Port: port,
        GCDWebServerOption_BindToLocalhost: true,
        GCDWebServerOption_AutomaticallySuspendInBackground: false
      ])
      server = webServer
      return hasLiveServer
    } catch {
      server = nil
      return false
    }
  }

  private func stopServer() {
    server?.stop()
    server = nil
  }

  private func registerObserversIfNeeded() {
    if observersRegistered {
      return
    }

    observersRegistered = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  private func unregisterObservers() {
    if !observersRegistered {
      return
    }

    NotificationCenter.default.removeObserver(self)
    observersRegistered = false
  }

  private func bindHandlers(to webServer: GCDWebServer) {
    webServer.addHandler(
      forMethod: "GET",
      path: "/hls/manifest",
      request: GCDWebServerRequest.self
    ) { [weak self] request, completion in
      guard let self else {
        completion(GCDWebServerDataResponse(statusCode: 503))
        return
      }
      self.handleManifest(request: request, completion: completion)
    }

    webServer.addHandler(
      forMethod: "GET",
      path: "/hls/segment",
      request: GCDWebServerRequest.self
    ) { [weak self] request, completion in
      guard let self else {
        completion(GCDWebServerDataResponse(statusCode: 503))
        return
      }
      self.handleSegment(request: request, completion: completion)
    }
  }

  private func handleManifest(request: GCDWebServerRequest, completion: @escaping GCDWebServerCompletionBlock) {
    guard let url = request.query?["url"] else {
      completion(GCDWebServerDataResponse(statusCode: 400))
      return
    }

    let streamKey = request.query?["streamKey"] ?? url
    let headers = manifestRewriter.decodeHeaders(request.query?["headers"])

    Task.detached { [weak self] in
      guard let self else {
        completion(GCDWebServerDataResponse(statusCode: 500))
        return
      }

      do {
        let manifest = try await self.networkClient.fetchText(url: url, headers: headers, cachePolicy: .reloadIgnoringLocalCacheData)
        let rewritten = self.manifestRewriter.rewriteManifest(
          manifest: manifest,
          baseUrl: url,
          headers: headers,
          port: self.port,
          streamKey: streamKey
        )
        let response = GCDWebServerDataResponse(
          data: rewritten.data(using: .utf8) ?? Data(),
          contentType: "application/vnd.apple.mpegurl"
        )
        response.setValue("no-cache, no-store, must-revalidate", forAdditionalHeader: "Cache-Control")
        response.setValue("no-cache", forAdditionalHeader: "Pragma")
        response.setValue("0", forAdditionalHeader: "Expires")
        completion(response)
      } catch {
        completion(GCDWebServerDataResponse(statusCode: 500))
      }
    }
  }

  private func handleSegment(request: GCDWebServerRequest, completion: @escaping GCDWebServerCompletionBlock) {
    guard let url = request.query?["url"] else {
      completion(GCDWebServerDataResponse(statusCode: 400))
      return
    }

    let streamKey = request.query?["streamKey"]
    let headers = manifestRewriter.decodeHeaders(request.query?["headers"])

    Task.detached { [weak self] in
      guard let self else {
        completion(GCDWebServerDataResponse(statusCode: 500))
        return
      }

      if let filePath = self.cache.getFilePath(url: url) {
        let response = GCDWebServerFileResponse(file: filePath.path)
        response?.contentType = self.manifestRewriter.guessContentType(url: url)
        completion(response ?? GCDWebServerDataResponse(statusCode: 500))
        return
      }

      do {
        let data = try await self.networkClient.fetchData(url: url, headers: headers)
        self.cache.put(url: url, data: data, streamKey: streamKey)
        completion(
          GCDWebServerDataResponse(
            data: data,
            contentType: self.manifestRewriter.guessContentType(url: url)
          )
        )
      } catch {
        completion(GCDWebServerDataResponse(statusCode: 500))
      }
    }
  }
}

final class HlsNetworkClient {
  func fetchText(url: String, headers: [String: String]?, cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy) async throws -> String {
    let data = try await fetchData(url: url, headers: headers, cachePolicy: cachePolicy)
    guard let text = String(data: data, encoding: .utf8) else {
      throw NSError(domain: "hls", code: 1)
    }
    return text
  }

  func fetchData(url: String, headers: [String: String]?, cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy) async throws -> Data {
    guard let requestUrl = URL(string: url) else {
      throw NSError(domain: "hls", code: 2)
    }

    var request = URLRequest(url: requestUrl)
    request.cachePolicy = cachePolicy
    headers?.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
      throw NSError(domain: "hls", code: 3)
    }
    return data
  }
}
