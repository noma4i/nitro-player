package com.nitroplay.feed

data class FeedRingCatalogEntry(
  val index: Int,
  val itemId: String?,
  val sourceKey: String?,
  val hasSource: Boolean
)

data class FeedRingCatalogState(
  val revision: Long,
  val entries: List<FeedRingCatalogEntry>
)

data class FeedRingViewportState(
  val revision: Long,
  val windowCenterIndex: Int,
  val playbackIndex: Int,
  val playbackAllowed: Boolean,
  val muted: Boolean
)

data class FeedRingPlannedSlot(
  val slotId: Int,
  val assignedIndex: Int,
  val entry: FeedRingCatalogEntry?,
  val shouldPlay: Boolean
)

data class FeedRingPlannerSnapshot(
  val catalogRevision: Long,
  val viewportRevision: Long,
  val catalogSize: Int,
  val windowCenterIndex: Int?,
  val playbackIndex: Int?,
  val playbackAllowed: Boolean,
  val muted: Boolean
)

class FeedRingWindowPlanner(
  private val slotCount: Int = 3
) {
  private val catalog = mutableMapOf<Int, FeedRingCatalogEntry>()
  private var catalogRevision: Long = -1
  private var viewportRevision: Long = -1
  private var windowCenterIndex: Int? = null
  private var playbackIndex: Int? = null
  private var playbackAllowed = false
  private var muted = false

  init {
    require(slotCount > 0) { "slotCount must be positive" }
  }

  fun replaceCatalog(state: FeedRingCatalogState): Boolean {
    if (state.revision <= catalogRevision) {
      return false
    }

    catalogRevision = state.revision
    catalog.clear()
    state.entries.forEach { entry ->
      catalog[entry.index] = entry
    }
    return true
  }

  fun commitViewport(state: FeedRingViewportState): Boolean {
    if (state.revision <= viewportRevision) {
      return false
    }

    viewportRevision = state.revision
    windowCenterIndex = state.windowCenterIndex
    playbackIndex = state.playbackIndex
    playbackAllowed = state.playbackAllowed
    muted = state.muted
    return true
  }

  fun resetRevisions() {
    catalogRevision = -1
    viewportRevision = -1
  }

  fun plannedSlots(): List<FeedRingPlannedSlot> {
    val currentWindowCenterIndex = windowCenterIndex ?: return emptyList()
    val currentPlaybackIndex = playbackIndex ?: return emptyList()
    return (-1..1).map { offset ->
      val assignedIndex = currentWindowCenterIndex + offset
      FeedRingPlannedSlot(
        slotId = positiveMod(assignedIndex, slotCount),
        assignedIndex = assignedIndex,
        entry = catalog[assignedIndex],
        shouldPlay = playbackAllowed && assignedIndex == currentPlaybackIndex
      )
    }
  }

  fun snapshot(): FeedRingPlannerSnapshot {
    return FeedRingPlannerSnapshot(
      catalogRevision = catalogRevision,
      viewportRevision = viewportRevision,
      catalogSize = catalog.size,
      windowCenterIndex = windowCenterIndex,
      playbackIndex = playbackIndex,
      playbackAllowed = playbackAllowed,
      muted = muted
    )
  }

  private fun positiveMod(value: Int, divisor: Int): Int {
    return ((value % divisor) + divisor) % divisor
  }
}
