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
  var asset: AVURLAsset?
  var uri: String
  var config: NativeVideoConfig
  var retentionState: MemoryRetentionState = .cold

  let url: URL
  private let sourceLoader = SourceLoader()

  init(config: NativeVideoConfig) throws {
    self.uri = config.uri
    self.config = config

    guard let url = URL(string: uri) else {
      throw SourceError.invalidUri(uri: uri).error()
    }

    self.url = url

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

  var memorySize: Int {
    var size = 0

    size += asset?.estimatedMemoryUsage ?? 0

    return size
  }
}
