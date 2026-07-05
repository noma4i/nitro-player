import Foundation

struct HlsProxyRouteResolution {
  let url: String
  let isProxying: Bool
}

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let controller = HlsProxyServerController()
  private let prefetchDeduper = HlsPrefetchDeduper(window: 60, maxEntries: 500)
  private let runtimeQueue = DispatchQueue(label: "com.nitroplay.hls.proxy-runtime")
  private var lifecycleState = HlsProxyRuntimeLifecycleState()
  private var prefetchSegmentCount = 2

  private init() {}

  func start(port: Int?) {
    runtimeQueue.sync {
      let resolvedPort = lifecycleState.start(port: port)
      if controller.start(port: resolvedPort) {
        lifecycleState.markAutoStarted()
      }
    }
  }

  func stop() {
    runtimeQueue.sync {
      lifecycleState.stop()
      controller.stop()
    }
  }

  func getProxiedUrl(url: String, headers: [String: String]?) -> String {
    resolvePlaybackRoute(url: url, headers: headers).url
  }

  func prefetchLeadingSegments(url: String, headers: [String: String]?) async throws {
    guard !runtimeQueue.sync(execute: { lifecycleState.isExplicitlyStopped }) else {
      return
    }
    guard HlsManifestUrl.matches(url) else {
      return
    }

    ensureStarted()
    let segmentCount = runtimeQueue.sync { prefetchSegmentCount }

    let dedupKey = HlsIdentity.requestKey(url: url, headers: headers)
    let shouldPrefetch = prefetchDeduper.shouldPrefetch(key: dedupKey)

    guard shouldPrefetch else {
      return
    }

    do {
      try await controller.prefetchLeadingSegments(url: url, headers: headers, count: segmentCount)
    } catch {
      prefetchDeduper.forget(key: dedupKey)
      throw error
    }
  }

  func getCacheStats() -> [String: Any] {
    controller.getCacheStats()
  }

  func getStreamCacheStats(url: String, headers: [String: String]?) -> [String: Any] {
    _ = url
    _ = headers
    return controller.getStreamCacheStats()
  }

  func hasOpenPlayerNetworkRequests(url: String, headers: [String: String]?) -> Bool {
    controller.hasOpenNetworkRequests(url: url, headers: headers, client: "player")
  }

  func getNetworkThroughputEstimate() -> [String: Any] {
    controller.getNetworkThroughputEstimate()
  }

  func configureCache(maxBytes: Int?, prefetchSegments: Int?) {
    if let maxBytes {
      controller.configureCache(maxBytes: maxBytes)
    }
    if let prefetchSegments {
      runtimeQueue.sync {
        prefetchSegmentCount = Self.normalizePrefetchSegmentCount(prefetchSegments)
      }
    }
  }

  func getThumbnailUrl(url: String, headers: [String: String]?) async -> String? {
    return await VideoPreviewRuntime.shared.getFirstFrame(url: url, headers: headers, preview: nil)?.uri
  }

  func peekThumbnailUrl(url: String, headers: [String: String]?) -> String? {
    return VideoPreviewRuntime.shared.peekFirstFrame(url: url, headers: headers, preview: nil)?.uri
  }

  func clearCache() {
    runtimeQueue.sync {
      controller.clearCache()
    }
  }

  func clearPreview() {
    VideoPreviewRuntime.shared.clear()
  }

  func resolvePlaybackRoute(url: String, headers: [String: String]?) -> HlsProxyRouteResolution {
    guard ensureStarted() else {
      return HlsProxyRouteResolution(url: url, isProxying: false)
    }
    let proxiedUrl = controller.proxiedManifestUrl(for: url, headers: headers)
    return HlsProxyRouteResolution(
      url: proxiedUrl ?? url,
      isProxying: proxiedUrl != nil
    )
  }

  func restartForPlaybackRecovery() {
    runtimeQueue.sync {
      guard let restartPort = lifecycleState.portForPlaybackRecoveryRestart() else {
        return
      }

      controller.stop()
      lifecycleState.suspendForHostLifecycle()
      if controller.start(port: restartPort) {
        lifecycleState.markAutoStarted()
      }
    }
  }

  @discardableResult
  private func ensureStarted() -> Bool {
    runtimeQueue.sync {
      guard let startPort = lifecycleState.portForImplicitStart() else {
        return lifecycleState.didAutoStart && !lifecycleState.isExplicitlyStopped
      }
      if controller.start(port: startPort) {
        lifecycleState.markAutoStarted()
        return true
      }
      return false
    }
  }

  private static func normalizePrefetchSegmentCount(_ count: Int) -> Int {
    min(6, max(1, count))
  }
}
