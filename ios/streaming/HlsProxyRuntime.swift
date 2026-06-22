import Foundation

struct HlsProxyRouteResolution {
  let url: String
  let isProxying: Bool
}

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let runtimeState = HlsRuntimeState()
  private let controller = HlsProxyServerController()
  private let prefetchDeduper = HlsPrefetchDeduper(window: 60, maxEntries: 500)
  private let runtimeQueue = DispatchQueue(label: "com.nitroplay.hls.proxy-runtime")

  private init() {}

  func start(port: Int?) {
    runtimeQueue.sync {
      let resolvedPort = runtimeState.start(port: port)
      controller.start(port: resolvedPort)
      if controller.isRunning {
        runtimeState.markAutoStarted()
      }
    }
  }

  func stop() {
    runtimeQueue.sync {
      runtimeState.stop()
      controller.stop()
    }
  }

  func getProxiedUrl(url: String, headers: [String: String]?) -> String {
    resolvePlaybackRoute(url: url, headers: headers).url
  }

  func prefetchFirstSegment(url: String, headers: [String: String]?) async throws {
    guard !runtimeQueue.sync(execute: { runtimeState.snapshot().isExplicitlyStopped }) else {
      return
    }
    guard HlsManifestUrl.matches(url) else {
      return
    }

    ensureStarted()

    let dedupKey = HlsIdentity.requestKey(url: url, headers: headers)
    let shouldPrefetch = prefetchDeduper.shouldPrefetch(key: dedupKey)

    guard shouldPrefetch else {
      return
    }

    do {
      try await controller.prefetchFirstSegment(url: url, headers: headers)
    } catch {
      prefetchDeduper.forget(key: dedupKey)
      throw error
    }
  }

  func getCacheStats() -> [String: Any] {
    controller.getCacheStats()
  }

  func getStreamCacheStats(url: String, headers: [String: String]?) -> [String: Any] {
    controller.getCacheStats(streamKey: HlsIdentity.requestKey(url: url, headers: headers))
  }

  func configureCache(maxBytes: Int) {
    controller.configureCache(maxBytes: maxBytes)
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
    ensureStarted()
    let proxiedUrl = controller.proxiedManifestUrl(for: url, headers: headers)
    return HlsProxyRouteResolution(
      url: proxiedUrl ?? url,
      isProxying: proxiedUrl != nil
    )
  }

  func restartForPlaybackRecovery() {
    runtimeQueue.sync {
      guard let restartPort = runtimeState.portForPlaybackRecoveryRestart() else {
        return
      }

      controller.stop()
      controller.start(port: restartPort)
      if controller.isRunning {
        runtimeState.markAutoStarted()
      }
    }
  }

  private func ensureStarted() {
    runtimeQueue.sync {
      if let startPort = runtimeState.portForImplicitStart() {
        controller.start(port: startPort)
        if controller.isRunning {
          runtimeState.markAutoStarted()
        }
      }
    }
  }
}
