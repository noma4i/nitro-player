//
//  HybridNitroPlayerSourceFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation

class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec {
  private func normalizeUri(_ uri: String) -> String {
    guard uri.hasPrefix("/") else {
      return uri
    }

    return URL(fileURLWithPath: uri).absoluteString
  }

  private func isHlsManifest(_ uri: String) -> Bool {
    guard var components = URLComponents(string: uri) else {
      return uri.lowercased().hasSuffix(".m3u8")
    }
    components.query = nil
    components.fragment = nil
    return components.string?.lowercased().hasSuffix(".m3u8") == true
  }

  private func normalizedConfig(from config: NativeNitroPlayerConfig) -> NativeNitroPlayerConfig {
    let normalizedUri = normalizeUri(config.uri)
    let shouldUseHlsProxy = config.transport?.mode != .direct
    let route = shouldUseHlsProxy && isHlsManifest(normalizedUri)
      ? HlsProxyRuntime.shared.resolvePlaybackRoute(url: normalizedUri, headers: config.headers)
      : HlsProxyRouteResolution(url: normalizedUri, isProxying: false)

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
    let normalizedInput = NativeNitroPlayerConfig(
      uri: normalizeUri(config.uri),
      headers: config.headers,
      metadata: config.metadata,
      startup: config.startup,
      buffer: config.buffer,
      retention: config.retention,
      transport: config.transport,
      preview: config.preview
    )
    let normalized = normalizedConfig(from: normalizedInput)
    return try HybridNitroPlayerSource(
      config: normalized,
      originalConfig: normalizedInput,
      isProxyRouteActive: normalized.uri != normalizedInput.uri
    )
  }

  func fromUri(uri: String) throws -> HybridNitroPlayerSourceSpec {
    let config = NativeNitroPlayerConfig(
      uri: normalizeUri(uri),
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
