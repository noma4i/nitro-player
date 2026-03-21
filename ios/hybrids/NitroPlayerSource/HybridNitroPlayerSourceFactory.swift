//
//  HybridNitroPlayerSourceFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation

class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec {
  func fromNitroPlayerConfig(config: NativeNitroPlayerConfig) throws
    -> any HybridNitroPlayerSourceSpec
  {
    return try HybridNitroPlayerSource(config: config)
  }

  func fromUri(uri: String) throws -> HybridNitroPlayerSourceSpec {
    let config = NativeNitroPlayerConfig(
      uri: uri,
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
