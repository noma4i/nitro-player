import Foundation

enum PlayPauseResolution {
  case playing
  case paused
  case keepCurrent
}

struct PlayIntentResolver {
  private(set) var wantsToPlay = false

  mutating func onPlay() { wantsToPlay = true }
  mutating func onPause() { wantsToPlay = false }
  mutating func onEnded() { wantsToPlay = false }
  mutating func onError() { wantsToPlay = false }
  mutating func onSourceChange() { wantsToPlay = false }
  mutating func onRelease() { wantsToPlay = false }

  func resolve(isPlaying: Bool) -> PlayPauseResolution {
    if isPlaying { return .playing }
    if wantsToPlay { return .keepCurrent }
    return .paused
  }
}
