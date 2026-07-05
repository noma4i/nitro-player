import Foundation

enum PlaybackStateEmissionCoordinator {
  static func shouldBuildSnapshot(canEmitForLifecycle: Bool, hasPlaybackStateListeners: Bool) -> Bool {
    canEmitForLifecycle && hasPlaybackStateListeners
  }
}
