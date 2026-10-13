import AVFoundation
import Foundation

internal final class NativeAVAudioSessionDriver {
  internal enum DriverError: Error {
    case missingPlaybackConfiguration
  }

  private let audioSession: AVAudioSession
  // AVAudioSession activate/deactivate is a blocking XPC to mediaserverd (hundreds of ms to
  // seconds under exclusive-focus transitions). It must never run on the main thread; this serial
  // queue keeps apply order while `applySync` (contract-sync paths) serializes via `queue.sync`.
  private let sessionQueue = DispatchQueue(label: "com.nitroplay.audio-session")

  init(audioSession: AVAudioSession = AVAudioSession.sharedInstance()) {
    self.audioSession = audioSession
  }

  func applyAsync(
    _ targetMode: NativeAudioSessionTargetMode,
    _ configuration: NativePlaybackAudioConfiguration?,
    completion: @escaping (Error?) -> Void
  ) {
    sessionQueue.async { [weak self] in
      guard let self else {
        DispatchQueue.main.async { completion(nil) }
        return
      }

      var applyError: Error?
      do {
        try self.apply(targetMode, configuration)
      } catch {
        applyError = error
      }
      DispatchQueue.main.async { completion(applyError) }
    }
  }

  func applySync(_ targetMode: NativeAudioSessionTargetMode, _ configuration: NativePlaybackAudioConfiguration?) throws {
    try sessionQueue.sync {
      try apply(targetMode, configuration)
    }
  }

  private func apply(_ targetMode: NativeAudioSessionTargetMode, _ configuration: NativePlaybackAudioConfiguration?) throws {
    switch targetMode {
    case .inactive:
      try audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
    case .playback:
      guard let configuration else {
        throw DriverError.missingPlaybackConfiguration
      }

      let category: AVAudioSession.Category
      let mode: AVAudioSession.Mode
      switch configuration.category {
      case .playback:
        category = .playback
        mode = .moviePlayback
      case .ambient:
        category = .ambient
        mode = .default
      case .soloAmbient:
        category = .soloAmbient
        mode = .default
      }

      let options: AVAudioSession.CategoryOptions
      switch configuration.mixBehavior {
      case .exclusive:
        options = []
      case .mixWithOthers:
        options = [.mixWithOthers]
      case .duckOthers:
        options = [.mixWithOthers, .duckOthers]
      }

      try audioSession.setCategory(category, mode: mode, options: options)
      try audioSession.setActive(true)
    }
  }
}

extension NativeAudioSessionRuntime {
  // Handing playback from one feed slot to the next releases the old lease before the new one is
  // taken, and the gap spans runloop turns. Without this window every swipe paid a full
  // deactivate/activate pair (measured: 4 session transactions per 10 swipes).
  private static let downgradeHysteresis: TimeInterval = 0.7

  static let shared: NativeAudioSessionRuntime = {
    let driver = NativeAVAudioSessionDriver()
    return NativeAudioSessionRuntime(
      submitApply: { targetMode, configuration, completion in
        driver.applyAsync(targetMode, configuration, completion: completion)
      },
      applySync: { targetMode, configuration in
        try driver.applySync(targetMode, configuration)
      },
      scheduleDowngrade: { callback in
        DispatchQueue.main.asyncAfter(deadline: .now() + downgradeHysteresis, execute: callback)
      }
    )
  }()
}
