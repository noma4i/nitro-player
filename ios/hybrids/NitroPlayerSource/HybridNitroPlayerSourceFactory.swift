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
    let shouldUseHlsProxy = config.transport?.mode != .direct
    let route = shouldUseHlsProxy && isHlsManifest(config.uri)
      ? HlsProxyRuntime.shared.resolvePlaybackRoute(url: config.uri, headers: config.headers)
      : HlsProxyRouteResolution(url: config.uri, isProxying: false)

    return NativeNitroPlayerConfig(
      uri: route.url,
      headers: config.headers,
      metadata: config.metadata,
      startup: config.startup,
      buffer: config.buffer,
      retention: config.retention,
      transport: config.transport,
      preview: config.preview
    )
  }

  func fromNitroPlayerConfig(config: NativeNitroPlayerConfig) throws
    -> any HybridNitroPlayerSourceSpec
  {
    let normalized = normalizedConfig(from: config)
    return try HybridNitroPlayerSource(
      config: normalized,
      originalConfig: config,
      isProxyRouteActive: normalized.uri != config.uri
    )
  }

  func fromUri(uri: String) throws -> HybridNitroPlayerSourceSpec {
    let config = NativeNitroPlayerConfig(
      uri: uri,
      headers: nil,
      metadata: nil,
      startup: .eager,
      buffer: nil,
      retention: nil,
      transport: nil,
      preview: nil
    )
    return try HybridNitroPlayerSource(config: normalizedConfig(from: config))
  }
}
