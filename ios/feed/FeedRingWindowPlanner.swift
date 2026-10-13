struct FeedRingCatalogEntry: Equatable {
  let index: Int
  let itemId: String?
  let sourceKey: String?
  let hasSource: Bool
}

struct FeedRingCatalogState {
  let revision: Int64
  let entries: [FeedRingCatalogEntry]
}

struct FeedRingViewportState {
  let revision: Int64
  let windowCenterIndex: Int
  let playbackIndex: Int
  let playbackAllowed: Bool
  let muted: Bool
}

struct FeedRingPlannedSlot: Equatable {
  let slotId: Int
  let assignedIndex: Int
  let entry: FeedRingCatalogEntry?
  let shouldPlay: Bool
}

struct FeedRingPlannerSnapshot: Equatable {
  let catalogRevision: Int64
  let viewportRevision: Int64
  let catalogSize: Int
  let windowCenterIndex: Int?
  let playbackIndex: Int?
  let playbackAllowed: Bool
  let muted: Bool
}

final class FeedRingWindowPlanner {
  private let slotCount: Int
  private var catalog: [Int: FeedRingCatalogEntry] = [:]
  private var catalogRevision: Int64 = -1
  private var viewportRevision: Int64 = -1
  private var windowCenterIndex: Int?
  private var playbackIndex: Int?
  private var playbackAllowed = false
  private var muted = false

  init(slotCount: Int = 3) {
    precondition(slotCount > 0, "slotCount must be positive")
    self.slotCount = slotCount
  }

  @discardableResult
  func replaceCatalog(_ state: FeedRingCatalogState) -> Bool {
    if state.revision <= catalogRevision {
      return false
    }

    catalogRevision = state.revision
    catalog.removeAll(keepingCapacity: true)
    for entry in state.entries {
      catalog[entry.index] = entry
    }
    return true
  }

  @discardableResult
  func commitViewport(_ state: FeedRingViewportState) -> Bool {
    if state.revision <= viewportRevision {
      return false
    }

    viewportRevision = state.revision
    windowCenterIndex = state.windowCenterIndex
    playbackIndex = state.playbackIndex
    playbackAllowed = state.playbackAllowed
    muted = state.muted
    return true
  }

  func resetRevisions() {
    catalogRevision = -1
    viewportRevision = -1
  }

  func plannedSlots() -> [FeedRingPlannedSlot] {
    guard let windowCenterIndex, let playbackIndex else {
      return []
    }

    return (-1...1).map { offset in
      let assignedIndex = windowCenterIndex + offset
      return FeedRingPlannedSlot(
        slotId: positiveMod(assignedIndex, slotCount),
        assignedIndex: assignedIndex,
        entry: catalog[assignedIndex],
        shouldPlay: playbackAllowed && assignedIndex == playbackIndex
      )
    }
  }

  func snapshot() -> FeedRingPlannerSnapshot {
    FeedRingPlannerSnapshot(
      catalogRevision: catalogRevision,
      viewportRevision: viewportRevision,
      catalogSize: catalog.count,
      windowCenterIndex: windowCenterIndex,
      playbackIndex: playbackIndex,
      playbackAllowed: playbackAllowed,
      muted: muted
    )
  }

  private func positiveMod(_ value: Int, _ divisor: Int) -> Int {
    ((value % divisor) + divisor) % divisor
  }
}
