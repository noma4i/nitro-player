//
//  HybridNitroPlayerSourceFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation

class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec {
  func fromVideoConfig(config: NativeVideoConfig) throws
    -> any HybridNitroPlayerSourceSpec
  {
    return try HybridNitroPlayerSource(config: config)
  }

  func fromUri(uri: String) throws -> HybridNitroPlayerSourceSpec {
    let config = NativeVideoConfig(
      uri: uri,
      externalSubtitles: nil,
      drm: nil,
      memoryConfig: nil,
      headers: nil,
      bufferConfig: nil,
      metadata: nil,
      initializeOnCreation: true,
      useHlsProxy: nil
    )
    return try HybridNitroPlayerSource(config: config)
  }
}
