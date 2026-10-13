import Foundation

enum NativeAudioSessionTargetMode: Equatable {
  case inactive
  case playback
}

struct NativeAudioSessionLease: Equatable {
  let key: String
  let leaseId: UInt64
}

struct NativeAudioSessionSnapshot: Equatable {
  let targetMode: NativeAudioSessionTargetMode
  let appliedMode: NativeAudioSessionTargetMode?
  let leases: [NativeAudioSessionLease]
  let lastError: String?
}

final class NativeAudioSessionCoordinator {
  /// Submits one session XPC off the calling thread; completion must be delivered back on it.
  typealias SubmitApply = (NativeAudioSessionTargetMode, @escaping (Error?) -> Void) -> Void
  /// Blocking apply for the contract-sync paths only (external lease, media-services reset).
  typealias ApplySync = (NativeAudioSessionTargetMode) throws -> Void
  typealias ScheduleDowngrade = (@escaping () -> Void) -> Void

  private struct PendingDowngrade {
    let token: UInt64
  }

  private let submitApply: SubmitApply
  private let applySync: ApplySync
  private let scheduleDowngrade: ScheduleDowngrade
  private var leases: [NativeAudioSessionLease] = []
  private var nextLeaseId: UInt64 = 1
  private var nextDowngradeToken: UInt64 = 1
  private var nextExternalToken: UInt64 = 1
  private var externalTokens: Set<UInt64> = []
  private var foreground = true
  private(set) var snapshot: NativeAudioSessionSnapshot
  private var isApplyInFlight = false
  private var applyGeneration: UInt64 = 0
  private var needsReconcile = false
  private var pendingDowngrade: PendingDowngrade?

  init(submitApply: @escaping SubmitApply, applySync: @escaping ApplySync, scheduleDowngrade: @escaping ScheduleDowngrade) {
    self.submitApply = submitApply
    self.applySync = applySync
    self.scheduleDowngrade = scheduleDowngrade
    self.snapshot = NativeAudioSessionSnapshot(
      targetMode: .inactive,
      appliedMode: nil,
      leases: [],
      lastError: nil
    )
  }

