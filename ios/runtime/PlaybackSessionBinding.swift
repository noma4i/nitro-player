import Foundation

struct PlaybackSessionBindingSnapshot {
  let key: String?
  let leaseId: Int?
  let policy: PlaybackSessionPolicy?
  let eligible: Bool
  let requested: Bool
  let desiredPlayback: Bool
  let released: Bool
}

enum PlaybackEligibility {
  static func resolve(active: Bool, visible: Bool, attached: Bool, requiresView: Bool) -> Bool {
    active && visible && (!requiresView || attached)
  }
}

final class PlaybackSessionBinding {
  private let coordinator: PlaybackSessionCoordinator
  private let play: () -> Void
  private let pause: () -> Void
  private let idle: () -> Void
  private var key: String?
  private var leaseId: Int?
  private var policy: PlaybackSessionPolicy?
  private var eligible = false
  private var requested = false
  private var released = false

  init(
    coordinator: PlaybackSessionCoordinator,
    play: @escaping () -> Void,
    pause: @escaping () -> Void,
    idle: @escaping () -> Void
  ) {
    self.coordinator = coordinator
    self.play = play
    self.pause = pause
    self.idle = idle
  }

  func configure(key: String, policy: PlaybackSessionPolicy) {
    guard !released else {
      return
    }
    guard self.key != key
      || self.policy?.group != policy.group
      || self.policy?.priority != policy.priority
      || self.policy?.resume != policy.resume else {
      return
    }

    if let oldKey = self.key, let oldLeaseId = leaseId {
      coordinator.unregister(key: oldKey, leaseId: oldLeaseId)
    }

    self.key = key
    self.policy = policy
    leaseId = coordinator.register(key: key, policy: policy) { [weak self] directive in
      self?.handle(directive)
    }
    syncIntent()
  }

  func updateEligibility(eligible: Bool) {
    guard !released, self.eligible != eligible else {
      return
    }

    self.eligible = eligible
    syncIntent()
  }

  func requestPlay() {
    guard !released, key != nil, leaseId != nil else {
      return
    }

    guard requested else {
      requested = true
      syncIntent()
      return
    }

    guard eligible, let key, let leaseId, coordinator.isActive(key: key, leaseId: leaseId) else {
      return
    }
    play()
  }

  func requestIdle() {
    guard !released, requested else {
      return
    }

    requested = false
    syncIntent()
  }

  func release() {
    guard !released else {
      return
    }

    if let key, let leaseId {
      coordinator.unregister(key: key, leaseId: leaseId)
    }
    released = true
    key = nil
    leaseId = nil
    policy = nil
    requested = false
  }

  func snapshot() -> PlaybackSessionBindingSnapshot {
    PlaybackSessionBindingSnapshot(
      key: key,
      leaseId: leaseId,
      policy: policy,
      eligible: eligible,
      requested: requested,
      desiredPlayback: desiredPlayback,
      released: released
    )
  }

  private var desiredPlayback: Bool {
    eligible && requested && key != nil && leaseId != nil && !released
  }

  private func syncIntent() {
    guard let key, let leaseId else {
      return
    }

    coordinator.setIntent(key: key, leaseId: leaseId, intent: desiredPlayback ? .play : .idle)
  }

  private func handle(_ directive: PlaybackSessionDirective) {
    switch directive.command {
    case .play:
      play()
    case .pause:
      pause()
    case .idle:
      requested = false
      idle()
    }
  }
}
