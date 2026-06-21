//
//  HybridNitroPlayerFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import Foundation
import NitroModules

class HybridNitroPlayerFactory: HybridNitroPlayerFactorySpec {
  func createPlayer(source: HybridNitroPlayerSourceSpec) throws -> HybridNitroPlayerSpec {
    return try HybridNitroPlayer(source: source)
  }
}
