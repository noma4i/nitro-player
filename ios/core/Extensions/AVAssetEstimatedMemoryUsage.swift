//
//  AVAssetEstimatedMemoryUsage.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/01/2025.
//

import AVFoundation
import Foundation

extension AVAsset {
  var estimatedMemoryUsage: Int {
    guard let urlAsset = self as? AVURLAsset else {
      return 0
    }

    if urlAsset.url.isFileURL {
      let resourceValues = try? urlAsset.url.resourceValues(forKeys: [.fileSizeKey])
      if let fileSize = resourceValues?.fileSize, fileSize > 0 {
        return fileSize
      }
    }

    return 0
  }
}
