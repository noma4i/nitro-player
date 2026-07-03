struct FeedRingCatalogEntry: Equatable {
  let index: Int
  let momentId: String?
  let sourceKey: String?
  let hasSource: Bool
}

struct FeedRingCatalogState {
  let revision: Int64
  let entries: [FeedRingCatalogEntry]
}

struct FeedRingViewportState {
  let revision: Int64
  let centerIndex: Int
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
  let centerIndex: Int?
  let playbackAllowed: Bool
  let muted: Bool
}

final class FeedRingWindowPlanner {
  private let slotCount: Int
  private var catalog: [Int: FeedRingCatalogEntry] = [:]
  private var catalogRevision: Int64 = -1
  private var viewportRevision: Int64 = -1
  private var centerIndex: Int?
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
    centerIndex = state.centerIndex
    playbackAllowed = state.playbackAllowed
    muted = state.muted
    return true
  }

  func plannedSlots() -> [FeedRingPlannedSlot] {
    guard let centerIndex else {
      return []
    }

    return (-1...1).map { offset in
      let assignedIndex = centerIndex + offset
      return FeedRingPlannedSlot(
        slotId: positiveMod(assignedIndex, slotCount),
        assignedIndex: assignedIndex,
        entry: catalog[assignedIndex],
        shouldPlay: playbackAllowed && assignedIndex == centerIndex
      )
    }
  }

  func snapshot() -> FeedRingPlannerSnapshot {
    FeedRingPlannerSnapshot(
      catalogRevision: catalogRevision,
      viewportRevision: viewportRevision,
      catalogSize: catalog.count,
      centerIndex: centerIndex,
      playbackAllowed: playbackAllowed,
      muted: muted
    )
  }

  private func positiveMod(_ value: Int, _ divisor: Int) -> Int {
    ((value % divisor) + divisor) % divisor
  }
}
