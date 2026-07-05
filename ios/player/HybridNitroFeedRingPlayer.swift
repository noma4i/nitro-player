import AVFoundation
import Foundation

final class HybridNitroFeedRingPlayer: HybridNitroFeedRingPlayerSpec {
  private enum SlotTransition: String {
    case clear
    case empty
    case emptySource = "empty-source"
    case error
    case missingCenter = "missing-center"
    case outsideWindow = "outside-window"
    case ready
    case released
    case replace
    case reuse

    static func clearReason(_ reason: String) -> SlotTransition {
      SlotTransition(rawValue: reason) ?? .clear
    }
  }

  private final class CatalogItem {
    let index: Int
    let momentId: String?
    let sourceKey: String?
    let source: (any HybridNitroPlayerSourceSpec)?

    init(index: Int, momentId: String?, sourceKey: String?, source: (any HybridNitroPlayerSourceSpec)?) {
      self.index = index
      self.momentId = momentId
      self.sourceKey = sourceKey
      self.source = source
    }
  }

  private final class SlotState {
    let slotId: Int
    let player = HybridNitroPlayer()
    var assignedIndex: Int?
    var momentId: String?
    var sourceKey: String?
    var generation: Int64 = 0
    var desiredPlay = false
    var lastTransition = SlotTransition.empty
    var lastError: String?

    init(slotId: Int) {
      self.slotId = slotId
    }
  }

  private let slots = [SlotState(slotId: 0), SlotState(slotId: 1), SlotState(slotId: 2)]
  private let sourceFactory = HybridNitroPlayerSourceFactory()
  private let planner = FeedRingWindowPlanner(slotCount: 3)
  private let commandPlanner = FeedRingCommandPlanner()
  private let listenerRegistry = ListenerRegistry()
  private var sourceCatalog: [Int: CatalogItem] = [:]
  private var released = false
  private var slotListenersConfigured = false

  func getPlayer(slotId: Double) throws -> any HybridNitroPlayerSpec {
    try syncMain {
      if released {
        throw ringError("Feed ring player is released")
      }

      let normalizedSlotId = try normalizeSlotId(Int(slotId))
      return slots[normalizedSlotId].player
    }
  }

