struct NativeSystemAudioEventSnapshot: Equatable {
  let interruptionActive: Bool
  let outputLossCount: UInt64
  let mediaServicesResetCount: UInt64
  let revision: UInt64
}

final class NativeSystemAudioEventEngine {
  private enum Event {
    case interruptionBegan
    case interruptionEnded(Bool)
    case oldOutputDeviceBecameUnavailable
    case mediaServicesWereReset
  }

  private let setInterruptionSuspended: (Bool) -> Void
  private let invalidateAudioSession: () -> Void
  private let stopAll: () -> Void
  private let stopManual: () -> Void
  private let pauseUnboundTransient: () -> Void
  private let resumeUnboundTransient: () -> Void
  private let stopUnbound: () -> Void
  private let muteOutput: () -> Void
  private let notifyOutputDeviceLost: () -> Void
  private let recoverAfterMediaServicesReset: () -> Void

  private var interruptionActive = false
  private var outputLossCount: UInt64 = 0
  private var mediaServicesResetCount: UInt64 = 0
  private var revision: UInt64 = 0
  private var events: [Event] = []
  private var isDraining = false

  /// True while an audio interruption raised by the system has not been closed yet.
  var hasActiveInterruption: Bool {
    interruptionActive
  }

  init(
    setInterruptionSuspended: @escaping (Bool) -> Void,
    invalidateAudioSession: @escaping () -> Void,
    stopAll: @escaping () -> Void,
    stopManual: @escaping () -> Void,
    pauseUnboundTransient: @escaping () -> Void,
    resumeUnboundTransient: @escaping () -> Void,
    stopUnbound: @escaping () -> Void,
    muteOutput: @escaping () -> Void,
    notifyOutputDeviceLost: @escaping () -> Void,
    recoverAfterMediaServicesReset: @escaping () -> Void
  ) {
    self.setInterruptionSuspended = setInterruptionSuspended
    self.invalidateAudioSession = invalidateAudioSession
    self.stopAll = stopAll
    self.stopManual = stopManual
    self.pauseUnboundTransient = pauseUnboundTransient
    self.resumeUnboundTransient = resumeUnboundTransient
    self.stopUnbound = stopUnbound
    self.muteOutput = muteOutput
    self.notifyOutputDeviceLost = notifyOutputDeviceLost
    self.recoverAfterMediaServicesReset = recoverAfterMediaServicesReset
  }

  var snapshot: NativeSystemAudioEventSnapshot {
    NativeSystemAudioEventSnapshot(
      interruptionActive: interruptionActive,
      outputLossCount: outputLossCount,
      mediaServicesResetCount: mediaServicesResetCount,
      revision: revision
    )
  }

  func interruptionBegan() {
    enqueue(.interruptionBegan)
  }

  func interruptionEnded(shouldResume: Bool) {
    enqueue(.interruptionEnded(shouldResume))
  }

  /// Resolves an interruption that the system never closed.
  ///
  /// iOS is not obliged to deliver `.ended` for an audio interruption - most notably when the
  /// process was suspended while the interruption was active. The suspension raised on `.began`
  /// blocks every playback group, so a missing `.ended` silences the whole app until relaunch.
  /// Being active in the foreground proves the interruption is over, so it is resolved from that
  /// fact instead of waiting for an event that may never arrive.
  func resolveInterruptionIfStillActive() {
    guard interruptionActive else {
      return
    }
    enqueue(.interruptionEnded(true))
  }

  func oldOutputDeviceBecameUnavailable() {
    enqueue(.oldOutputDeviceBecameUnavailable)
  }

  func mediaServicesWereReset() {
    enqueue(.mediaServicesWereReset)
  }

  private func enqueue(_ event: Event) {
    events.append(event)
    drain()
  }

  private func drain() {
    guard !isDraining else {
      return
    }

    isDraining = true
    defer {
      isDraining = false
    }

    while !events.isEmpty {
      let event = events.removeFirst()
      transition(event)
    }
  }

  private func transition(_ event: Event) {
    switch event {
    case .interruptionBegan:
      guard !interruptionActive else {
        return
      }

      interruptionActive = true
      revision += 1
      setInterruptionSuspended(true)
      pauseUnboundTransient()
    case .interruptionEnded(let shouldResume):
      guard interruptionActive else {
        return
      }

      interruptionActive = false
      revision += 1

      if shouldResume {
        invalidateAudioSession()
        setInterruptionSuspended(false)
        resumeUnboundTransient()
      } else {
        stopAll()
        stopUnbound()
        setInterruptionSuspended(false)
      }
    case .oldOutputDeviceBecameUnavailable:
      outputLossCount += 1
      revision += 1
      muteOutput()
      stopManual()
      stopUnbound()
      notifyOutputDeviceLost()
    case .mediaServicesWereReset:
      mediaServicesResetCount += 1
      revision += 1
      recoverAfterMediaServicesReset()
    }
  }
}
