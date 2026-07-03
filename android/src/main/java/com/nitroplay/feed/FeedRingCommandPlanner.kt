package com.nitroplay.feed

enum class FeedRingCommandAction {
  CLEAR,
  REPLACE,
  REUSE
}

data class FeedRingCommandSlotState(
  val slotId: Int,
  val assignedIndex: Int?,
  val momentId: String?,
  val sourceKey: String?
)

data class FeedRingCommand(
  val action: FeedRingCommandAction,
  val slotId: Int,
  val assignedIndex: Int?,
  val momentId: String?,
  val sourceKey: String?,
  val shouldPlay: Boolean,
  val reason: String?,
  val hadSource: Boolean
)

class FeedRingCommandPlanner {
  fun plan(
    plannedSlots: List<FeedRingPlannedSlot>,
    slots: List<FeedRingCommandSlotState>
  ): List<FeedRingCommand> {
    if (plannedSlots.isEmpty()) {
      return slots.map { slot -> clearCommand(slot, "missing-center", null, null) }
    }

    val slotsById = slots.associateBy { slot -> slot.slotId }
    val touchedSlotIds = mutableSetOf<Int>()
    val commands = mutableListOf<FeedRingCommand>()

    plannedSlots.forEach { plannedSlot ->
      val slot = slotsById[plannedSlot.slotId] ?: return@forEach
      touchedSlotIds += plannedSlot.slotId
      val entry = plannedSlot.entry
      val sourceKey = entry?.sourceKey
      if (entry == null || !entry.hasSource || sourceKey == null) {
        commands += clearCommand(
          slot = slot,
          reason = "empty-source",
          assignedIndex = plannedSlot.assignedIndex,
          momentId = entry?.momentId
        )
        return@forEach
      }

      commands += FeedRingCommand(
        action = if (slot.sourceKey == sourceKey) FeedRingCommandAction.REUSE else FeedRingCommandAction.REPLACE,
        slotId = plannedSlot.slotId,
        assignedIndex = plannedSlot.assignedIndex,
        momentId = entry.momentId,
        sourceKey = sourceKey,
        shouldPlay = plannedSlot.shouldPlay,
        reason = null,
        hadSource = slot.sourceKey != null
      )
    }

    slots.forEach { slot ->
      if (!touchedSlotIds.contains(slot.slotId)) {
        commands += clearCommand(slot, "outside-window", null, null)
      }
    }

    return commands
  }

  private fun clearCommand(
    slot: FeedRingCommandSlotState,
    reason: String,
    assignedIndex: Int?,
    momentId: String?
  ): FeedRingCommand {
    return FeedRingCommand(
      action = FeedRingCommandAction.CLEAR,
      slotId = slot.slotId,
      assignedIndex = assignedIndex,
      momentId = momentId,
      sourceKey = null,
      shouldPlay = false,
      reason = reason,
      hadSource = slot.sourceKey != null
    )
  }
}
