import AVFoundation
import Foundation

final class HybridNitroFeedRingPlayer: HybridNitroFeedRingPlayerSpec {
  private static let ringTokenLock = NSLock()
  private static var nextRingToken: Int64 = 1

  private final class CatalogItem {
    let index: Int
    let itemId: String?
    let sourceKey: String?
    let source: (any HybridNitroPlayerSourceSpec)?

    init(index: Int, itemId: String?, sourceKey: String?, source: (any HybridNitroPlayerSourceSpec)?) {
      self.index = index
      self.itemId = itemId
      self.sourceKey = sourceKey
      self.source = source
    }
  }

  private struct PlaybackIntent: Equatable {
    let desiredAndCommitted: Bool
    let muted: Bool
  }

  private final class SlotState: RingSlotDiagnosticsProviding {
    let slotId: Int
    let player: HybridNitroPlayer
    var assignedIndex: Int?
    var itemId: String?
    var sourceKey: String?
    var generation: Int64 = 0
    var desiredPlay = false
    var awaitingSourceCommit = false
    var lastTransition = "empty"
    var lastError: String?
    var recoveryAttempt = 0
    var recoveryAssignedIndex: Int?
    var recoverySourceKey: String?
    var recoveryWorkItem: DispatchWorkItem?
    var recoveryScheduleToken = 0
    var lastPlaybackIntent: PlaybackIntent?

    init(slotId: Int) {
      precondition(Thread.isMainThread, "Feed ring slots must be created on the main thread")
      self.slotId = slotId
      self.player = HybridNitroPlayer()
      self.player.isRingSlot = true
      self.player.ringSlotDiagnosticsProvider = self
    }

    func ringSlotDiagnostics() -> RingSlotDiagnostics {
      precondition(Thread.isMainThread)
      return RingSlotDiagnostics(
        slotId: slotId,
        assignedIndex: assignedIndex,
        awaitingSourceCommit: awaitingSourceCommit,
        desiredPlay: desiredPlay,
        lastTransition: lastTransition
      )
    }
  }

  private let slots = [SlotState(slotId: 0), SlotState(slotId: 1), SlotState(slotId: 2)]
  private let sourceFactory = HybridNitroPlayerSourceFactory()
  private let planner = FeedRingWindowPlanner(slotCount: 3)
  private let commandPlanner = FeedRingCommandPlanner()
  private let listenerRegistry = ListenerRegistry()
  private let recoveryDelaysMs = [250, 1000, 3000, 8000, 15000]
  private let maxRecoveryAttempts = 7
  let ringToken = allocateRingToken()
  private var sourceCatalog: [Int: CatalogItem] = [:]
  private var lastActivationId: Int64 = -1
  private var lastProjectionRevision: Int64 = -1
  /// Records which foreground epoch the last accepted projection belongs to, so recovery can tell
  /// a stale projection from a fresh one.
  private var lastAcceptedProjectionEpoch: UInt64 = 0
  private var released = false
  private var slotListenersConfigured = false

  override init() {
    precondition(Thread.isMainThread, "Feed ring player must be created on the main thread")
    super.init()
    NitroPlayerManager.shared.register(feedRing: self)
  }

  /// True when the last accepted projection was issued at or after the given foreground epoch.
  func hasAcceptedProjection(after epoch: UInt64) -> Bool {
    lastAcceptedProjectionEpoch >= epoch
  }

  func getPlayer(slotId: Double) throws -> any HybridNitroPlayerSpec {
    try syncMain {
      if released {
        throw ringError("Feed ring player is released")
      }

      let normalizedSlotId = try normalizeSlotId(decodeBridgeInt(slotId, field: "slotId"))
      return slots[normalizedSlotId].player
    }
  }