  @discardableResult
  func acquire(key: String) -> NativeAudioSessionLease {
    let leaseId = nextLeaseId
    nextLeaseId += 1

    precondition(!key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

    let lease = NativeAudioSessionLease(key: key, leaseId: leaseId)
    leases.append(lease)
    snapshot = rebuiltSnapshot()
    reconcile()
    return lease
  }

  func release(_ lease: NativeAudioSessionLease) {
    let countBefore = leases.count
    leases.removeAll { stored in
      stored.key == lease.key && stored.leaseId == lease.leaseId
    }

    guard countBefore != leases.count else {
      return
    }

    snapshot = rebuiltSnapshot()
    reconcile()
  }

  var isForeign: Bool {
    !externalTokens.isEmpty
  }

  func setForeground(_ foreground: Bool) {
    guard self.foreground != foreground else {
      return
    }

    self.foreground = foreground
    snapshot = rebuiltSnapshot()
    reconcile()
  }

  /// Re-asserts the audio session after the process may have been suspended.
  ///
  /// A cached `appliedMode` is not proof: the system can deactivate the session while the process
  /// is suspended, and a pending downgrade may never have run. Dropping the cache forces the
  /// reconcile to actually re-apply the playback session instead of taking the equal-mode early
  /// return.
  func reassertAfterProcessResumption() {
    cancelPendingDowngrade()
    foreground = true

    guard !isForeign else {
      return
    }

    invalidateInFlightApply()
    snapshot = rebuiltSnapshot(appliedMode: nil)
    reconcile()
  }

  func beginExternalAudioSession() -> UInt64 {
    let token = nextExternalToken
    nextExternalToken += 1
    let wasForeign = isForeign
    externalTokens.insert(token)
    snapshot = rebuiltSnapshot()

    guard !wasForeign else {
      return token
    }

    cancelPendingDowngrade()
    applySyncNow(.inactive)
    return token
  }

  func endExternalAudioSession(_ token: UInt64) {
    guard externalTokens.remove(token) != nil, !isForeign else {
      return
    }

    cancelPendingDowngrade()
    invalidateInFlightApply()
    snapshot = rebuiltSnapshot(appliedMode: nil)
    reconcile()
  }

  func recoverSessionAfterRenderFailure() {
    guard !isForeign else {
      return
    }

    cancelPendingDowngrade()
    invalidateInFlightApply()
    snapshot = rebuiltSnapshot(appliedMode: nil)
    reconcile()
  }

  func handleMediaServicesReset() {
    cancelPendingDowngrade()
    snapshot = rebuiltSnapshot(appliedMode: nil)

    guard !isForeign else {
      return
    }

    applySyncNow(.inactive)
    snapshot = rebuiltSnapshot(appliedMode: nil)
    reconcile()
  }

  func invalidateAppliedMode() {
    invalidateInFlightApply()
    snapshot = NativeAudioSessionSnapshot(
      targetMode: snapshot.targetMode,
      appliedMode: nil,
      leases: snapshot.leases,
      lastError: snapshot.lastError
    )
    reconcile()
  }

  func retry() {
    reconcile()
  }

  private func reconcile() {
    guard !isForeign else {
      return
    }

    if isApplyInFlight {
      needsReconcile = true
      return
    }

    let targetMode = snapshot.targetMode
    if targetMode == snapshot.appliedMode {
      return
    }

    if let appliedMode = snapshot.appliedMode {
      if isUpgrade(from: appliedMode, to: targetMode) {
        applyNow(targetMode)
        return
      }

      if isDowngrade(from: appliedMode, to: targetMode) {
        scheduleIfNeeded()
        return
      }

      return
    }

    applyNow(targetMode)
  }

  private func scheduleIfNeeded() {
    guard pendingDowngrade == nil else {
      return
    }

    let token = nextDowngradeToken
    nextDowngradeToken += 1
    pendingDowngrade = PendingDowngrade(token: token)

    scheduleDowngrade { [weak self] in
      self?.applyPendingDowngradeIfNeeded(token)
    }
  }

  private func cancelPendingDowngrade() {
    pendingDowngrade = nil
    nextDowngradeToken += 1
  }

  private func applyPendingDowngradeIfNeeded(_ token: UInt64) {
    guard !isForeign else {
      return
    }
    guard let pending = pendingDowngrade, pending.token == token else {
      return
    }
    pendingDowngrade = nil

    snapshot = rebuiltSnapshot()

    guard let appliedMode = snapshot.appliedMode else {
      applyNow(snapshot.targetMode)
      return
    }

    if snapshot.targetMode == appliedMode || isUpgrade(from: appliedMode, to: snapshot.targetMode) {
      return
    }

    applyNow(snapshot.targetMode)
  }

  /// Session XPC never runs on the calling thread: submit one in-flight apply and settle state in
  /// its completion. While in flight, target changes only coalesce (`needsReconcile`); the
  /// completion reconciles once, so the latest target wins with at most one queued XPC.
  private func applyNow(_ targetMode: NativeAudioSessionTargetMode) {
    applyGeneration &+= 1
    let generation = applyGeneration
    isApplyInFlight = true
    submitApply(targetMode) { [weak self] error in
      self?.completeApply(generation: generation, targetMode: targetMode, error: error)
    }
  }

  private func completeApply(generation: UInt64, targetMode: NativeAudioSessionTargetMode, error: Error?) {
    guard generation == applyGeneration else {
      return
    }

    isApplyInFlight = false
    let hadPendingReconcile = needsReconcile
    needsReconcile = false

    if let error {
      snapshot = NativeAudioSessionSnapshot(
        targetMode: snapshot.targetMode,
        appliedMode: nil,
        leases: snapshot.leases,
        lastError: String(describing: error)
      )
    } else {
      snapshot = NativeAudioSessionSnapshot(
        targetMode: snapshot.targetMode,
        appliedMode: targetMode,
        leases: snapshot.leases,
        lastError: nil
      )
    }

    // A failed apply does not self-retry (storm guard); it re-reconciles only when the target
    // changed mid-flight, so the newest desired state still lands.
    if error == nil || hadPendingReconcile {
      reconcile()
    }
  }

  /// Contract-sync paths (external lease, media-services reset) block the caller by design and
  /// invalidate any in-flight async apply so its late completion cannot stomp this result.
  private func applySyncNow(_ targetMode: NativeAudioSessionTargetMode) {
    invalidateInFlightApply()
    needsReconcile = false
    do {
      try applySync(targetMode)
      snapshot = NativeAudioSessionSnapshot(
        targetMode: snapshot.targetMode,
        appliedMode: targetMode,
        leases: snapshot.leases,
        lastError: nil
      )
    } catch {
      snapshot = NativeAudioSessionSnapshot(
        targetMode: snapshot.targetMode,
        appliedMode: nil,
        leases: snapshot.leases,
        lastError: String(describing: error)
      )
    }
  }

  private func invalidateInFlightApply() {
    applyGeneration &+= 1
    isApplyInFlight = false
  }

  private func rebuiltSnapshot() -> NativeAudioSessionSnapshot {
    rebuiltSnapshot(appliedMode: snapshot.appliedMode)
  }

  private func rebuiltSnapshot(appliedMode: NativeAudioSessionTargetMode?) -> NativeAudioSessionSnapshot {
    let orderedLeases = leases.sorted { first, second in
      first.leaseId < second.leaseId
    }

    return NativeAudioSessionSnapshot(
      targetMode: targetMode(),
      appliedMode: appliedMode,
      leases: orderedLeases,
      lastError: snapshot.lastError
    )
  }

  private func targetMode() -> NativeAudioSessionTargetMode {
    if isForeign || !foreground || leases.isEmpty {
      return .inactive
    }
    return .playback
  }

  private func rank(_ mode: NativeAudioSessionTargetMode) -> Int {
    switch mode {
    case .inactive:
      return 0
    case .playback:
      return 1
    }
  }

  private func isUpgrade(from: NativeAudioSessionTargetMode, to: NativeAudioSessionTargetMode) -> Bool {
    rank(from) < rank(to)
  }

  private func isDowngrade(from: NativeAudioSessionTargetMode, to: NativeAudioSessionTargetMode) -> Bool {
    rank(from) > rank(to)
  }
}
