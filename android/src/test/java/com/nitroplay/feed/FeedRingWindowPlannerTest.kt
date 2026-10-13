package com.nitroplay.feed

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedRingWindowPlannerTest {
  @Test
  fun computesThreeSlotWindowWithNativeModulo() {
    val planner = FeedRingWindowPlanner()

    assertTrue(
      planner.replaceCatalog(
        FeedRingCatalogState(
          revision = 1,
          entries = listOf(
            entry(-1, "previous"),
            entry(0, "current"),
            entry(1, "next")
          )
        )
      )
    )
    assertTrue(
      planner.commitViewport(
        FeedRingViewportState(
          revision = 1,
          windowCenterIndex = 0, playbackIndex = 0,
          playbackAllowed = true,
          muted = false
        )
      )
    )

    val slots = planner.plannedSlots()

    assertEquals(listOf(2, 0, 1), slots.map { it.slotId })
    assertEquals(listOf(-1, 0, 1), slots.map { it.assignedIndex })
    assertEquals(listOf(false, true, false), slots.map { it.shouldPlay })
    assertEquals(listOf("previous", "current", "next"), slots.map { it.entry?.itemId })
  }

  @Test
  fun rejectsStaleCatalogAndViewportRevisionsIndependently() {
    val planner = FeedRingWindowPlanner()

    assertTrue(planner.replaceCatalog(FeedRingCatalogState(revision = 4, entries = listOf(entry(10, "a")))))
    assertFalse(planner.replaceCatalog(FeedRingCatalogState(revision = 4, entries = listOf(entry(10, "stale")))))
    assertTrue(planner.commitViewport(FeedRingViewportState(revision = 7, windowCenterIndex = 10, playbackIndex = 10, playbackAllowed = true, muted = false)))
    assertFalse(planner.commitViewport(FeedRingViewportState(revision = 7, windowCenterIndex = 11, playbackIndex = 11, playbackAllowed = true, muted = true)))

    val snapshot = planner.snapshot()

    assertEquals(4, snapshot.catalogRevision)
    assertEquals(7, snapshot.viewportRevision)
    assertEquals(10, snapshot.windowCenterIndex)
    assertFalse(snapshot.muted)
    assertEquals("a", planner.plannedSlots()[1].entry?.itemId)
  }

  @Test
  fun rejectsOlderViewportAfterNewerCommit() {
    val planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(20, "twenty"), entry(30, "thirty"))))

    assertTrue(planner.commitViewport(FeedRingViewportState(revision = 3, windowCenterIndex = 30, playbackIndex = 30, playbackAllowed = true, muted = false)))
    assertFalse(planner.commitViewport(FeedRingViewportState(revision = 2, windowCenterIndex = 20, playbackIndex = 20, playbackAllowed = false, muted = true)))

    val snapshot = planner.snapshot()
    assertEquals(3, snapshot.viewportRevision)
    assertEquals(30, snapshot.windowCenterIndex)
    assertTrue(snapshot.playbackAllowed)
    assertFalse(snapshot.muted)
    assertEquals("thirty", planner.plannedSlots()[1].entry?.itemId)
  }

  @Test
  fun updatesExistingViewportWhenCatalogChanges() {
    val planner = FeedRingWindowPlanner()

    planner.commitViewport(FeedRingViewportState(revision = 1, windowCenterIndex = 5, playbackIndex = 5, playbackAllowed = true, muted = false))
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(5, "first"))))
    assertEquals("first", planner.plannedSlots()[1].entry?.itemId)

    planner.replaceCatalog(FeedRingCatalogState(revision = 2, entries = listOf(entry(5, "second"))))

    assertEquals("second", planner.plannedSlots()[1].entry?.itemId)
  }

  @Test
  fun catalogReplacementUsesLastEntryForDuplicateIndex() {
    val planner = FeedRingWindowPlanner()

    planner.commitViewport(FeedRingViewportState(revision = 1, windowCenterIndex = 8, playbackIndex = 8, playbackAllowed = true, muted = false))
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(8, "first"), entry(8, "second"))))

    assertEquals("second", planner.plannedSlots()[1].entry?.itemId)
    assertEquals(1, planner.snapshot().catalogSize)
  }

  @Test
  fun returnsEmptyWindowUntilViewportExists() {
    val planner = FeedRingWindowPlanner()

    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(1, "one"))))

    assertTrue(planner.plannedSlots().isEmpty())
    assertNull(planner.snapshot().windowCenterIndex)
  }

  @Test
  fun playbackAllowedControlsOnlyCenterSlotIntent() {
    val planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(1, "one"), entry(2, "two"), entry(3, "three"))))

    planner.commitViewport(FeedRingViewportState(revision = 1, windowCenterIndex = 2, playbackIndex = 2, playbackAllowed = false, muted = true))
    assertEquals(listOf(false, false, false), planner.plannedSlots().map { it.shouldPlay })
    assertTrue(planner.snapshot().muted)

    planner.commitViewport(FeedRingViewportState(revision = 2, windowCenterIndex = 2, playbackIndex = 2, playbackAllowed = true, muted = true))
    assertEquals(listOf(false, true, false), planner.plannedSlots().map { it.shouldPlay })
  }

  @Test
  fun playbackIndexSelectsPlayingSlotIndependentlyOfWindowCenter() {
    val planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(1, "one"), entry(2, "two"), entry(3, "three"))))

    planner.commitViewport(
      FeedRingViewportState(revision = 1, windowCenterIndex = 2, playbackIndex = 3, playbackAllowed = true, muted = false)
    )

    val slots = planner.plannedSlots()
    assertEquals(listOf(1, 2, 3), slots.map { it.assignedIndex })
    assertEquals(listOf(false, false, true), slots.map { it.shouldPlay })
  }

  private fun entry(index: Int, itemId: String): FeedRingCatalogEntry {
    return FeedRingCatalogEntry(
      index = index,
      itemId = itemId,
      sourceKey = "source-$itemId",
      hasSource = true
    )
  }
}
