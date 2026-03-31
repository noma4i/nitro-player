//
//  HybridNitroPlayerSource.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import AVFoundation
import Foundation
import NitroModules

class HybridNitroPlayerSource: HybridNitroPlayerSourceSpec, NativeNitroPlayerSourceSpec {
  private var _asset: AVURLAsset?
  private var _retentionState: MemoryRetentionState = .cold
  private var _config: NativeNitroPlayerConfig
  private var _url: URL
  private var _isProxyRouteActive: Bool
  private let stateLock = NSLock()
  let originalConfig: NativeNitroPlayerConfig

  var asset: AVURLAsset? {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _asset }
    set { stateLock.lock(); _asset = newValue; stateLock.unlock() }
  }

  var retentionState: MemoryRetentionState {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _retentionState }
    set { stateLock.lock(); _retentionState = newValue; stateLock.unlock() }
  }

  var uri: String {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _config.uri }
    set {
      guard let nextUrl = URL(string: newValue) else { return }
      stateLock.lock()
      _config = NativeNitroPlayerConfig(
        uri: newValue,
        headers: _config.headers,
        metadata: _config.metadata,
        startup: _config.startup,
        buffer: _config.buffer,
        retention: _config.retention,
        transport: _config.transport,
        preview: _config.preview
      )
      _url = nextUrl
      stateLock.unlock()
    }
  }
  var config: NativeNitroPlayerConfig {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _config }
  }

  var url: URL {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _url }
  }
  private let sourceLoader = SourceLoader()

  var isProxyRouteActive: Bool {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _isProxyRouteActive }
  }

  init(
    config: NativeNitroPlayerConfig,
    originalConfig: NativeNitroPlayerConfig? = nil,
    isProxyRouteActive: Bool? = nil
  ) throws {
    self.originalConfig = originalConfig ?? config
    self._config = config

    guard let url = URL(string: config.uri) else {
      throw SourceError.invalidUri(uri: config.uri).error()
    }

    self._url = url
    self._isProxyRouteActive = isProxyRouteActive ?? false

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
        let videoInformation = try await self.sourceLoader.load(priority: .utility) {
          if self.url.isFileURL {
            try NitroPlayerFileHelper.validateReadPermission(for: self.url)
          }

          try await self.initializeAsset()

          guard let asset = self.asset else {
            throw PlayerError.assetNotInitialized.error()
          }

          return try await asset.getAssetInformation()
        }

        promise.resolve(withResult: videoInformation)
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

  func initializeAsset() async throws {
    guard asset == nil else {
      if retentionState == .cold {
        retentionState = .metadata
      }
      return
    }

    if let headers = config.headers {
      let options = [
        "AVURLAssetHTTPHeaderFieldsKey": headers
      ]
      asset = AVURLAsset(url: url, options: options)
    } else {
      asset = AVURLAsset(url: url)
    }

    guard let asset else {
      throw SourceError.failedToInitializeAsset.error()
    }

    do {
      // Code browned from expo-video https://github.com/expo/expo/blob/ea17c9b1ce5111e1454b089ba381f3feb93f33cc/packages/expo-video/ios/VideoPlayerItem.swift#L40C30-L40C73
      // If we don't load those properties, they will be loaded on main thread causing lags
      _ = try? await asset.load(.duration, .preferredTransform, .isPlayable) as Any

      try Task.checkCancellation()
      retentionState = .metadata
    } catch {
      self.asset = nil
      self.retentionState = .cold
      if error is CancellationError {
        throw SourceError.cancelled.error()
      }
      throw error
    }
  }

  func getAsset() async throws -> AVURLAsset {
    if let asset {
      if retentionState == .cold {
        retentionState = .metadata
      }
      return asset
    }

    do {
      try await sourceLoader.load {
        try await self.initializeAsset()
      }

      guard let asset else {
        throw SourceError.failedToInitializeAsset.error()
      }

      retentionState = .metadata
      return asset
    } catch {
      if error is CancellationError {
        self.asset = nil
        self.retentionState = .cold
        throw SourceError.cancelled.error()
      }
      throw error
    }
  }

  func warmMetadata() async throws {
    _ = try await getAsset()
    retentionState = .metadata
  }

  func trimToMetadata() {
    retentionState = asset == nil ? .cold : .metadata
  }

  func trimToCold() {
    releaseAsset()
  }

  func releaseAsset() {
    sourceLoader.cancelSync()
    asset = nil
    retentionState = .cold
  }

  func supportsStartupRecovery() -> Bool {
    guard originalConfig.transport?.mode != .direct else {
      return false
    }
    let withoutFragment = originalConfig.uri.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? originalConfig.uri
    let withoutQuery = withoutFragment.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? withoutFragment
    return withoutQuery.lowercased().hasSuffix(".m3u8")
  }

  func previewSourceUri() -> String {
    originalConfig.uri
  }

  @discardableResult
  func refreshPlaybackRouteForStartupRecovery() -> Bool {
    guard supportsStartupRecovery() else {
      return false
    }

    releaseAsset()

    let resolution = HlsProxyRuntime.shared.resolvePlaybackRoute(
      url: originalConfig.uri,
      headers: originalConfig.headers
    )

    guard let nextUrl = URL(string: resolution.url) else {
      return false
    }

    stateLock.lock()
    _config = NativeNitroPlayerConfig(
      uri: resolution.url,
      headers: originalConfig.headers,
      metadata: originalConfig.metadata,
      startup: originalConfig.startup,
      buffer: originalConfig.buffer,
      retention: originalConfig.retention,
      transport: originalConfig.transport,
      preview: originalConfig.preview
    )
    _url = nextUrl
    _isProxyRouteActive = resolution.isProxying
    stateLock.unlock()

    return resolution.isProxying
  }

  var memorySize: Int {
    var size = 0

    size += asset?.estimatedMemoryUsage ?? 0

    return size
  }
}
