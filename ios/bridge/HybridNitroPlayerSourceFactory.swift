//
//  HybridNitroPlayerSourceFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation

class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec {
  private struct RoutedConfig {
    let config: NativeNitroPlayerConfig
    let isProxyRouteActive: Bool
  }

  private func normalizeUri(_ uri: String) -> String {
    guard uri.hasPrefix("/") else {
      return uri
    }

    return URL(fileURLWithPath: uri).absoluteString
  }

  private func routeMode(_ mode: NitroSourceTransportMode?) -> HlsTransportRouteMode? {
    guard let mode else { return nil }
    switch mode {
    case .auto:
      return .auto
    case .direct:
      return .direct
    case .proxy:
      return .proxy
    }
  }

  private func shouldUseHlsProxy(config: NativeNitroPlayerConfig, normalizedUri: String) -> Bool {
    HlsTransportRoutePolicy.shouldUseProxyForPlayback(
      mode: routeMode(config.transport?.mode),
      isHls: HlsManifestUrl.matches(normalizedUri),
      feedPoolEligible: config.retention?.feedPoolEligible == true
    )
  }

  private func routedConfig(from config: NativeNitroPlayerConfig) -> RoutedConfig {
    let normalizedUri = normalizeUri(config.uri)
    let shouldUseHlsProxy = shouldUseHlsProxy(config: config, normalizedUri: normalizedUri)
    let route = shouldUseHlsProxy && HlsManifestUrl.matches(normalizedUri)
      ? HlsProxyRuntime.shared.resolvePlaybackRoute(url: normalizedUri, headers: config.headers)
      : HlsProxyRouteResolution(url: normalizedUri, isProxying: false)

    return RoutedConfig(
      config: NativeNitroPlayerConfig(
        uri: route.url,
        headers: config.headers,
        metadata: config.metadata,
        startup: config.startup,
        buffer: config.buffer,
        retention: config.retention,
        transport: config.transport,
        preview: config.preview
      ),
      isProxyRouteActive: route.isProxying
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
    let normalized = routedConfig(from: normalizedInput)
    return try HybridNitroPlayerSource(
      config: normalized.config,
      originalConfig: normalizedInput,
      isProxyRouteActive: normalized.isProxyRouteActive
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
    let normalized = routedConfig(from: config)
    return try HybridNitroPlayerSource(
      config: normalized.config,
      isProxyRouteActive: normalized.isProxyRouteActive
    )
  }
}
