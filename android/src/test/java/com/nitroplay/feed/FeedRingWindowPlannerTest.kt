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
          centerIndex = 0,
          playbackAllowed = true,
          muted = false
        )
      )
    )

    val slots = planner.plannedSlots()

    assertEquals(listOf(2, 0, 1), slots.map { it.slotId })
    assertEquals(listOf(-1, 0, 1), slots.map { it.assignedIndex })
    assertEquals(listOf(false, true, false), slots.map { it.shouldPlay })
    assertEquals(listOf("previous", "current", "next"), slots.map { it.entry?.momentId })
  }

  @Test
  fun rejectsStaleCatalogAndViewportRevisionsIndependently() {
    val planner = FeedRingWindowPlanner()

    assertTrue(planner.replaceCatalog(FeedRingCatalogState(revision = 4, entries = listOf(entry(10, "a")))))
    assertFalse(planner.replaceCatalog(FeedRingCatalogState(revision = 4, entries = listOf(entry(10, "stale")))))
    assertTrue(planner.commitViewport(FeedRingViewportState(revision = 7, centerIndex = 10, playbackAllowed = true, muted = false)))
    assertFalse(planner.commitViewport(FeedRingViewportState(revision = 7, centerIndex = 11, playbackAllowed = true, muted = true)))

    val snapshot = planner.snapshot()

    assertEquals(4, snapshot.catalogRevision)
    assertEquals(7, snapshot.viewportRevision)
    assertEquals(10, snapshot.centerIndex)
    assertFalse(snapshot.muted)
    assertEquals("a", planner.plannedSlots()[1].entry?.momentId)
  }

  @Test
  fun rejectsOlderViewportAfterNewerCommit() {
    val planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(20, "twenty"), entry(30, "thirty"))))

    assertTrue(planner.commitViewport(FeedRingViewportState(revision = 3, centerIndex = 30, playbackAllowed = true, muted = false)))
    assertFalse(planner.commitViewport(FeedRingViewportState(revision = 2, centerIndex = 20, playbackAllowed = false, muted = true)))

    val snapshot = planner.snapshot()
    assertEquals(3, snapshot.viewportRevision)
    assertEquals(30, snapshot.centerIndex)
    assertTrue(snapshot.playbackAllowed)
    assertFalse(snapshot.muted)
    assertEquals("thirty", planner.plannedSlots()[1].entry?.momentId)
  }

  @Test
  fun updatesExistingViewportWhenCatalogChanges() {
    val planner = FeedRingWindowPlanner()

    planner.commitViewport(FeedRingViewportState(revision = 1, centerIndex = 5, playbackAllowed = true, muted = false))
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(5, "first"))))
    assertEquals("first", planner.plannedSlots()[1].entry?.momentId)

    planner.replaceCatalog(FeedRingCatalogState(revision = 2, entries = listOf(entry(5, "second"))))

    assertEquals("second", planner.plannedSlots()[1].entry?.momentId)
  }

  @Test
  fun catalogReplacementUsesLastEntryForDuplicateIndex() {
    val planner = FeedRingWindowPlanner()

    planner.commitViewport(FeedRingViewportState(revision = 1, centerIndex = 8, playbackAllowed = true, muted = false))
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(8, "first"), entry(8, "second"))))

    assertEquals("second", planner.plannedSlots()[1].entry?.momentId)
    assertEquals(1, planner.snapshot().catalogSize)
  }

  @Test
  fun returnsEmptyWindowUntilViewportExists() {
    val planner = FeedRingWindowPlanner()

    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(1, "one"))))

    assertTrue(planner.plannedSlots().isEmpty())
    assertNull(planner.snapshot().centerIndex)
  }

  @Test
  fun playbackAllowedControlsOnlyCenterSlotIntent() {
    val planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision = 1, entries = listOf(entry(1, "one"), entry(2, "two"), entry(3, "three"))))

    planner.commitViewport(FeedRingViewportState(revision = 1, centerIndex = 2, playbackAllowed = false, muted = true))
    assertEquals(listOf(false, false, false), planner.plannedSlots().map { it.shouldPlay })
    assertTrue(planner.snapshot().muted)

    planner.commitViewport(FeedRingViewportState(revision = 2, centerIndex = 2, playbackAllowed = true, muted = true))
    assertEquals(listOf(false, true, false), planner.plannedSlots().map { it.shouldPlay })
  }

  private fun entry(index: Int, momentId: String): FeedRingCatalogEntry {
    return FeedRingCatalogEntry(
      index = index,
      momentId = momentId,
      sourceKey = "source-$momentId",
      hasSource = true
    )
  }
}