  func configurePlayback(key: String, group: String, priority: Double, resumeAutomatically: Bool) throws {
    try syncMain {
      if released {
        throw ringError("Feed ring player is released")
      }

      for slot in slots {
        try slot.player.configurePlayback(
          key: "\(key):slot-\(slot.slotId)",
          group: group,
          priority: priority,
          resumeAutomatically: resumeAutomatically,
          requiresView: true
        )
      }
    }
  }

  func applyProjection(projection: FeedRingProjection) throws {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.released else {
        return
      }

      let activationId: Int64
      let revision: Int64
      let windowCenterIndex: Int
      let playbackIndex: Int
      do {
        activationId = try self.decodeBridgeInt64(projection.activationId, field: "activationId")
        revision = try self.decodeBridgeInt64(projection.revision, field: "revision")
        windowCenterIndex = try self.decodeBridgeInt(projection.windowCenterIndex, field: "windowCenterIndex")
        playbackIndex = try self.decodeBridgeInt(projection.playbackIndex, field: "playbackIndex")
        if abs(Int64(playbackIndex) - Int64(windowCenterIndex)) > 1 {
          throw self.ringError("Feed ring playbackIndex must belong to the prepared window")
        }
      } catch {
        self.emitCommandEvent(
          kind: "apply-error",
          projectionRevision: projection.revision.isFinite ? projection.revision : -1,
          error: error.localizedDescription
        )
        return
      }

      if activationId > self.lastActivationId {
        self.lastActivationId = activationId
        self.lastProjectionRevision = -1
        self.planner.resetRevisions()
      }

      if revision <= self.lastProjectionRevision {
        self.emitCommandEvent(kind: "rejected", projectionRevision: projection.revision)
        return
      }

      self.lastProjectionRevision = revision
      var parseErrors: [String] = []
      if let catalog = projection.catalog {
        let items = catalog.items.compactMap { item -> CatalogItem? in
          do {
            return try self.parseCatalogItem(item)
          } catch {
            parseErrors.append(error.localizedDescription)
            return nil
          }
        }
        _ = self.planner.replaceCatalog(
          FeedRingCatalogState(
            revision: revision,
            entries: items.map(self.plannerEntry)
          )
        )
        self.sourceCatalog.removeAll(keepingCapacity: true)
        for item in items {
          self.sourceCatalog[item.index] = item
        }
        self.resetRecoveryForCatalogChanges()
      }

      _ = self.planner.commitViewport(
        FeedRingViewportState(
          revision: revision,
          windowCenterIndex: windowCenterIndex,
          playbackIndex: playbackIndex,
          playbackAllowed: projection.playbackAllowed,
          muted: projection.muted
        )
      )
      try? self.reconcileWindow()
      self.lastAcceptedProjectionEpoch = NitroPlayerManager.shared.currentForegroundEpoch
      self.emitCommandEvent(kind: "accepted", projectionRevision: projection.revision)
      if !parseErrors.isEmpty {
        self.emitCommandEvent(
          kind: "apply-error",
          projectionRevision: projection.revision,
          error: parseErrors.joined(separator: "; ")
        )
      }
    }
  }

  func snapshot() throws -> FeedRingSnapshot {
    try syncMain {
      let plannerSnapshot = planner.snapshot()
      return FeedRingSnapshot(
        catalogRevision: Double(plannerSnapshot.catalogRevision),
        viewportRevision: Double(plannerSnapshot.viewportRevision),
        catalogSize: Double(plannerSnapshot.catalogSize),
        windowCenterIndex: plannerSnapshot.windowCenterIndex.map(Double.init),
        playbackIndex: plannerSnapshot.playbackIndex.map(Double.init),
        playbackAllowed: plannerSnapshot.playbackAllowed,
        muted: plannerSnapshot.muted,
        released: released,
        slots: slots.map(snapshotSlot)
      )
    }
  }

  func addSlotStateListener(listener: @escaping (FeedRingSlotState) -> Void) throws -> ListenerSubscription {
    try syncMain {
      configureSlotListenersIfNeeded()
      let subscription = listenerRegistry.add(event: "slotState", listener: listener)
      slots.forEach { emitSlotState($0) }
      return subscription
    }
  }

  func addCommandEventListener(listener: @escaping (FeedRingCommandEvent) -> Void) throws -> ListenerSubscription {
    try syncMain {
      listenerRegistry.add(event: "commandEvent", listener: listener)
    }
  }

  func release() throws {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.released else { return }

      self.released = true
      NitroPlayerManager.shared.unregister(feedRing: self)
      self.listenerRegistry.clearAll()
      for slot in self.slots {
        self.resetRecovery(slot)
        slot.desiredPlay = false
        slot.player.release()
        slot.assignedIndex = nil
        slot.itemId = nil
        slot.sourceKey = nil
        slot.generation += 1
        slot.lastTransition = "released"
        self.emitSlotState(slot)
      }
    }
  }

  private func parseCatalogItem(_ item: FeedRingCatalogItem) throws -> CatalogItem {
    let source = try item.source.map { try sourceFactory.fromNitroPlayerConfig(config: $0) }
    return CatalogItem(
      index: try decodeBridgeInt(item.index, field: "catalog.index"),
      itemId: item.itemId,
      sourceKey: item.sourceKey,
      source: source
    )
  }

  private func plannerEntry(from item: CatalogItem) -> FeedRingCatalogEntry {
    FeedRingCatalogEntry(
      index: item.index,
      itemId: item.itemId,
      sourceKey: item.sourceKey,
      hasSource: item.source != nil
    )
  }

  private func reconcileWindow() throws {
    let plannedSlots = planner.plannedSlots()
    let commands = commandPlanner.plan(plannedSlots: plannedSlots, slots: slots.map(commandSlotState))
    for command in commands {
      try executeCommand(command)
    }

    if !plannedSlots.isEmpty {
      try reconcilePlayback()
    }
  }

  private func executeCommand(_ command: FeedRingCommand) throws {
    let slot = slots[command.slotId]
    switch command.action {
    case .clear:
      try clearSlot(
        slot,
        reason: command.reason ?? "clear",
        assignedIndex: command.assignedIndex,
        itemId: command.itemId,
        hadSource: command.hadSource
      )
    case .replace, .reuse:
      try commitPlayableCommand(command, slot: slot)
    }
  }

  private func commitPlayableCommand(_ command: FeedRingCommand, slot: SlotState) throws {
    guard
      let assignedIndex = command.assignedIndex,
      let sourceKey = command.sourceKey,
      let source = sourceCatalog[assignedIndex]?.source
    else {
      try clearSlot(
        slot,
        reason: "empty-source",
        assignedIndex: command.assignedIndex,
        itemId: command.itemId,
        hadSource: command.hadSource
      )
      return
    }

    let shouldPlay = command.shouldPlay
    if
      command.action == .replace,
      slot.lastTransition == "retry-wait",
      slot.recoveryWorkItem != nil,
      hasRecoveryTarget(slot, assignedIndex: assignedIndex, sourceKey: sourceKey)
    {
      slot.assignedIndex = assignedIndex
      slot.itemId = command.itemId
      try syncSlotPlayback(slot)
      emitSlotState(slot)
      return
    }
    if slot.recoveryAssignedIndex != nil, !hasRecoveryTarget(slot, assignedIndex: assignedIndex, sourceKey: sourceKey) {
      resetRecovery(slot)
    }
    slot.assignedIndex = assignedIndex
    slot.itemId = command.itemId
    slot.desiredPlay = shouldPlay
    slot.lastError = nil

    if command.action == .replace {
      if slot.sourceKey == sourceKey, slot.lastTransition == "replace" {
        // Same-source replace already in flight: the pending completion (same
        // generation) owns the load; only refresh the play intent.
        try syncSlotPlayback(slot)
        emitSlotState(slot)
        return
      }
      prepareRecoveryTarget(slot, assignedIndex: assignedIndex, sourceKey: sourceKey)
      slot.sourceKey = sourceKey
      slot.generation += 1
      slot.awaitingSourceCommit = true
      slot.lastTransition = "replace"
      try syncSlotPlayback(slot)
      emitSlotState(slot)
      let capturedGeneration = slot.generation
      startReplace(slot, source: source, capturedGeneration: capturedGeneration)
      return
    }

    slot.lastTransition = "reuse"
    try syncSlotPlayback(slot)
    emitSlotState(slot)
  }

  private func clearSlot(
    _ slot: SlotState,
    reason: String,
    assignedIndex: Int? = nil,
    itemId: String? = nil,
    hadSource: Bool? = nil
  ) throws {
    let player = slot.player
    let shouldClearNativeSource = hadSource ?? (slot.sourceKey != nil)
    let isExactEmptyState =
      !shouldClearNativeSource &&
      slot.assignedIndex == assignedIndex &&
      slot.itemId == itemId &&
      slot.sourceKey == nil &&
      !slot.desiredPlay &&
      !slot.awaitingSourceCommit &&
      slot.lastError == nil &&
      slot.recoveryAssignedIndex == nil &&
      slot.recoverySourceKey == nil
    if isExactEmptyState {
      return
    }

    let resetsLifecycle =
      shouldClearNativeSource ||
      slot.sourceKey != nil ||
      slot.awaitingSourceCommit ||
      slot.lastError != nil ||
      slot.recoveryAssignedIndex != nil ||
      slot.recoverySourceKey != nil
    resetRecovery(slot)
    slot.desiredPlay = false
    slot.assignedIndex = assignedIndex
    slot.sourceKey = nil
    slot.itemId = itemId
    if resetsLifecycle {
      slot.generation += 1
    }
    slot.awaitingSourceCommit = shouldClearNativeSource
    slot.lastTransition = reason
    slot.lastError = nil
    try syncSlotPlayback(slot)
    if shouldClearNativeSource {
      let capturedGeneration = slot.generation
      let promise = try? player.clearSourceAsync()
      promise?.then { [weak self, weak slot] _ in
        DispatchQueue.main.async {
          guard let self, let slot, !self.released, slot.generation == capturedGeneration else {
            return
          }

          slot.awaitingSourceCommit = false
          self.emitSlotState(slot)
        }
      }.catch { [weak self, weak slot] error in
        DispatchQueue.main.async {
          guard let self, let slot, !self.released, slot.generation == capturedGeneration else {
            return
          }

          slot.lastError = error.localizedDescription
          slot.lastTransition = "error"
          self.emitSlotState(slot)
        }
      }
    }
    emitSlotState(slot)
  }

  private func commandSlotState(_ slot: SlotState) -> FeedRingCommandSlotState {
    FeedRingCommandSlotState(
      slotId: slot.slotId,
      assignedIndex: slot.assignedIndex,
      itemId: slot.itemId,
      sourceKey: slot.sourceKey,
      hasSource: slot.player.hasActiveSource && slot.player.player.currentItem != nil,
      hasError: slot.player.playbackState.status == .error || slot.player.lastError != nil
    )
  }

  private func reconcilePlayback() throws {
    let plannedSlotsByIndex = Dictionary(uniqueKeysWithValues: planner.plannedSlots().map { ($0.assignedIndex, $0) })
    for slot in slots {
      let shouldPlay = slot.assignedIndex.flatMap { plannedSlotsByIndex[$0]?.shouldPlay } == true && slot.sourceKey != nil
      let didChangeDesiredPlay = slot.desiredPlay != shouldPlay
      slot.desiredPlay = shouldPlay
      let didApplyPlayback = try syncSlotPlayback(slot)
      if didChangeDesiredPlay || didApplyPlayback {
        emitSlotState(slot)
      }
    }
  }

  @discardableResult
  private func syncSlotPlayback(_ slot: SlotState, force: Bool = false) throws -> Bool {
    let desiredAndCommitted = slot.desiredPlay && !slot.awaitingSourceCommit && slot.sourceKey != nil
    let intent = PlaybackIntent(
      desiredAndCommitted: desiredAndCommitted,
      muted: planner.snapshot().muted || !desiredAndCommitted
    )
    if !force, slot.lastPlaybackIntent == intent {
      return false
    }

    try slot.player.updatePlayback(
      active: desiredAndCommitted,
      visible: desiredAndCommitted,
      muted: intent.muted,
      loop: true
    )
    if desiredAndCommitted {
      try slot.player.requestPlayback()
    } else {
      try slot.player.requestIdle()
    }
    slot.lastPlaybackIntent = intent
    return true
  }

  private func startReplace(
    _ slot: SlotState,
    source: any HybridNitroPlayerSourceSpec,
    capturedGeneration: Int64
  ) {
    do {
      let promise = try slot.player.replaceSourceAsync(source: source)
      promise.then { [weak self, weak slot] _ in
        DispatchQueue.main.async {
          guard let self, let slot, !self.released, slot.generation == capturedGeneration else {
            return
          }

          slot.lastError = nil
          slot.awaitingSourceCommit = false
          slot.lastTransition = "ready"
          self.resetRecovery(slot)
          try? self.syncSlotPlayback(slot, force: true)
          self.emitSlotState(slot)
        }
      }.catch { [weak self, weak slot] error in
        DispatchQueue.main.async {
          guard let self, let slot else {
            return
          }

          self.handleReplaceFailure(slot, capturedGeneration: capturedGeneration, error: error)
        }
      }
    } catch {
      handleReplaceFailure(slot, capturedGeneration: capturedGeneration, error: error)
    }
  }

  private func handleReplaceFailure(_ slot: SlotState, capturedGeneration: Int64, error: Error) {
    guard !released, slot.generation == capturedGeneration else {
      return
    }

    slot.sourceKey = nil
    slot.awaitingSourceCommit = false
    slot.desiredPlay = false
    slot.lastError = error.localizedDescription
    slot.lastTransition = "retry-wait"
    try? syncSlotPlayback(slot)
    emitSlotState(slot)
    scheduleRecovery(slot, capturedGeneration: capturedGeneration)
  }

  private func prepareRecoveryTarget(_ slot: SlotState, assignedIndex: Int, sourceKey: String) {
    cancelScheduledRecovery(slot)
    if !hasRecoveryTarget(slot, assignedIndex: assignedIndex, sourceKey: sourceKey) {
      resetRecovery(slot)
      slot.recoveryAssignedIndex = assignedIndex
      slot.recoverySourceKey = sourceKey
    }
  }

  private func scheduleRecovery(_ slot: SlotState, capturedGeneration: Int64) {
    guard
      slot.recoveryWorkItem == nil,
      slot.recoveryAssignedIndex != nil,
      slot.recoverySourceKey != nil
    else {
      return
    }

    guard slot.recoveryAttempt < maxRecoveryAttempts else {
      emitCommandEvent(
        kind: "source-error",
        projectionRevision: Double(lastProjectionRevision),
        slotId: slot.slotId,
        assignedIndex: slot.recoveryAssignedIndex,
        error: slot.lastError ?? "recovery exhausted"
      )
      resetRecovery(slot)
      slot.lastTransition = "source-error"
      emitSlotState(slot)
      return
    }

    slot.recoveryAttempt += 1
    let delayMs = recoveryDelaysMs[min(slot.recoveryAttempt - 1, recoveryDelaysMs.count - 1)]
    slot.recoveryScheduleToken += 1
    let capturedScheduleToken = slot.recoveryScheduleToken
    let workItem = DispatchWorkItem { [weak self, weak slot] in
      guard let self, let slot, slot.recoveryScheduleToken == capturedScheduleToken else {
        return
      }

      slot.recoveryWorkItem = nil
      guard self.isRecoveryCurrent(slot, capturedGeneration: capturedGeneration) else {
        self.resetRecovery(slot)
        return
      }

      try? self.reconcileWindow()
    }
    slot.recoveryWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(delayMs), execute: workItem)
  }

  private func isRecoveryCurrent(_ slot: SlotState, capturedGeneration: Int64) -> Bool {
    guard
      !released,
      slot.generation == capturedGeneration,
      let assignedIndex = slot.recoveryAssignedIndex,
      let sourceKey = slot.recoverySourceKey,
      slot.assignedIndex == assignedIndex,
      let catalogItem = sourceCatalog[assignedIndex],
      catalogItem.sourceKey == sourceKey,
      catalogItem.source != nil
    else {
      return false
    }

    return planner.plannedSlots().contains { plannedSlot in
      plannedSlot.slotId == slot.slotId &&
        plannedSlot.assignedIndex == assignedIndex &&
        plannedSlot.entry?.sourceKey == sourceKey &&
        plannedSlot.entry?.hasSource == true
    }
  }

  private func resetRecoveryForCatalogChanges() {
    for slot in slots {
      guard let assignedIndex = slot.recoveryAssignedIndex, let sourceKey = slot.recoverySourceKey else {
        continue
      }

      let catalogItem = sourceCatalog[assignedIndex]
      if catalogItem?.sourceKey != sourceKey || catalogItem?.source == nil {
        resetRecovery(slot)
      }
    }
  }

  private func hasRecoveryTarget(_ slot: SlotState, assignedIndex: Int, sourceKey: String) -> Bool {
    slot.recoveryAssignedIndex == assignedIndex && slot.recoverySourceKey == sourceKey
  }

  private func resetRecovery(_ slot: SlotState) {
    cancelScheduledRecovery(slot)
    slot.recoveryAttempt = 0
    slot.recoveryAssignedIndex = nil
    slot.recoverySourceKey = nil
  }

  private func cancelScheduledRecovery(_ slot: SlotState) {
    slot.recoveryWorkItem?.cancel()
    slot.recoveryWorkItem = nil
    slot.recoveryScheduleToken += 1
  }

  private func snapshotSlot(_ slot: SlotState) -> FeedRingSlotSnapshot {
    let player = slot.player
    let state = player.playbackState
    let memory = player.memorySnapshot
    let prepared = slot.sourceKey != nil && (memory.retentionState == .hot || state.status != .idle)
    return FeedRingSlotSnapshot(
      slotId: Double(slot.slotId),
      assignedIndex: slot.assignedIndex.map(Double.init),
      itemId: slot.itemId,
      sourceKey: slot.sourceKey,
      generation: Double(slot.generation),
      desiredPlay: slot.desiredPlay,
      attached: memory.isAttachedToView,
      prepared: prepared,
      ready: !slot.awaitingSourceCommit && state.isVisualReady,
      playing: slot.awaitingSourceCommit ? false : state.isPlaying,
      buffering: state.isBuffering,
      currentTime: slot.awaitingSourceCommit ? 0 : state.currentTime,
      duration: slot.awaitingSourceCommit ? 0 : sanitizedDuration(state.duration),
      bufferDuration: state.bufferDuration,
      bufferedPosition: state.bufferedPosition,
      rate: state.rate,
      wantsToPlay: memory.wantsToPlay,
      retentionState: retentionStateName(memory.retentionState),
      hasLoadedSource: player.hasLoadedCurrentSource,
      watchdogAttempts: Double(player.playbackWatchdogAttemptCount),
      watchdogPending: player.hasPendingPlaybackWatchdog,
      nativePlaybackState: timeControlStatusName(player.cachedTimeControlStatus),
      status: state.status.stringValue,
      lastTransition: slot.lastTransition,
      lastError: slot.lastError
    )
  }

  private func emitSlotState(_ slot: SlotState) {
    let state = slotState(slot)
    listenerRegistry.emit(event: "slotState") { (cb: (FeedRingSlotState) throws -> Void) in try cb(state) }
  }

  private func emitCommandEvent(
    kind: String,
    projectionRevision: Double,
    slotId: Int? = nil,
    assignedIndex: Int? = nil,
    error: String? = nil
  ) {
    let event = FeedRingCommandEvent(
      ringToken: ringToken,
      projectionRevision: projectionRevision,
      kind: kind,
      slotId: slotId.map(Double.init),
      assignedIndex: assignedIndex.map(Double.init),
      error: error
    )
    listenerRegistry.emit(event: "commandEvent") { (cb: (FeedRingCommandEvent) throws -> Void) in try cb(event) }
  }

  private func slotState(_ slot: SlotState) -> FeedRingSlotState {
    let playbackState = slot.player.playbackState
    return FeedRingSlotState(
      slotId: Double(slot.slotId),
      generation: Double(slot.generation),
      assignedIndex: slot.assignedIndex.map(Double.init),
      ready: !slot.awaitingSourceCommit && playbackState.isVisualReady,
      playing: slot.awaitingSourceCommit ? false : playbackState.isPlaying,
      buffering: playbackState.isBuffering,
      currentTime: slot.awaitingSourceCommit ? 0 : playbackState.currentTime,
      duration: slot.awaitingSourceCommit ? 0 : sanitizedDuration(playbackState.duration)
    )
  }

  private func configureSlotListenersIfNeeded() {
    if slotListenersConfigured {
      return
    }

    slotListenersConfigured = true
    for slot in slots {
      _ = try? (slot.player.eventEmitter as? HybridNitroPlayerEventEmitter)?.addOnPlaybackStateListener { [weak self, weak slot] _ in
        guard let self, let slot else {
          return
        }

        self.emitSlotState(slot)
      }
    }
  }

  private func sanitizedDuration(_ value: Double) -> Double {
    value.isFinite && value > 0 ? value : 0
  }

  private func retentionStateName(_ state: RetentionLevel) -> String {
    switch state {
    case .cold:
      return "cold"
    case .metadata:
      return "metadata"
    case .hot:
      return "hot"
    @unknown default:
      return "unknown"
    }
  }

  private func timeControlStatusName(_ status: AVPlayer.TimeControlStatus) -> String {
    switch status {
    case .paused:
      return "paused"
    case .waitingToPlayAtSpecifiedRate:
      return "waiting"
    case .playing:
      return "playing"
    @unknown default:
      return "unknown"
    }
  }

  private func normalizeSlotId(_ slotId: Int) throws -> Int {
    if slotId < 0 || slotId >= slots.count {
      throw ringError("Feed ring slotId must be in 0...\(slots.count - 1): \(slotId)")
    }
    return slotId
  }

  private func decodeBridgeInt(_ value: Double, field: String) throws -> Int {
    Int(try decodeBridgeInt64(value, field: field))
  }

  private func decodeBridgeInt64(_ value: Double, field: String) throws -> Int64 {
    let maxSafeInteger = 9_007_199_254_740_991.0
    guard value.isFinite,
      value.rounded(.towardZero) == value,
      value >= -maxSafeInteger,
      value <= maxSafeInteger else {
      throw ringError("Feed ring \(field) must be a safe integer: \(value)")
    }
    return Int64(value)
  }

  private func syncMain<T>(_ block: () throws -> T) throws -> T {
    if Thread.isMainThread {
      return try block()
    }

    var result: Result<T, Error>!
    DispatchQueue.main.sync {
      result = Result { try block() }
    }
    return try result.get()
  }

  private func ringError(_ message: String) -> NSError {
    NSError(domain: "NitroFeedRingPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private static func allocateRingToken() -> Double {
    ringTokenLock.lock()
    defer { ringTokenLock.unlock() }
    let token = nextRingToken
    nextRingToken += 1
    return Double(token)
  }
}
