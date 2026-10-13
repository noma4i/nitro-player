import Foundation

struct HlsProxyRouteResolution {
  let url: String
  let headers: [String: String]?
  let isProxying: Bool
  /// Transport generation this route was resolved against; `nil` when the route bypasses the proxy.
  let routeGeneration: Int?
}

final class HlsProxyRuntime {
  static let shared = HlsProxyRuntime()

  private let controller = HlsProxyServerController()
  private let runtimeQueue = DispatchQueue(label: "com.nitroplay.hls.proxy-runtime")
  private var cacheConfigurationLocked = false
  private var didAutoStart = false

  private init() {}

  var routeGeneration: Int {
    controller.currentRouteGeneration
  }

  var transportReadiness: HlsTransportReadiness {
    controller.readiness()
  }

  func configureCache(maxBytes: Int64) throws {
    guard HlsCacheBudget.isValid(maxBytes) else {
      throw NSError(
        domain: "NitroPlaybackCache",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Nitro playback cache maxBytes is below the minimum"]
      )
    }
    try runtimeQueue.sync {
      guard !cacheConfigurationLocked else {
        throw NSError(
          domain: "NitroPlaybackCache",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Configure the Nitro playback cache before the first cache operation, prefetch, or playback"]
        )
      }
      controller.configureCache(maxBytes: maxBytes)
    }
  }

  func purgeCachedSource(url: String, headers: [String: String]?) {
    guard HlsManifestUrl.matches(url) else {
      return
    }
    HlsPrefetcher.shared.forget(HlsRequestIdentity.cacheNamespace(url: url, headers: headers))
    runtimeQueue.sync {
      controller.purgeCache(url: url, headers: headers)
    }
  }

  func cacheStats() -> (totalBytes: Int64, fileCount: Int, maxBytes: Int64) {
    ensureStarted()
    return runtimeQueue.sync {
      controller.cacheStats()
    }
  }

  func clearCache() {
    ensureStarted()
    runtimeQueue.sync {
      controller.clearCache()
    }
  }

  func resolvePlaybackRoute(url: String, headers: [String: String]?) -> HlsProxyRouteResolution {
    ensureStarted()
    let proxiedUrl = controller.proxiedManifestUrl(for: url)
    let routedHeaders = proxiedUrl == nil
      ? headers
      : HlsRequestIdentity.transportHeaders(url: url, headers: headers)
    return HlsProxyRouteResolution(
      url: proxiedUrl ?? url,
      headers: routedHeaders,
      isProxying: proxiedUrl != nil,
      routeGeneration: proxiedUrl != nil ? controller.currentRouteGeneration : nil
    )
  }

  func ensureStartedForPrefetch() {
    ensureStarted()
  }

  /// Recovers the local transport and invokes completion on the main thread.
  func recoverTransport(completion: @escaping () -> Void) {
    ensureStarted()
    controller.recoverIfNeeded(completion: completion)
  }

  /// Invalidates the cached transport readiness so the next recovery pass re-probes it.
  func markTransportNeedsHealthCheck() {
    controller.markNeedsHealthCheck()
  }

  private func ensureStarted() {
    runtimeQueue.sync {
      cacheConfigurationLocked = true
      guard !didAutoStart else {
        return
      }
      if controller.start(port: 0) != nil {
        didAutoStart = true
      }
    }
  }
}
