import Foundation

enum PlaybackSessionResumeMode {
  case automatic
  case manual
}

enum PlaybackSessionIntent {
  case play
  case idle
}

enum PlaybackSessionEffectiveState {
  case playing
  case paused
}

enum PlaybackSessionDirectiveCommand {
  case play
  case pause
  case idle
}

struct PlaybackSessionPolicy {
  let group: String
  let priority: Int
  let resume: PlaybackSessionResumeMode
}

struct PlaybackSessionDirective {
  let command: PlaybackSessionDirectiveCommand
  let leaseId: Int
}

struct PlaybackSessionSnapshot {
  let key: String
  let leaseId: Int
  let policy: PlaybackSessionPolicy
  let intent: PlaybackSessionIntent
  let intentSequence: Int
  let effectiveState: PlaybackSessionEffectiveState
}

struct PlaybackSessionSuspensionSnapshot {
  let token: Int
  let reason: String
  let allowGroups: [String]?
}

struct PlaybackSessionCoordinatorSnapshot {
  let foreground: Bool
  let activeLeaseId: Int?
  let suspensions: [PlaybackSessionSuspensionSnapshot]
  let sessions: [PlaybackSessionSnapshot]
  let revision: Int
}

final class PlaybackSessionSuspensionHandle {
  private var released = false
  private let releaseAction: () -> Void

  init(releaseAction: @escaping () -> Void) {
    self.releaseAction = releaseAction
  }

  func release() {
    guard !released else {
      return
    }

    released = true
    releaseAction()
  }
}

final class PlaybackSessionCoordinator {
  private typealias DirectiveHandler = (PlaybackSessionDirective) -> Void

  private struct Session {
    let key: String
    let leaseId: Int
    let policy: PlaybackSessionPolicy
    let onDirective: DirectiveHandler
    var intent: PlaybackSessionIntent = .idle
    var intentSequence = 0
    var effectiveState: PlaybackSessionEffectiveState = .paused
  }

  private struct Suspension {
    let token: Int
    let reason: String
    let allowGroups: Set<String>?
  }

  private struct QueuedDirective {
    let handler: DirectiveHandler
    let directive: PlaybackSessionDirective
    let shouldDeliver: () -> Bool
  }

  private var foreground = true
  private var activeLeaseId: Int?
  private var sessions: [Int: Session] = [:]
  private var suspensions: [Int: Suspension] = [:]
  private var nextLeaseId = 1
  private var nextSuspensionToken = 1
  private var nextIntentSequence = 1
  private var revision = 0
  private var queuedDirectives: [QueuedDirective] = []
  private var isDraining = false

  @discardableResult
  func register(key: String, policy: PlaybackSessionPolicy, onDirective: @escaping (PlaybackSessionDirective) -> Void) -> Int {
    let leaseId = nextLeaseId
    nextLeaseId += 1
    sessions[leaseId] = Session(key: key, leaseId: leaseId, policy: policy, onDirective: onDirective)
    revision += 1
    return leaseId
  }

  func unregister(key: String, leaseId: Int) {
    guard let session = sessions[leaseId], session.key == key else {
      return
    }

    sessions.removeValue(forKey: leaseId)
    revision += 1

    if activeLeaseId == leaseId {
      activeLeaseId = nil
      enqueue(session, .pause, requiresCurrentState: false)
    }

    resolve(manualLossBecomesIdle: true)
    drainDirectives()
  }

  func setIntent(key: String, leaseId: Int, intent: PlaybackSessionIntent) {
    guard var session = sessions[leaseId], session.key == key, session.intent != intent else {
      return
    }

    session.intent = intent
    if intent == .play {
      session.intentSequence = nextIntentSequence
      nextIntentSequence += 1
    }
    sessions[leaseId] = session
    revision += 1
    resolve(manualLossBecomesIdle: intent == .play)
    drainDirectives()
  }

  func setForeground(_ foreground: Bool) {
    guard self.foreground != foreground else {
      return
    }

    self.foreground = foreground
    revision += 1
    // Backgrounding pauses without dropping manual intent so foreground resolve resumes the session.
    resolve(manualLossBecomesIdle: false)
    drainDirectives()
  }

  func suspend(reason: String, allowGroups: [String]? = nil) -> PlaybackSessionSuspensionHandle {
    let token = nextSuspensionToken
    nextSuspensionToken += 1
    suspensions[token] = Suspension(token: token, reason: reason, allowGroups: allowGroups.map(Set.init))
    revision += 1
    resolve(manualLossBecomesIdle: true)
    drainDirectives()
    return PlaybackSessionSuspensionHandle { [weak self] in
      self?.releaseSuspension(token)
    }
  }

  func stopAll() {
    let affected = sessions.values.filter { $0.intent == .play }
    guard !affected.isEmpty else {
      return
    }

    let active = activeLeaseId.flatMap { sessions[$0] }
    for leaseId in sessions.keys {
      guard var session = sessions[leaseId], session.intent == .play else {
        continue
      }
      session.intent = .idle
      session.effectiveState = .paused
      sessions[leaseId] = session
    }
    activeLeaseId = nil
    revision += 1

    if let active {
      enqueue(active, .pause)
      enqueue(active, .idle)
    }
    for session in affected.sorted(by: { $0.leaseId < $1.leaseId }) where session.leaseId != active?.leaseId {
      enqueue(session, .idle)
    }
    drainDirectives()
  }

