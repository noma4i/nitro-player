import Foundation

final class PlaybackSessionRuntime {
  static let shared = PlaybackSessionRuntime()
  private let clientSuspensionKeyPrefix = "nitro-suspension:"

  let coordinator = PlaybackSessionCoordinator()
  let playbackSuspensionRegistry: PlaybackSuspensionRegistry

  private init() {
    let coordinator = self.coordinator
    playbackSuspensionRegistry = PlaybackSuspensionRegistry { key, allowGroups in
      return coordinator.suspend(reason: key, allowGroups: allowGroups).release
    }
  }

  func setForeground(_ foreground: Bool) {
    coordinator.setForeground(foreground)
  }

  func setSuspended(_ key: String, suspended: Bool, allowGroups: [String]? = nil) {
    playbackSuspensionRegistry.set(key: key, active: suspended, allowGroups: allowGroups)
  }

  func resetClientSuspensions() {
    playbackSuspensionRegistry.clear(keyPrefix: clientSuspensionKeyPrefix)
  }

  func stopAll() {
    coordinator.stopAll()
  }

  func stopManual() {
    coordinator.stopManual()
  }
}
