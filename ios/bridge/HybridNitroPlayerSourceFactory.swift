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

  private func resolvedRoute(from config: NativeNitroPlayerConfig) -> (config: NativeNitroPlayerConfig, routeGeneration: Int?) {
    let normalizedUri = normalizeUri(config.uri)
    let shouldUseHlsProxy = config.transport?.mode != .direct
    let route = shouldUseHlsProxy && HlsManifestUrl.matches(normalizedUri)
      ? HlsProxyRuntime.shared.resolvePlaybackRoute(url: normalizedUri, headers: config.headers)
      : HlsProxyRouteResolution(
        url: normalizedUri,
        headers: config.headers,
        isProxying: false,
        routeGeneration: nil
      )

    let normalized = NativeNitroPlayerConfig(
      uri: route.url,
      headers: route.headers,
      startup: config.startup,
      buffer: config.buffer,
      retention: config.retention,
      transport: config.transport
    )
    return (normalized, route.routeGeneration)
  }

  func fromNitroPlayerConfig(config: NativeNitroPlayerConfig) throws
    -> any HybridNitroPlayerSourceSpec
  {
    let normalizedInput = NativeNitroPlayerConfig(
      uri: normalizeUri(config.uri),
      headers: config.headers,
      startup: config.startup,
      buffer: config.buffer,
      retention: config.retention,
      transport: config.transport
    )
    let resolved = resolvedRoute(from: normalizedInput)
    return try HybridNitroPlayerSource(
      config: resolved.config,
      originalConfig: normalizedInput,
      routeGeneration: resolved.routeGeneration
    )
  }

  func fromUri(uri: String) throws -> HybridNitroPlayerSourceSpec {
    let config = NativeNitroPlayerConfig(
      uri: normalizeUri(uri),
      headers: nil,
      startup: .eager,
      buffer: nil,
      retention: nil,
      transport: nil
    )
    let resolved = resolvedRoute(from: config)
    return try HybridNitroPlayerSource(
      config: resolved.config,
      routeGeneration: resolved.routeGeneration
    )
  }
}
