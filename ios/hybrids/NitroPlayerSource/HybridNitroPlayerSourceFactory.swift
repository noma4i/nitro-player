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
      headers: nil,
      metadata: nil,
      lifecycle: .balanced,
      initialization: .eager,
      advanced: nil
    )
    return try HybridNitroPlayerSource(config: config)
  }
}
