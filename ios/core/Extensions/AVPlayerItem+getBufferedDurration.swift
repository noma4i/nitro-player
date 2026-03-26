//
//  AVPlayerItem+getBufferedPosition.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 06/05/2025.
//

import Foundation
import AVFoundation

extension AVPlayerItem {
  
  // Duration that can be played using only the buffer (seconds)
  func getbufferDuration() -> Double {
    var effectiveTimeRange: CMTimeRange?
    
    for value in loadedTimeRanges {
      let timeRange: CMTimeRange = value.timeRangeValue
      if CMTimeRangeContainsTime(timeRange, time: currentTime()) {
        effectiveTimeRange = timeRange
        break
      }
    }
    
    if let effectiveTimeRange {
      let bufferEnd = CMTimeGetSeconds(CMTimeRangeGetEnd(effectiveTimeRange))
      let current = CMTimeGetSeconds(currentTime())
      let playableDuration = bufferEnd - current
      if playableDuration > 0 {
        return playableDuration
      }
    }
    
    return 0
  }
}
