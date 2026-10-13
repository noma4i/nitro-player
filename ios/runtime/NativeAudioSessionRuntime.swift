import Foundation

final class NativeAudioSessionRuntime: NativePlaybackAudioSessionRuntimeProtocol {
  /// Off-thread session XPC; completion is delivered back on the coordinator's thread (main).
  typealias SubmitApply = (NativeAudioSessionTargetMode, NativePlaybackAudioConfiguration?, @escaping (Error?) -> Void) -> Void
  /// Blocking apply reserved for the contract-sync paths (external lease, media-services reset).
  typealias ApplySync = (NativeAudioSessionTargetMode, NativePlaybackAudioConfiguration?) throws -> Void

  private struct PlaybackOwner {
    let key: String
    var coordinatorLease: NativeAudioSessionLease?
    var policy: NativePlaybackAudioPolicy
  }

  private let submitApply: SubmitApply
  private let applySync: ApplySync
  private let scheduleDowngrade: NativeAudioSessionCoordinator.ScheduleDowngrade
  private var nextOwnerId: UInt64 = 1
  private var playbackOwners: [UInt64: PlaybackOwner] = [:]
  private var appliedPlaybackConfiguration: NativePlaybackAudioConfiguration?
  private(set) var recoveryCount: UInt64 = 0
  /// Number of session transactions handed to the driver. Every increment is one blocking XPC to
  /// mediaserverd, so this is the acceptance gate for "mute must not touch the session".
  private(set) var applyCount: UInt64 = 0
  private lazy var coordinator = NativeAudioSessionCoordinator(
    submitApply: { [weak self] targetMode, completion in
      guard let self else {
        completion(nil)
        return
      }

      // The playback configuration is resolved at submit time; the cache commits only from the
      // completion so an in-flight failure cannot leave a lying `appliedPlaybackConfiguration`.
      let configuration = self.resolveConfiguration(for: targetMode)
      self.appliedPlaybackConfiguration = nil
      self.applyCount &+= 1
      self.submitApply(targetMode, configuration) { [weak self] error in
        guard let self else {
          completion(error)
          return
        }

        if error == nil, targetMode == .playback {
          self.appliedPlaybackConfiguration = configuration
        }
        completion(error)
        if error == nil, targetMode == .playback {
          self.reconcilePlaybackConfigurationIfNeeded()
        }
      }
    },
    applySync: { [weak self] targetMode in
      guard let self else {
        return
      }

      self.appliedPlaybackConfiguration = nil
      self.applyCount &+= 1
      try self.applySync(targetMode, self.resolveConfiguration(for: targetMode))
    },
    scheduleDowngrade: scheduleDowngrade
  )

  init(
    submitApply: @escaping SubmitApply,
    applySync: @escaping ApplySync,
    scheduleDowngrade: @escaping NativeAudioSessionCoordinator.ScheduleDowngrade
  ) {
    self.submitApply = submitApply
    self.applySync = applySync
    self.scheduleDowngrade = scheduleDowngrade
  }

  var snapshot: NativeAudioSessionSnapshot {
    coordinator.snapshot
  }

  var isForeign: Bool {
    coordinator.isForeign
  }

  var appliedProfile: String? {
    guard let configuration = appliedPlaybackConfiguration else {
      return nil
    }
    return "\(configuration.category):\(configuration.mixBehavior)"
  }

  func setForeground(_ foreground: Bool) {
    precondition(Thread.isMainThread)
    coordinator.setForeground(foreground)
  }

  func reassertAfterProcessResumption() {
    precondition(Thread.isMainThread)

    appliedPlaybackConfiguration = nil
    coordinator.reassertAfterProcessResumption()
  }

  func beginExternalAudioSession() -> UInt64 {
    precondition(Thread.isMainThread)
    return coordinator.beginExternalAudioSession()
  }

  func endExternalAudioSession(_ token: UInt64) {
    precondition(Thread.isMainThread)
    coordinator.endExternalAudioSession(token)
  }

  func recoverSessionAfterRenderFailure() {
    precondition(Thread.isMainThread)

    guard !coordinator.isForeign else {
      return
    }

    recoveryCount += 1
    coordinator.recoverSessionAfterRenderFailure()
  }

  func handleMediaServicesReset() {
    precondition(Thread.isMainThread)
    coordinator.handleMediaServicesReset()
  }

  @discardableResult
  func acquirePlayback(key: String, policy: NativePlaybackAudioPolicy) -> NativePlaybackAudioLease {
    precondition(Thread.isMainThread)

    let ownerId = nextOwnerId
    nextOwnerId += 1
    playbackOwners[ownerId] = PlaybackOwner(key: key, coordinatorLease: nil, policy: policy)
    let coordinatorLease = coordinator.acquire(key: key)
    playbackOwners[ownerId]?.coordinatorLease = coordinatorLease
    reconcilePlaybackConfigurationIfNeeded()

    return NativePlaybackAudioLease(ownerId: ownerId, coordinatorLease: coordinatorLease)
  }

  func updatePlayback(_ lease: NativePlaybackAudioLease, policy: NativePlaybackAudioPolicy) {
    precondition(Thread.isMainThread)

    guard var owner = playbackOwners[lease.ownerId],
      owner.key == lease.coordinatorLease.key,
      owner.coordinatorLease == lease.coordinatorLease else {
      return
    }

    owner.policy = policy
    playbackOwners[lease.ownerId] = owner
    reconcilePlaybackConfigurationIfNeeded()
  }

  func releasePlayback(_ lease: NativePlaybackAudioLease) {
    precondition(Thread.isMainThread)

    guard let owner = playbackOwners[lease.ownerId],
      owner.key == lease.coordinatorLease.key,
      owner.coordinatorLease == lease.coordinatorLease else {
      return
    }

    playbackOwners.removeValue(forKey: lease.ownerId)
    coordinator.release(lease.coordinatorLease)
    reconcilePlaybackConfigurationIfNeeded()
  }

  func invalidateAppliedMode() {
    precondition(Thread.isMainThread)

    appliedPlaybackConfiguration = nil
    coordinator.invalidateAppliedMode()
  }

  func retry() {
    precondition(Thread.isMainThread)

    coordinator.retry()
  }

  private func resolveConfiguration(for targetMode: NativeAudioSessionTargetMode) -> NativePlaybackAudioConfiguration? {
    guard targetMode == .playback else {
      return nil
    }
    return NativeAudioSessionPolicy.resolvePlayback(playbackOwners.values.map(\.policy))
  }

  private func reconcilePlaybackConfigurationIfNeeded() {
    guard !coordinator.isForeign else {
      return
    }
    guard coordinator.snapshot.targetMode == .playback,
      coordinator.snapshot.appliedMode == .playback else {
      return
    }

    let configuration = NativeAudioSessionPolicy.resolvePlayback(playbackOwners.values.map(\.policy))
    guard configuration != appliedPlaybackConfiguration else {
      return
    }

    coordinator.invalidateAppliedMode()
  }
}
