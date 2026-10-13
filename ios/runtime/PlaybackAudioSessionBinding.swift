import Foundation

struct NativePlaybackAudioLease: Equatable {
  let ownerId: UInt64
  let coordinatorLease: NativeAudioSessionLease
}

protocol NativePlaybackAudioSessionRuntimeProtocol: AnyObject {
  func acquirePlayback(key: String, policy: NativePlaybackAudioPolicy) -> NativePlaybackAudioLease
  func updatePlayback(_ lease: NativePlaybackAudioLease, policy: NativePlaybackAudioPolicy)
  func releasePlayback(_ lease: NativePlaybackAudioLease)
  func retry()
}

final class PlaybackAudioSessionBinding {
  private let key: String
  private let runtime: NativePlaybackAudioSessionRuntimeProtocol

  private var transportIntentActive = false
  private var lease: NativePlaybackAudioLease?
  private var lastPolicy: NativePlaybackAudioPolicy?

  init(key: String, runtime: NativePlaybackAudioSessionRuntimeProtocol) {
    precondition(!key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    self.key = key
    self.runtime = runtime
  }

  /// Session ownership follows the transport intent, never audibility: a muted player still plays
  /// and still owns the session. Tying the lease to `muted` turned every mute tap into a
  /// deactivate/activate round trip to mediaserverd.
  func prepareToPlay(policy: NativePlaybackAudioPolicy) {
    transportIntentActive = true
    ensureLease(for: policy)
  }

  func updatePolicy(_ policy: NativePlaybackAudioPolicy) {
    guard transportIntentActive else {
      return
    }

    ensureLease(for: policy)
  }

  func pause() {
    transportIntentActive = false
    releaseIfNeeded()
  }

  func release() {
    transportIntentActive = false
    releaseIfNeeded()
  }

  private func ensureLease(for policy: NativePlaybackAudioPolicy) {
    guard let currentLease = lease else {
      lease = runtime.acquirePlayback(key: key, policy: policy)
      lastPolicy = policy
      return
    }

    if lastPolicy == policy {
      runtime.retry()
      return
    }

    runtime.updatePlayback(currentLease, policy: policy)
    lastPolicy = policy
    runtime.retry()
  }

  private func releaseIfNeeded() {
    guard let currentLease = lease else {
      return
    }

    runtime.releasePlayback(currentLease)
    lease = nil
    lastPolicy = nil
  }
}
