enum FeedRingCommandAction: String, Equatable {
  case clear
  case replace
  case reuse
}

struct FeedRingCommandSlotState: Equatable {
  let slotId: Int
  let assignedIndex: Int?
  let itemId: String?
  let sourceKey: String?
  let hasSource: Bool
  let hasError: Bool
}

struct FeedRingCommand: Equatable {
  let action: FeedRingCommandAction
  let slotId: Int
  let assignedIndex: Int?
  let itemId: String?
  let sourceKey: String?
  let shouldPlay: Bool
  let reason: String?
  let hadSource: Bool
}

final class FeedRingCommandPlanner {
  func plan(plannedSlots: [FeedRingPlannedSlot], slots: [FeedRingCommandSlotState]) -> [FeedRingCommand] {
    if plannedSlots.isEmpty {
      return slots.compactMap { slot in
        clearCommandIfNeeded(slot: slot, reason: "missing-center", assignedIndex: nil, itemId: nil)
      }
    }

    let slotsById = Dictionary(uniqueKeysWithValues: slots.map { ($0.slotId, $0) })
    var touchedSlotIds = Set<Int>()
    var commands: [FeedRingCommand] = []

    for plannedSlot in plannedSlots {
      guard let slot = slotsById[plannedSlot.slotId] else {
        continue
      }

      touchedSlotIds.insert(plannedSlot.slotId)
      guard
        let entry = plannedSlot.entry,
        entry.hasSource,
        let sourceKey = entry.sourceKey
      else {
        if let command = clearCommandIfNeeded(
            slot: slot,
            reason: "empty-source",
            assignedIndex: plannedSlot.assignedIndex,
            itemId: plannedSlot.entry?.itemId
        ) {
          commands.append(command)
        }
        continue
      }

      if
        slot.assignedIndex == plannedSlot.assignedIndex,
        slot.itemId == entry.itemId,
        slot.sourceKey == sourceKey,
        slot.hasSource,
        !slot.hasError
      {
        continue
      }

      commands.append(
        FeedRingCommand(
          action: slot.sourceKey == sourceKey && slot.hasSource && !slot.hasError ? .reuse : .replace,
          slotId: plannedSlot.slotId,
          assignedIndex: plannedSlot.assignedIndex,
          itemId: entry.itemId,
          sourceKey: sourceKey,
          shouldPlay: plannedSlot.shouldPlay,
          reason: nil,
          hadSource: slot.sourceKey != nil || slot.hasSource || slot.hasError
        )
      )
    }

    for slot in slots where !touchedSlotIds.contains(slot.slotId) {
      if let command = clearCommandIfNeeded(slot: slot, reason: "outside-window", assignedIndex: nil, itemId: nil) {
        commands.append(command)
      }
    }

    return commands
  }

  private func clearCommandIfNeeded(
    slot: FeedRingCommandSlotState,
    reason: String,
    assignedIndex: Int?,
    itemId: String?
  ) -> FeedRingCommand? {
    if
      slot.assignedIndex == assignedIndex,
      slot.itemId == itemId,
      slot.sourceKey == nil,
      !slot.hasSource,
      !slot.hasError
    {
      return nil
    }

    return FeedRingCommand(
      action: .clear,
      slotId: slot.slotId,
      assignedIndex: assignedIndex,
      itemId: itemId,
      sourceKey: nil,
      shouldPlay: false,
      reason: reason,
      hadSource: slot.sourceKey != nil || slot.hasSource || slot.hasError
    )
  }
}
