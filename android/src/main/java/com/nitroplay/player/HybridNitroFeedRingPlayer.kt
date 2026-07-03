package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import com.facebook.proguard.annotations.DoNotStrip
import com.nitroplay.feed.FeedRingCatalogEntry
import com.nitroplay.feed.FeedRingCatalogState
import com.nitroplay.feed.FeedRingCommand
import com.nitroplay.feed.FeedRingCommandAction
import com.nitroplay.feed.FeedRingCommandPlanner
import com.nitroplay.feed.FeedRingCommandSlotState
import com.nitroplay.feed.FeedRingViewportState
import com.nitroplay.feed.FeedRingWindowPlanner
import com.nitroplay.video.support.ListenerRegistry
import com.nitroplay.video.support.Threading.runOnMainThread
import com.nitroplay.video.support.Threading.runOnMainThreadSync

@OptIn(UnstableApi::class)
@DoNotStrip
class HybridNitroFeedRingPlayer : HybridNitroFeedRingPlayerSpec() {
  private data class CatalogItem(
    val index: Int,
    val momentId: String?,
    val sourceKey: String?,
    val source: HybridNitroPlayerSource?
  )

  private class SlotState(val slotId: Int) {
    val player = HybridNitroPlayer().also { it.reusePlayerInstanceForSourceChanges = true }
    var assignedIndex: Int? = null
    var momentId: String? = null
    var sourceKey: String? = null
    var generation: Long = 0
    var desiredPlay: Boolean = false
    var lastTransition: String = "empty"
    var lastError: String? = null
  }

  private val slots = Array(3) { slotId -> SlotState(slotId) }
  private val sourceFactory = HybridNitroPlayerSourceFactory()
  private val planner = FeedRingWindowPlanner(slotCount = slots.size)
  private val commandPlanner = FeedRingCommandPlanner()
  private val sourceCatalog = mutableMapOf<Int, CatalogItem>()
  private val listenerRegistry = ListenerRegistry()
  private var isReleased = false
  private var slotListenersConfigured = false
  @Volatile
  private var cachedMemorySize = 0L

  override fun getPlayer(slotId: Double): HybridNitroPlayerSpec {
    val normalizedSlotId = normalizeSlotId(slotId.toInt())
    return runOnMainThreadSync {
      if (isReleased) {
        throw IllegalStateException("Feed ring player is released")
      }

      slots[normalizedSlotId].player
    }
  }

  override fun replaceCatalog(catalog: FeedRingCatalog) {
    val items = catalog.items.map { item -> parseCatalogItem(item) }
    runOnMainThreadSync {
      if (isReleased) {
        return@runOnMainThreadSync
      }

      val accepted = planner.replaceCatalog(
        FeedRingCatalogState(
          revision = catalog.revision.toLong(),
          entries = items.map { item -> item.toPlannerEntry() }
        )
      )
      if (!accepted) {
        return@runOnMainThreadSync
      }

      sourceCatalog.clear()
      items.forEach { item -> sourceCatalog[item.index] = item }
      reconcileWindow()
    }
  }

  override fun commitViewport(viewport: FeedRingViewport) {
    val state = FeedRingViewportState(
      revision = viewport.revision.toLong(),
      centerIndex = viewport.centerIndex.toInt(),
      playbackAllowed = viewport.playbackAllowed,
      muted = viewport.muted
    )

    runOnMainThread {
      if (isReleased) {
        return@runOnMainThread
      }

      val accepted = planner.commitViewport(state)
      if (!accepted) {
        return@runOnMainThread
      }

      reconcileWindow()
    }
  }

  override fun snapshot(): FeedRingSnapshot {
    return runOnMainThreadSync {
      val plannerSnapshot = planner.snapshot()
      FeedRingSnapshot(
        catalogRevision = plannerSnapshot.catalogRevision.toDouble(),
        viewportRevision = plannerSnapshot.viewportRevision.toDouble(),
        catalogSize = plannerSnapshot.catalogSize.toDouble(),
        centerIndex = plannerSnapshot.centerIndex?.toDouble(),
        playbackAllowed = plannerSnapshot.playbackAllowed,
        muted = plannerSnapshot.muted,
        released = isReleased,
        slots = slots.map { slot -> snapshotSlot(slot) }.toTypedArray()
      )
    }
  }

  override fun addSlotStateListener(listener: (state: FeedRingSlotState) -> Unit): ListenerSubscription {
    return runOnMainThreadSync {
      configureSlotListenersIfNeeded()
      val subscription = listenerRegistry.add("slotState", listener)
      slots.forEach { slot -> emitSlotState(slot) }
      subscription
    }
  }

  override fun release() {
    runOnMainThreadSync {
      if (isReleased) return@runOnMainThreadSync

      isReleased = true
      listenerRegistry.clearAll()
      slots.forEach { slot ->
        slot.desiredPlay = false
        slot.player.release()
        slot.assignedIndex = null
        slot.momentId = null
        slot.sourceKey = null
        slot.generation += 1
        slot.lastTransition = "released"
        emitSlotState(slot)
      }
      cachedMemorySize = 0L
    }
  }

