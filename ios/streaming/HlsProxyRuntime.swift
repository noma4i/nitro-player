import Foundation

struct HlsProxyRouteResolution {
  let url: String
  let isProxying: Bool
}

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let prefetchDedupMs: TimeInterval = 60
  private let stateQueue = DispatchQueue(label: "com.nitroplay.hls.runtime-state")
  private let runtimeState = HlsRuntimeState()
  private let controller = HlsProxyServerController()

  private var prefetchTimestamps: [String: Date] = [:]

  private init() {}

  func start(port: Int?) {
    let resolvedPort = runtimeState.start(port: port)
    controller.start(port: resolvedPort)
  }

  func stop() {
    runtimeState.stop()
    controller.stop()
  }

  func getProxiedUrl(url: String, headers: [String: String]?) -> String {
    resolvePlaybackRoute(url: url, headers: headers).url
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    guard HlsManifestUrl.matches(url) else {
      return
    }

    ensureStarted()

    let shouldPrefetch = stateQueue.sync { () -> Bool in
      let now = Date()
      let dedupKey = HlsIdentity.sourceKey(url: url, headers: headers)
      if let last = prefetchTimestamps[dedupKey], now.timeIntervalSince(last) < prefetchDedupMs {
        return false
      }
      prefetchTimestamps[dedupKey] = now
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
    controller.getCacheStats()
  }

  func getStreamCacheStats(url: String, headers: [String: String]?) -> [String: Any] {
    controller.getCacheStats(streamKey: HlsIdentity.sourceKey(url: url, headers: headers))
  }

  func getThumbnailUrl(url: String, headers: [String: String]?) async -> String? {
    return await VideoPreviewRuntime.shared.getFirstFrame(url: url, headers: headers, preview: nil)?.uri
  }

  func peekThumbnailUrl(url: String, headers: [String: String]?) -> String? {
    return VideoPreviewRuntime.shared.peekFirstFrame(url: url, headers: headers, preview: nil)?.uri
  }

  func clearCache() {
    controller.clearCache()
  }

  func clearPreview() {
    VideoPreviewRuntime.shared.clear()
  }

  func resolvePlaybackRoute(url: String, headers: [String: String]?) -> HlsProxyRouteResolution {
    ensureStarted()
    let proxiedUrl = controller.proxiedManifestUrl(for: url, headers: headers)
    return HlsProxyRouteResolution(
      url: proxiedUrl ?? url,
      isProxying: proxiedUrl != nil
    )
  }

  func restartForPlaybackRecovery() {
    guard let restartPort = runtimeState.shouldRestartForPlaybackRecovery() else {
      return
    }

    controller.stop()
    controller.start(port: restartPort)
  }

  private func ensureStarted() {
    if let startPort = runtimeState.shouldStartForImplicitUse() {
      controller.start(port: startPort)
    }
  }
}
