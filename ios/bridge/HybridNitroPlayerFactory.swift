//
//  HybridNitroPlayerFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import Foundation
import NitroModules

class HybridNitroPlayerFactory: HybridNitroPlayerFactorySpec {
  private let mainThreadExecutor = MainThreadResourceExecutor()

  func createPlayer(source: HybridNitroPlayerSourceSpec) throws -> HybridNitroPlayerSpec {
    let result = mainThreadExecutor.run {
      Result { try HybridNitroPlayer(source: source) }
    }
    return try result.get()
  }
}
