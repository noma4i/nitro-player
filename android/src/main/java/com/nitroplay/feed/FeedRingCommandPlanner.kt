package com.nitroplay.feed

enum class FeedRingCommandAction {
  CLEAR,
  REPLACE,
  REUSE
}

data class FeedRingCommandSlotState(
  val slotId: Int,
  val assignedIndex: Int?,
  val itemId: String?,
  val sourceKey: String?,
  val hasSource: Boolean,
  val hasError: Boolean
)

data class FeedRingCommand(
  val action: FeedRingCommandAction,
  val slotId: Int,
  val assignedIndex: Int?,
  val itemId: String?,
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
      return slots.mapNotNull { slot -> clearCommandIfNeeded(slot, "missing-center", null, null) }
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
        clearCommandIfNeeded(
          slot = slot,
          reason = "empty-source",
          assignedIndex = plannedSlot.assignedIndex,
          itemId = entry?.itemId
        )?.let { command -> commands += command }
        return@forEach
      }

      if (
        slot.assignedIndex == plannedSlot.assignedIndex &&
        slot.itemId == entry.itemId &&
        slot.sourceKey == sourceKey &&
        slot.hasSource &&
        !slot.hasError
      ) {
        return@forEach
      }

      commands += FeedRingCommand(
        action = if (slot.sourceKey == sourceKey && slot.hasSource && !slot.hasError) FeedRingCommandAction.REUSE else FeedRingCommandAction.REPLACE,
        slotId = plannedSlot.slotId,
        assignedIndex = plannedSlot.assignedIndex,
        itemId = entry.itemId,
        sourceKey = sourceKey,
        shouldPlay = plannedSlot.shouldPlay,
        reason = null,
        hadSource = slot.sourceKey != null || slot.hasSource || slot.hasError
      )
    }

    slots.forEach { slot ->
      if (!touchedSlotIds.contains(slot.slotId)) {
        clearCommandIfNeeded(slot, "outside-window", null, null)?.let { command -> commands += command }
      }
    }

    return commands
  }

  private fun clearCommandIfNeeded(
    slot: FeedRingCommandSlotState,
    reason: String,
    assignedIndex: Int?,
    itemId: String?
  ): FeedRingCommand? {
    if (
      slot.assignedIndex == assignedIndex &&
      slot.itemId == itemId &&
      slot.sourceKey == null &&
      !slot.hasSource &&
      !slot.hasError
    ) {
      return null
    }

    return FeedRingCommand(
      action = FeedRingCommandAction.CLEAR,
      slotId = slot.slotId,
      assignedIndex = assignedIndex,
      itemId = itemId,
      sourceKey = null,
      shouldPlay = false,
      reason = reason,
      hadSource = slot.sourceKey != null || slot.hasSource || slot.hasError
    )
  }
}
