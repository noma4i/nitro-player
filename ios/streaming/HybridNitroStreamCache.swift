import Foundation
import NitroModules

class HybridNitroStreamCache: HybridNitroStreamCacheSpec {
  func prefetchLeadingSegments(url: String, headers: Dictionary<String, String>?) throws -> Promise<Void> {
    return Promise.async {
      try await HlsProxyRuntime.shared.prefetchLeadingSegments(url: url, headers: headers)
    }
  }

  func getCacheStats() throws -> Promise<NitroStreamCacheStats> {
    return Promise.async {
      Self.cacheStats(from: HlsProxyRuntime.shared.getCacheStats())
    }
  }

  func getStreamCacheStats(url: String, headers: Dictionary<String, String>?) throws -> Promise<NitroStreamSourceCacheStats> {
    return Promise.async {
      Self.streamCacheStats(from: HlsProxyRuntime.shared.getStreamCacheStats(url: url, headers: headers))
    }
  }

  func getNetworkThroughputEstimate() throws -> Promise<Variant_NullType_NitroStreamNetworkThroughputEstimate> {
    return Promise.async {
      .second(Self.throughputEstimate(from: HlsProxyRuntime.shared.getNetworkThroughputEstimate()))
    }
  }

  func configureCache(options: NitroStreamCacheConfig?) throws -> Promise<Bool> {
    return Promise.async {
      HlsProxyRuntime.shared.configureCache(
        maxBytes: options?.maxBytes.map { Int($0) },
        prefetchSegments: options?.prefetchSegments.map { Int($0) }
      )
      return true
    }
  }

  func clearCache() throws -> Promise<Bool> {
    return Promise.async {
      HlsProxyRuntime.shared.clearCache()
      return true
    }
  }

  private static func cacheStats(from stats: [String: Any]) -> NitroStreamCacheStats {
    NitroStreamCacheStats(
      totalSize: numberValue(stats["totalSize"]),
      fileCount: numberValue(stats["fileCount"]),
      maxSize: numberValue(stats["maxSize"], fallback: Double(defaultStreamCacheMaxBytes))
    )
  }

  private static func streamCacheStats(from stats: [String: Any]) -> NitroStreamSourceCacheStats {
    NitroStreamSourceCacheStats(
      totalSize: numberValue(stats["totalSize"]),
      fileCount: numberValue(stats["fileCount"]),
      maxSize: numberValue(stats["maxSize"], fallback: Double(defaultStreamCacheMaxBytes)),
      streamSize: numberValue(stats["streamSize"]),
      streamFileCount: numberValue(stats["streamFileCount"])
    )
  }

  private static func throughputEstimate(from stats: [String: Any]) -> NitroStreamNetworkThroughputEstimate {
    let newestAgeMs: Variant_NullType_Double
    if stats["newestAgeMs"] is NSNull {
      newestAgeMs = .first(.null)
    } else {
      newestAgeMs = .second(numberValue(stats["newestAgeMs"]))
    }

    return NitroStreamNetworkThroughputEstimate(
      bps: numberValue(stats["bps"]),
      samples: numberValue(stats["samples"]),
      newestAgeMs: newestAgeMs
    )
  }

  private static func numberValue(_ value: Any?, fallback: Double = 0) -> Double {
    if let number = value as? NSNumber {
      return number.doubleValue
    }
    if let number = value as? Double {
      return number
    }
    if let number = value as? Int {
      return Double(number)
    }
    return fallback
  }
}

private let defaultStreamCacheMaxBytes: Int64 = 4 * 1024 * 1024 * 1024