  override val memorySize: Long
    get() = cachedMemorySize

  private fun parseCatalogItem(item: FeedRingCatalogItem): CatalogItem {
    val source = item.source?.let { config -> sourceFactory.fromNitroPlayerConfig(config) as HybridNitroPlayerSource }
    return CatalogItem(
      index = item.index.toInt(),
      momentId = item.momentId,
      sourceKey = item.sourceKey,
      source = source
    )
  }

  private fun CatalogItem.toPlannerEntry(): FeedRingCatalogEntry {
    return FeedRingCatalogEntry(
      index = index,
      momentId = momentId,
      sourceKey = sourceKey,
      hasSource = source != null
    )
  }

  private fun reconcileWindow() {
    val plannedSlots = planner.plannedSlots()
    val commands = commandPlanner.plan(
      plannedSlots = plannedSlots,
      slots = slots.map { slot -> slot.toCommandState() }
    )
    commands.forEach { command ->
      executeCommand(command)
    }

    if (plannedSlots.isNotEmpty()) {
      reconcilePlayback()
    }
    refreshMemorySize()
  }

  private fun executeCommand(command: FeedRingCommand) {
    val slot = slots[command.slotId]
    when (command.action) {
      FeedRingCommandAction.CLEAR -> clearSlot(
        slot = slot,
        reason = command.reason ?: "clear",
        assignedIndex = command.assignedIndex,
        momentId = command.momentId,
        hadSource = command.hadSource
      )
      FeedRingCommandAction.REPLACE,
      FeedRingCommandAction.REUSE -> commitPlayableCommand(command, slot)
    }
  }

  private fun commitPlayableCommand(command: FeedRingCommand, slot: SlotState) {
    val assignedIndex = command.assignedIndex
    val sourceKey = command.sourceKey
    val source = assignedIndex?.let { index -> sourceCatalog[index]?.source }
    if (assignedIndex == null || sourceKey == null || source == null) {
      clearSlot(
        slot = slot,
        reason = "empty-source",
        assignedIndex = command.assignedIndex,
        momentId = command.momentId,
        hadSource = command.hadSource
      )
      return
    }

    val shouldPlay = command.shouldPlay
    slot.assignedIndex = assignedIndex
    slot.momentId = command.momentId
    slot.desiredPlay = shouldPlay
    slot.lastError = null

    val player = slot.player

    if (command.action == FeedRingCommandAction.REPLACE) {
      slot.sourceKey = sourceKey
      slot.generation += 1
      slot.lastTransition = "replace"
      player.wantsToPlay = shouldPlay
      applyStaticPlayerState(player, shouldPlay)
      emitSlotState(slot)
      val capturedGeneration = slot.generation
      player.replaceSourceAsync(source)
        .then {
          runOnMainThread {
            if (isReleased || slot.generation != capturedGeneration) return@runOnMainThread

            slot.lastError = null
            slot.lastTransition = "ready"
            applyStaticPlayerState(player, slot.desiredPlay)
            if (slot.desiredPlay) {
              player.play()
            } else {
              player.pause()
            }
            emitSlotState(slot)
            refreshMemorySize()
          }
        }
        .catch { error ->
          runOnMainThread {
            if (isReleased || slot.generation != capturedGeneration) {
              return@runOnMainThread
            }

            slot.sourceKey = null
            slot.lastError = error.message ?: error.toString()
            slot.lastTransition = "error"
            slot.desiredPlay = false
            emitSlotState(slot)
            refreshMemorySize()
          }
        }
      return
    }

    slot.lastTransition = "reuse"
    applyStaticPlayerState(player, shouldPlay)
    emitSlotState(slot)
  }

  private fun clearSlot(
    slot: SlotState,
    reason: String,
    assignedIndex: Int? = null,
    momentId: String? = null,
    hadSource: Boolean? = null
  ) {
    val player = slot.player
    val shouldClearNativeSource = hadSource ?: (slot.sourceKey != null)
    slot.desiredPlay = false
    slot.assignedIndex = assignedIndex
    slot.sourceKey = null
    slot.momentId = momentId
    slot.generation += 1
    slot.lastTransition = reason
    slot.lastError = null
    if (shouldClearNativeSource) {
      player.pause()
      val capturedGeneration = slot.generation
      player.clearSourceAsync().catch { error ->
        runOnMainThread {
          if (isReleased || slot.generation != capturedGeneration) {
            return@runOnMainThread
          }

          slot.lastError = error.message ?: error.toString()
          slot.lastTransition = "error"
          emitSlotState(slot)
        }
      }
    }
    emitSlotState(slot)
  }

