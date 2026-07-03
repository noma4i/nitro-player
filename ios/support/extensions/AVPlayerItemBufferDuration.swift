//
//  AVPlayerItemBufferDuration.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 06/05/2025.
//

import Foundation
import AVFoundation

extension AVPlayerItem {
  
  // Duration that can be played using only the buffer (seconds)
  func getBufferDuration() -> Double {
    getBufferDuration(at: CMTimeGetSeconds(currentTime()))
  }

  func getBufferDuration(at currentTimeSeconds: Double) -> Double {
    var effectiveTimeRange: CMTimeRange?
    let playbackTime = CMTime(seconds: max(0, currentTimeSeconds.isFinite ? currentTimeSeconds : 0), preferredTimescale: 1000)
    
    for value in loadedTimeRanges {
      let timeRange: CMTimeRange = value.timeRangeValue
      if CMTimeRangeContainsTime(timeRange, time: playbackTime) {
        effectiveTimeRange = timeRange
        break
      }
    }
    
    if let effectiveTimeRange {
      let bufferEnd = CMTimeGetSeconds(CMTimeRangeGetEnd(effectiveTimeRange))
      let current = CMTimeGetSeconds(playbackTime)
      let playableDuration = bufferEnd - current
      if playableDuration > 0 {
        return playableDuration
      }
    }
    
    return 0
  }
}