  func replaceCatalog(catalog: FeedRingCatalog) throws {
    let items = try catalog.items.map(parseCatalogItem)
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.released else {
        return
      }

      let accepted = self.planner.replaceCatalog(
        FeedRingCatalogState(
          revision: Int64(catalog.revision),
          entries: items.map(self.plannerEntry)
        )
      )
      if !accepted {
        return
      }

      self.sourceCatalog.removeAll(keepingCapacity: true)
      for item in items {
        self.sourceCatalog[item.index] = item
      }
      try? self.reconcileWindow()
    }
  }

  func commitViewport(viewport: FeedRingViewport) throws {
    let state = FeedRingViewportState(
      revision: Int64(viewport.revision),
      centerIndex: Int(viewport.centerIndex),
      playbackAllowed: viewport.playbackAllowed,
      muted: viewport.muted
    )

    DispatchQueue.main.async { [weak self] in
      guard let self, !self.released else {
        return
      }

      let accepted = self.planner.commitViewport(state)
      if !accepted {
        return
      }

      try? self.reconcileWindow()
    }
  }

  func snapshot() throws -> FeedRingSnapshot {
    try syncMain {
      let plannerSnapshot = planner.snapshot()
      return FeedRingSnapshot(
        catalogRevision: Double(plannerSnapshot.catalogRevision),
        viewportRevision: Double(plannerSnapshot.viewportRevision),
        catalogSize: Double(plannerSnapshot.catalogSize),
        centerIndex: plannerSnapshot.centerIndex.map(Double.init),
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

  func release() throws {
    try syncMain {
      if released {
        return
      }

      released = true
      listenerRegistry.clearAll()
      for slot in slots {
        slot.desiredPlay = false
        slot.player.release()
        slot.assignedIndex = nil
        slot.momentId = nil
        slot.sourceKey = nil
        slot.generation += 1
        slot.lastTransition = .released
        emitSlotState(slot)
      }
    }
  }

  private func parseCatalogItem(_ item: FeedRingCatalogItem) throws -> CatalogItem {
    let source = try item.source.map { try sourceFactory.fromNitroPlayerConfig(config: $0) }
    return CatalogItem(
      index: Int(item.index),
      momentId: item.momentId,
      sourceKey: item.sourceKey,
      source: source
    )
  }

  private func plannerEntry(from item: CatalogItem) -> FeedRingCatalogEntry {
    FeedRingCatalogEntry(
      index: item.index,
      momentId: item.momentId,
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
        transition: SlotTransition.clearReason(command.reason ?? "clear"),
        assignedIndex: command.assignedIndex,
        momentId: command.momentId,
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
        transition: .emptySource,
        assignedIndex: command.assignedIndex,
        momentId: command.momentId,
        hadSource: command.hadSource
      )
      return
    }

    let shouldPlay = command.shouldPlay
    slot.assignedIndex = assignedIndex
    slot.momentId = command.momentId
    slot.desiredPlay = shouldPlay
    slot.lastError = nil

    let player = slot.player

    if command.action == .replace {
      slot.sourceKey = sourceKey
      slot.generation += 1
      slot.lastTransition = .replace
      player.wantsToPlay = shouldPlay
      applyStaticPlayerState(player, shouldPlay: shouldPlay)
      emitSlotState(slot)
      let capturedGeneration = slot.generation
      let promise = try player.replaceSourceAsync(source: source)
      promise.then { [weak self, weak slot] _ in
        DispatchQueue.main.async {
          guard let self, let slot, !self.released, slot.generation == capturedGeneration else {
            return
          }

          slot.lastError = nil
          slot.lastTransition = .ready
          self.applyStaticPlayerState(slot.player, shouldPlay: slot.desiredPlay)
          if slot.desiredPlay {
            try? slot.player.play()
          } else {
            try? slot.player.pause()
          }
          self.emitSlotState(slot)
        }
      }.catch { [weak self, weak slot] error in
        DispatchQueue.main.async {
          guard let self, let slot, !self.released, slot.generation == capturedGeneration else {
            return
          }

          slot.sourceKey = nil
          slot.lastError = error.localizedDescription
          slot.lastTransition = .error
          slot.desiredPlay = false
          self.emitSlotState(slot)
        }
      }
      return
    }

    slot.lastTransition = .reuse
    applyStaticPlayerState(player, shouldPlay: shouldPlay)
    emitSlotState(slot)
  }

  private func clearSlot(
    _ slot: SlotState,
    transition: SlotTransition,
    assignedIndex: Int? = nil,
    momentId: String? = nil,
    hadSource: Bool? = nil
  ) throws {
    let player = slot.player
    let shouldClearNativeSource = hadSource ?? (slot.sourceKey != nil)
    slot.desiredPlay = false
    slot.assignedIndex = assignedIndex
    slot.sourceKey = nil
    slot.momentId = momentId
    slot.generation += 1
    slot.lastTransition = transition
    slot.lastError = nil
    if shouldClearNativeSource {
      try? player.pause()
      let capturedGeneration = slot.generation
      let promise = try? player.clearSourceAsync()
      promise?.catch { [weak self, weak slot] error in
        DispatchQueue.main.async {
          guard let self, let slot, !self.released, slot.generation == capturedGeneration else {
            return
          }

          slot.lastError = error.localizedDescription
          slot.lastTransition = .error
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
      momentId: slot.momentId,
      sourceKey: slot.sourceKey
    )
  }

  private func reconcilePlayback() throws {
    let plannedSlotsByIndex = Dictionary(uniqueKeysWithValues: planner.plannedSlots().map { ($0.assignedIndex, $0) })
    for slot in slots {
      let player = slot.player
      let shouldPlay = slot.assignedIndex.flatMap { plannedSlotsByIndex[$0]?.shouldPlay } == true && slot.sourceKey != nil
      slot.desiredPlay = shouldPlay
      applyStaticPlayerState(player, shouldPlay: shouldPlay)
      if slot.lastTransition == .replace {
        continue
      }
      if shouldPlay {
        try player.play()
      } else {
        try player.pause()
      }
      emitSlotState(slot)
    }
  }

  private func applyStaticPlayerState(_ player: HybridNitroPlayer, shouldPlay: Bool) {
    let muted = planner.snapshot().muted
    player.loop = true
    player.muted = muted || !shouldPlay
    player.volume = (muted || !shouldPlay) ? 0 : 1
  }

  private func snapshotSlot(_ slot: SlotState) -> FeedRingSlotSnapshot {
    let player = slot.player
    let state = player.playbackState
    let memory = player.memorySnapshot
    let prepared = slot.sourceKey != nil && (memory.retentionState == .hot || state.status != .idle)
    return FeedRingSlotSnapshot(
      slotId: Double(slot.slotId),
      assignedIndex: slot.assignedIndex.map(Double.init),
      momentId: slot.momentId,
      sourceKey: slot.sourceKey,
      generation: Double(slot.generation),
      desiredPlay: slot.desiredPlay,
      attached: memory.isAttachedToView,
      prepared: prepared,
      ready: state.isVisualReady || player.firstFrame != nil,
      playing: state.isPlaying,
      buffering: state.isBuffering,
      currentTime: state.currentTime,
      duration: sanitizedDuration(state.duration),
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
      lastTransition: slot.lastTransition.rawValue,
      lastError: slot.lastError
    )
  }

  private func emitSlotState(_ slot: SlotState) {
    let state = slotState(slot)
    listenerRegistry.emit(event: "slotState") { (cb: (FeedRingSlotState) throws -> Void) in try cb(state) }
  }

  private func slotState(_ slot: SlotState) -> FeedRingSlotState {
    let playbackState = slot.player.playbackState
    return FeedRingSlotState(
      slotId: Double(slot.slotId),
      generation: Double(slot.generation),
      assignedIndex: slot.assignedIndex.map(Double.init),
      ready: playbackState.isVisualReady || slot.player.firstFrame != nil,
      playing: playbackState.isPlaying,
      buffering: playbackState.isBuffering,
      currentTime: playbackState.currentTime,
      duration: sanitizedDuration(playbackState.duration)
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
      _ = try? (slot.player.eventEmitter as? HybridNitroPlayerEventEmitter)?.addOnFirstFrameListener { [weak self, weak slot] _ in
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
}