  func stopManual() {
    let affected = sessions.values.filter { $0.policy.resume == .manual && $0.intent == .play }
    guard !affected.isEmpty else {
      return
    }

    let active = activeLeaseId.flatMap { sessions[$0] }.flatMap { $0.policy.resume == .manual ? $0 : nil }
    for leaseId in affected.map(\.leaseId) {
      guard var session = sessions[leaseId] else {
        continue
      }
      session.intent = .idle
      session.effectiveState = .paused
      sessions[leaseId] = session
    }
    if active != nil {
      activeLeaseId = nil
    }
    revision += 1

    if let active {
      enqueue(active, .pause)
      enqueue(active, .idle)
    }
    for session in affected.sorted(by: { $0.leaseId < $1.leaseId }) where session.leaseId != active?.leaseId {
      enqueue(session, .idle)
    }
    resolve(manualLossBecomesIdle: false)
    drainDirectives()
  }

  func isActive(key: String, leaseId: Int) -> Bool {
    guard activeLeaseId == leaseId, let session = sessions[leaseId] else {
      return false
    }

    return session.key == key
  }

  func snapshot() -> PlaybackSessionCoordinatorSnapshot {
    PlaybackSessionCoordinatorSnapshot(
      foreground: foreground,
      activeLeaseId: activeLeaseId,
      suspensions: suspensions.values
        .sorted(by: { $0.token < $1.token })
        .map { SuspensionSnapshot($0) },
      sessions: sessions.values
        .sorted(by: { $0.leaseId < $1.leaseId })
        .map { SessionSnapshot($0) },
      revision: revision
    )
  }

  private func releaseSuspension(_ token: Int) {
    guard suspensions.removeValue(forKey: token) != nil else {
      return
    }

    revision += 1
    resolve(manualLossBecomesIdle: true)
    drainDirectives()
  }

  private func resolve(manualLossBecomesIdle: Bool) {
    let winner = winningSession()
    guard winner?.leaseId != activeLeaseId else {
      return
    }

    if let activeLeaseId, var active = sessions[activeLeaseId] {
      active.effectiveState = .paused
      sessions[activeLeaseId] = active
      self.activeLeaseId = nil
      enqueue(active, .pause)
      if active.policy.resume == .manual && manualLossBecomesIdle {
        active.intent = .idle
        sessions[active.leaseId] = active
        enqueue(active, .idle)
      }
    }

    guard var next = winningSession() else {
      return
    }

    next.effectiveState = .playing
    sessions[next.leaseId] = next
    activeLeaseId = next.leaseId
    enqueue(next, .play)
  }

  private func winningSession() -> Session? {
    sessions.values
      .filter(isEligible)
      .sorted {
        if $0.policy.priority != $1.policy.priority {
          return $0.policy.priority > $1.policy.priority
        }
        if $0.intentSequence != $1.intentSequence {
          return $0.intentSequence > $1.intentSequence
        }
        if $0.key != $1.key {
          return $0.key < $1.key
        }
        return $0.leaseId < $1.leaseId
      }
      .first
  }

  private func isEligible(_ session: Session) -> Bool {
    guard foreground, session.intent == .play else {
      return false
    }

    return suspensions.values.allSatisfy { suspension in
      guard let allowGroups = suspension.allowGroups else {
        return false
      }
      return allowGroups.contains(session.policy.group)
    }
  }

  private func enqueue(
    _ session: Session,
    _ command: PlaybackSessionDirectiveCommand,
    requiresCurrentState: Bool = true
  ) {
    queuedDirectives.append(
      QueuedDirective(
        handler: session.onDirective,
        directive: PlaybackSessionDirective(command: command, leaseId: session.leaseId),
        shouldDeliver: { [weak self] in
          guard requiresCurrentState, let current = self?.sessions[session.leaseId] else {
            return !requiresCurrentState
          }

          switch command {
          case .play:
            return self?.activeLeaseId == session.leaseId && current.effectiveState == .playing
          case .pause:
            return current.effectiveState == .paused
          case .idle:
            return current.intent == .idle
          }
        }
      )
    )
  }

  private func drainDirectives() {
    guard !isDraining else {
      return
    }

    isDraining = true
    while !queuedDirectives.isEmpty {
      let directive = queuedDirectives.removeFirst()
      if directive.shouldDeliver() {
        directive.handler(directive.directive)
      }
    }
    isDraining = false
  }

  private func SessionSnapshot(_ session: Session) -> PlaybackSessionSnapshot {
    PlaybackSessionSnapshot(
      key: session.key,
      leaseId: session.leaseId,
      policy: session.policy,
      intent: session.intent,
      intentSequence: session.intentSequence,
      effectiveState: session.effectiveState
    )
  }

  private func SuspensionSnapshot(_ suspension: Suspension) -> PlaybackSessionSuspensionSnapshot {
    PlaybackSessionSuspensionSnapshot(
      token: suspension.token,
      reason: suspension.reason,
      allowGroups: suspension.allowGroups.map { $0.sorted() }
    )
  }
}