  private fun SlotState.toCommandState(): FeedRingCommandSlotState {
    return FeedRingCommandSlotState(
      slotId = slotId,
      assignedIndex = assignedIndex,
      momentId = momentId,
      sourceKey = sourceKey
    )
  }

  private fun reconcilePlayback() {
    val plannedSlotsByIndex = planner.plannedSlots().associateBy { plannedSlot -> plannedSlot.assignedIndex }
    slots.forEach { slot ->
      val player = slot.player
      val shouldPlay = slot.assignedIndex?.let { assignedIndex -> plannedSlotsByIndex[assignedIndex]?.shouldPlay } == true && slot.sourceKey != null
      slot.desiredPlay = shouldPlay
      applyStaticPlayerState(player, shouldPlay)
      if (slot.lastTransition == "replace") {
        return@forEach
      }
      if (shouldPlay) {
        player.play()
      } else {
        player.pause()
      }
      emitSlotState(slot)
    }
  }

  private fun applyStaticPlayerState(player: HybridNitroPlayer, shouldPlay: Boolean) {
    val muted = planner.snapshot().muted
    player.loop = true
    player.muted = muted || !shouldPlay
    player.volume = if (muted || !shouldPlay) 0.0 else 1.0
  }

  private fun snapshotSlot(slot: SlotState): FeedRingSlotSnapshot {
    val player = slot.player
    val playbackState = player.playbackState
    val memorySnapshot = player.memorySnapshot
    val prepared = slot.sourceKey != null && (memorySnapshot.retentionState == RetentionLevel.HOT || playbackState.status != NitroPlayerStatus.IDLE)
    return FeedRingSlotSnapshot(
      slotId = slot.slotId.toDouble(),
      assignedIndex = slot.assignedIndex?.toDouble(),
      momentId = slot.momentId,
      sourceKey = slot.sourceKey,
      generation = slot.generation.toDouble(),
      desiredPlay = slot.desiredPlay,
      attached = memorySnapshot.isAttachedToView,
      prepared = prepared,
      ready = playbackState.isVisualReady || player.firstFrame != null,
      playing = playbackState.isPlaying,
      buffering = playbackState.isBuffering,
      currentTime = playbackState.currentTime,
      duration = sanitizedDuration(playbackState.duration),
      bufferDuration = playbackState.bufferDuration,
      bufferedPosition = playbackState.bufferedPosition,
      rate = playbackState.rate,
      wantsToPlay = memorySnapshot.wantsToPlay,
      retentionState = memorySnapshot.retentionState.name.lowercase(),
      hasLoadedSource = player.hasLoadedCurrentSource,
      watchdogAttempts = player.playbackWatchdogAttemptCount.toDouble(),
      watchdogPending = player.hasPendingPlaybackWatchdog,
      nativePlaybackState = playbackStateName(player.player.playbackState),
      status = playbackState.status.name.lowercase(),
      lastTransition = slot.lastTransition,
      lastError = slot.lastError
    )
  }

  private fun emitSlotState(slot: SlotState) {
    val state = slotState(slot)
    listenerRegistry.emit<(FeedRingSlotState) -> Unit>("slotState") { listener -> listener(state) }
  }

  private fun slotState(slot: SlotState): FeedRingSlotState {
    val playbackState = slot.player.playbackState
    return FeedRingSlotState(
      slotId = slot.slotId.toDouble(),
      generation = slot.generation.toDouble(),
      assignedIndex = slot.assignedIndex?.toDouble(),
      ready = playbackState.isVisualReady || slot.player.firstFrame != null,
      playing = playbackState.isPlaying,
      buffering = playbackState.isBuffering,
      currentTime = playbackState.currentTime,
      duration = sanitizedDuration(playbackState.duration)
    )
  }

  private fun configureSlotListenersIfNeeded() {
    if (slotListenersConfigured) {
      return
    }

    slotListenersConfigured = true
    slots.forEach { slot ->
      slot.player.eventEmitter.addOnPlaybackStateListener {
        emitSlotState(slot)
      }
      slot.player.eventEmitter.addOnFirstFrameListener {
        emitSlotState(slot)
      }
    }
  }

  private fun refreshMemorySize() {
    cachedMemorySize = slots.sumOf { slot -> slot.player.memorySize }
  }

  private fun sanitizedDuration(value: Double): Double {
    return if (value.isFinite() && value > 0) value else 0.0
  }

  private fun playbackStateName(state: Int): String {
    return when (state) {
      Player.STATE_IDLE -> "idle"
      Player.STATE_BUFFERING -> "buffering"
      Player.STATE_READY -> "ready"
      Player.STATE_ENDED -> "ended"
      else -> "unknown"
    }
  }

  private fun normalizeSlotId(slotId: Int): Int {
    if (slotId < 0 || slotId >= slots.size) {
      throw IllegalArgumentException("Feed ring slotId must be in 0..${slots.lastIndex}: $slotId")
    }
    return slotId
  }
}
