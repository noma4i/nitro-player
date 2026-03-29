//
//  HybridNitroPlayerSourceFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation

class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec {
  private func isHlsManifest(_ uri: String) -> Bool {
    guard var components = URLComponents(string: uri) else {
      return uri.lowercased().hasSuffix(".m3u8")
    }
    components.query = nil
    components.fragment = nil
    return components.string?.lowercased().hasSuffix(".m3u8") == true
  }

  private func normalizedConfig(from config: NativeNitroPlayerConfig) -> NativeNitroPlayerConfig {
    let shouldUseHlsProxy = config.advanced?.transport?.useHlsProxy != false
    let proxiedUri = shouldUseHlsProxy && isHlsManifest(config.uri)
      ? HlsProxyRuntime.shared.getProxiedUrl(url: config.uri, headers: config.headers)
      : config.uri

    return NativeNitroPlayerConfig(
      uri: proxiedUri,
      headers: config.headers,
      metadata: config.metadata,
      lifecycle: config.lifecycle,
      initialization: config.initialization,
      advanced: config.advanced
    )
  }

  func fromNitroPlayerConfig(config: NativeNitroPlayerConfig) throws
    -> any HybridNitroPlayerSourceSpec
  {
    return try HybridNitroPlayerSource(config: normalizedConfig(from: config))
  }

  func fromUri(uri: String) throws -> HybridNitroPlayerSourceSpec {
    let config = NativeNitroPlayerConfig(
      uri: uri,
      headers: nil,
      metadata: nil,
      lifecycle: .balanced,
      initialization: .eager,
      advanced: nil
    )
    return try HybridNitroPlayerSource(config: normalizedConfig(from: config))
  }
}
