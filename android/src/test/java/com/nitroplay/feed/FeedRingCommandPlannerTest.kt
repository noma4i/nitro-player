package com.nitroplay.feed

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedRingCommandPlannerTest {
  @Test
  fun plansReplaceReuseAndClearInWindowOrder() {
    val planner = FeedRingCommandPlanner()
    val commands = planner.plan(
      plannedSlots = listOf(
        planned(slotId = 2, assignedIndex = -1, momentId = "previous", sourceKey = "source-previous", shouldPlay = false),
        planned(slotId = 0, assignedIndex = 0, momentId = "current", sourceKey = "source-current", shouldPlay = true),
        planned(slotId = 1, assignedIndex = 1, momentId = "next", sourceKey = null, shouldPlay = false)
      ),
      slots = listOf(
        slot(0, assignedIndex = 0, sourceKey = "source-current"),
        slot(1, assignedIndex = 4, sourceKey = "source-old"),
        slot(2, assignedIndex = -1, sourceKey = "source-stale")
      )
    )

    assertEquals(listOf(FeedRingCommandAction.REPLACE, FeedRingCommandAction.REUSE, FeedRingCommandAction.CLEAR), commands.map { it.action })
    assertEquals(listOf(2, 0, 1), commands.map { it.slotId })
    assertEquals(listOf(-1, 0, 1), commands.map { it.assignedIndex })
    assertEquals(listOf("source-previous", "source-current", null), commands.map { it.sourceKey })
    assertEquals(listOf(false, true, false), commands.map { it.shouldPlay })
    assertEquals("empty-source", commands[2].reason)
    assertTrue(commands[2].hadSource)
  }

  @Test
  fun clearsMissingCenterAndOutsideSlotsAfterWindowCommands() {
    val planner = FeedRingCommandPlanner()

    val missingCenterCommands = planner.plan(
      plannedSlots = emptyList(),
      slots = listOf(
        slot(0, assignedIndex = 0, sourceKey = "source-current"),
        slot(1, assignedIndex = null, sourceKey = null)
      )
    )
    assertEquals(listOf("missing-center", "missing-center"), missingCenterCommands.map { it.reason })
    assertEquals(listOf(true, false), missingCenterCommands.map { it.hadSource })

    val outsideCommands = planner.plan(
      plannedSlots = listOf(planned(slotId = 0, assignedIndex = 10, momentId = "ten", sourceKey = "source-ten", shouldPlay = true)),
      slots = listOf(
        slot(0, assignedIndex = null, sourceKey = null),
        slot(1, assignedIndex = 4, sourceKey = "source-old")
      )
    )

    assertEquals(listOf(FeedRingCommandAction.REPLACE, FeedRingCommandAction.CLEAR), outsideCommands.map { it.action })
    assertEquals(listOf(null, "outside-window"), outsideCommands.map { it.reason })
    assertTrue(outsideCommands[1].hadSource)
  }

  @Test
  fun rejectedReplaceWithClearedSourceKeyPlansReplaceAgain() {
    val planner = FeedRingCommandPlanner()
    val commands = planner.plan(
      plannedSlots = listOf(planned(slotId = 0, assignedIndex = 0, momentId = "current", sourceKey = "source-current", shouldPlay = true)),
      slots = listOf(slot(0, assignedIndex = 0, sourceKey = null))
    )

    assertEquals(FeedRingCommandAction.REPLACE, commands.single().action)
    assertEquals("source-current", commands.single().sourceKey)
  }

  @Test
  fun hadSourceProbeUsesOnlyPriorSourceKey() {
    val planner = FeedRingCommandPlanner()
    val commands = planner.plan(
      plannedSlots = listOf(planned(slotId = 0, assignedIndex = 0, momentId = "current", sourceKey = null, shouldPlay = false)),
      slots = listOf(slot(0, assignedIndex = 0, sourceKey = null))
    )

    assertEquals(FeedRingCommandAction.CLEAR, commands.single().action)
    assertFalse(commands.single().hadSource)
  }

  private fun planned(
    slotId: Int,
    assignedIndex: Int,
    momentId: String,
    sourceKey: String?,
    shouldPlay: Boolean
  ): FeedRingPlannedSlot {
    return FeedRingPlannedSlot(
      slotId = slotId,
      assignedIndex = assignedIndex,
      entry = FeedRingCatalogEntry(
        index = assignedIndex,
        momentId = momentId,
        sourceKey = sourceKey,
        hasSource = sourceKey != null
      ),
      shouldPlay = shouldPlay
    )
  }

  private fun slot(slotId: Int, assignedIndex: Int?, sourceKey: String?): FeedRingCommandSlotState {
    return FeedRingCommandSlotState(slotId = slotId, assignedIndex = assignedIndex, momentId = null, sourceKey = sourceKey)
  }
}
