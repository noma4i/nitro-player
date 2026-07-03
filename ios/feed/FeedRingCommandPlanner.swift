enum FeedRingCommandAction: String, Equatable {
  case clear
  case replace
  case reuse
}

struct FeedRingCommandSlotState: Equatable {
  let slotId: Int
  let assignedIndex: Int?
  let momentId: String?
  let sourceKey: String?
}

struct FeedRingCommand: Equatable {
  let action: FeedRingCommandAction
  let slotId: Int
  let assignedIndex: Int?
  let momentId: String?
  let sourceKey: String?
  let shouldPlay: Bool
  let reason: String?
  let hadSource: Bool
}

final class FeedRingCommandPlanner {
  func plan(plannedSlots: [FeedRingPlannedSlot], slots: [FeedRingCommandSlotState]) -> [FeedRingCommand] {
    if plannedSlots.isEmpty {
      return slots.map { slot in
        clearCommand(slot: slot, reason: "missing-center", assignedIndex: nil, momentId: nil)
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
        commands.append(
          clearCommand(
            slot: slot,
            reason: "empty-source",
            assignedIndex: plannedSlot.assignedIndex,
            momentId: plannedSlot.entry?.momentId
          )
        )
        continue
      }

      commands.append(
        FeedRingCommand(
          action: slot.sourceKey == sourceKey ? .reuse : .replace,
          slotId: plannedSlot.slotId,
          assignedIndex: plannedSlot.assignedIndex,
          momentId: entry.momentId,
          sourceKey: sourceKey,
          shouldPlay: plannedSlot.shouldPlay,
          reason: nil,
          hadSource: slot.sourceKey != nil
        )
      )
    }

    for slot in slots where !touchedSlotIds.contains(slot.slotId) {
      commands.append(clearCommand(slot: slot, reason: "outside-window", assignedIndex: nil, momentId: nil))
    }

    return commands
  }

  private func clearCommand(
    slot: FeedRingCommandSlotState,
    reason: String,
    assignedIndex: Int?,
    momentId: String?
  ) -> FeedRingCommand {
    FeedRingCommand(
      action: .clear,
      slotId: slot.slotId,
      assignedIndex: assignedIndex,
      momentId: momentId,
      sourceKey: nil,
      shouldPlay: false,
      reason: reason,
      hadSource: slot.sourceKey != nil
    )
  }
}
