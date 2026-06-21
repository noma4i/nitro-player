//
//  HybridNitroPlayerViewManagerFactory.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation

class HybridNitroPlayerViewManagerFactory: HybridNitroPlayerViewManagerFactorySpec {
  func createViewManager(nitroId: Double) throws -> any HybridNitroPlayerViewManagerSpec {
    return try HybridNitroPlayerViewManager(nitroId: nitroId)
  }
}
