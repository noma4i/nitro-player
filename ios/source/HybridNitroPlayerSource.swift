//
//  HybridNitroPlayerSource.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import AVFoundation
import Foundation
import NitroModules

class HybridNitroPlayerSource: HybridNitroPlayerSourceSpec {
  private struct SourceState {
    var asset: AVURLAsset?
    var retentionState: RetentionLevel
    var config: NativeNitroPlayerConfig
    var url: URL
    var generation: Int
  }

  private struct LoadTarget {
    let generation: Int
    let config: NativeNitroPlayerConfig
    let url: URL
  }

  private var state: SourceState
  private let stateLock = NSLock()
  private var resolvedRouteGeneration: Int?
  private let sourceLoader = SourceLoader()
  let originalConfig: NativeNitroPlayerConfig

  var uri: String {
    stateLock.lock()
    defer { stateLock.unlock() }
    return state.config.uri
  }

  var config: NativeNitroPlayerConfig {
    stateLock.lock()
    defer { stateLock.unlock() }
    return state.config
  }

  var url: URL {
    stateLock.lock()
    defer { stateLock.unlock() }
    return state.url
  }

  var retentionState: RetentionLevel {
    stateLock.lock()
    defer { stateLock.unlock() }
    return state.retentionState
  }

  init(
    config: NativeNitroPlayerConfig,
    originalConfig: NativeNitroPlayerConfig? = nil,
    routeGeneration: Int? = nil
  ) throws {
    guard let url = URL(string: config.uri) else {
      throw SourceError.invalidUri(uri: config.uri).error()
    }

    self.originalConfig = originalConfig ?? config
    self.state = SourceState(
      asset: nil,
      retentionState: .cold,
      config: config,
      url: url,
      generation: 0
    )
    self.resolvedRouteGeneration = routeGeneration

    super.init()
  }

  deinit {
    releaseAsset()
  }

  func getAssetInformationAsync() -> Promise<NitroPlayerInformation> {
    let promise = Promise<NitroPlayerInformation>()

    Task.detached(priority: .utility) { [weak self] in
      guard let self else {
        promise.reject(
          withError: LibraryError.deallocated(objectName: "HybridNitroPlayerSource").error())
        return
      }

      do {
        let asset = try await self.getAsset()
        let information = try await asset.getAssetInformation()

        self.stateLock.lock()
        let isCurrentAsset = self.state.asset.map { $0 === asset } ?? false
        self.stateLock.unlock()
        guard isCurrentAsset else {
          throw CancellationError()
        }

        promise.resolve(withResult: information)
      } catch {
        if error is CancellationError {
          promise.reject(withError: SourceError.cancelled.error())
        } else {
          promise.reject(withError: error)
        }
      }
    }

    return promise
  }

  func getAsset() async throws -> AVURLAsset {
    stateLock.lock()
    if let asset = state.asset {
      if state.retentionState == .cold {
        state.retentionState = .metadata
      }
      stateLock.unlock()
      return asset
    }
    let target = LoadTarget(
      generation: state.generation,
      config: state.config,
      url: state.url
    )
    stateLock.unlock()

    do {
      let asset = try await sourceLoader.load {
        if target.url.isFileURL {
          try NitroPlayerFileHelper.validateReadPermission(for: target.url)
        }

        let asset: AVURLAsset
        if let headers = target.config.headers {
          asset = AVURLAsset(
            url: target.url,
            options: ["AVURLAssetHTTPHeaderFieldsKey": headers]
          )
        } else {
          asset = AVURLAsset(url: target.url)
        }

        // Code browned from expo-video https://github.com/expo/expo/blob/ea17c9b1ce5111e1454b089ba381f3feb93f33cc/packages/expo-video/ios/VideoPlayerItem.swift#L40C30-L40C73
        // If we don't load those properties, they will be loaded on main thread causing lags
        _ = try? await asset.load(.duration, .preferredTransform, .isPlayable) as Any
        try Task.checkCancellation()
        return asset
      }

      stateLock.lock()
      guard state.generation == target.generation else {
        stateLock.unlock()
        throw CancellationError()
      }
      state.asset = asset
      state.retentionState = .metadata
      stateLock.unlock()
      return asset
    } catch {
      if error is CancellationError {
        throw SourceError.cancelled.error()
      }
      throw error
    }
  }

  func markHot(asset: AVURLAsset) throws {
    stateLock.lock()
    defer { stateLock.unlock() }

    guard let currentAsset = state.asset, currentAsset === asset else {
      throw CancellationError()
    }
    state.retentionState = .hot
  }

  func warmMetadata() async throws {
    _ = try await getAsset()
  }

  func trimToMetadata() {
    stateLock.lock()
    state.retentionState = state.asset == nil ? .cold : .metadata
    stateLock.unlock()
  }

  func trimToCold() {
    _ = invalidateAsset()
  }

  func releaseAsset() {
    _ = invalidateAsset()
  }

  func supportsStartupRecovery() -> Bool {
    guard originalConfig.transport?.mode != .direct else {
      return false
    }
    return HlsManifestUrl.matches(originalConfig.uri)
  }

  @discardableResult
  func purgePlaybackCache() -> Bool {
    guard supportsStartupRecovery() else {
      return false
    }
    HlsProxyRuntime.shared.purgeCachedSource(
      url: originalConfig.uri,
      headers: originalConfig.headers
    )
    return true
  }

  @discardableResult
  func refreshPlaybackRoute() -> Bool {
    guard supportsStartupRecovery() else {
      return false
    }

    let resolution = HlsProxyRuntime.shared.resolvePlaybackRoute(
      url: originalConfig.uri,
      headers: originalConfig.headers
    )

    guard let nextUrl = URL(string: resolution.url) else {
      return false
    }

    stateLock.lock()
    state.generation += 1
    state.asset = nil
    state.retentionState = .cold
    state.config = NativeNitroPlayerConfig(
      uri: resolution.url,
      headers: resolution.headers,
      startup: originalConfig.startup,
      buffer: originalConfig.buffer,
      retention: originalConfig.retention,
      transport: originalConfig.transport
    )
    state.url = nextUrl
    resolvedRouteGeneration = resolution.routeGeneration
    stateLock.unlock()
    sourceLoader.cancelDetached()

    return resolution.isProxying
  }

  /// True when the resolved route no longer matches the transport it was resolved against:
  /// either the bound port changed, or the route was resolved while the transport was unhealthy
  /// and therefore bypassed the proxy that is now available again.
  var isRouteStale: Bool {
    guard supportsStartupRecovery() else {
      return false
    }
    stateLock.lock()
    let resolved = resolvedRouteGeneration
    stateLock.unlock()

    guard let resolved else {
      if case .ready = HlsProxyRuntime.shared.transportReadiness {
        return true
      }
      return false
    }
    return resolved != HlsProxyRuntime.shared.routeGeneration
  }

  var memorySize: Int {
    stateLock.lock()
    let asset = state.asset
    stateLock.unlock()
    return asset?.estimatedMemoryUsage ?? 0
  }

  private func invalidateAsset() -> Int {
    stateLock.lock()
    state.generation += 1
    state.asset = nil
    state.retentionState = .cold
    let generation = state.generation
    stateLock.unlock()
    sourceLoader.cancelDetached()
    return generation
  }
}
