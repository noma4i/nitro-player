@file:kotlin.OptIn(com.nitroplay.video.support.MainThreadBlockingCall::class)

package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import android.os.Handler
import android.os.Looper
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
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong

@OptIn(UnstableApi::class)
@DoNotStrip
class HybridNitroFeedRingPlayer : HybridNitroFeedRingPlayerSpec() {
  private companion object {
    private val RECOVERY_DELAYS_MS = longArrayOf(250L, 1000L, 3000L, 8000L, 15000L)
    private const val MAX_RECOVERY_ATTEMPTS = 7
    private val NEXT_RING_TOKEN = AtomicLong(1L)
  }

  private data class CatalogItem(
    val index: Int,
    val itemId: String?,
    val sourceKey: String?,
    val source: HybridNitroPlayerSource?
  )

  private data class PlaybackIntent(
    val desiredAndCommitted: Boolean,
    val muted: Boolean
  )

  private class SlotState(val slotId: Int) : RingSlotDiagnosticsProviding {
    val player = HybridNitroPlayer().also {
      it.reusePlayerInstanceForSourceChanges = true
      it.isRingSlot = true
      it.ringSlotDiagnosticsProvider = WeakReference(this)
    }
    var assignedIndex: Int? = null
    var itemId: String? = null
    var sourceKey: String? = null
    var generation: Long = 0
    var desiredPlay: Boolean = false
    var awaitingSourceCommit: Boolean = false
    var lastTransition: String = "empty"
    var lastError: String? = null
    var recoveryAttempt = 0
    var recoveryAssignedIndex: Int? = null
    var recoverySourceKey: String? = null
    var recoveryRunnable: Runnable? = null
    var recoveryScheduleToken = 0L
    var lastPlaybackIntent: PlaybackIntent? = null

    override fun ringSlotDiagnostics(): RingSlotDiagnostics {
      return RingSlotDiagnostics(
        slotId = slotId,
        assignedIndex = assignedIndex,
        awaitingSourceCommit = awaitingSourceCommit,
        desiredPlay = desiredPlay,
        lastTransition = lastTransition
      )
    }
  }

  private val slots = Array(3) { slotId -> SlotState(slotId) }
  private val sourceFactory = HybridNitroPlayerSourceFactory()
  private val planner = FeedRingWindowPlanner(slotCount = slots.size)
  private val commandPlanner = FeedRingCommandPlanner()
  private val sourceCatalog = mutableMapOf<Int, CatalogItem>()
  private val listenerRegistry = ListenerRegistry()
  private val recoveryHandler = Handler(Looper.getMainLooper())
  override val ringToken = NEXT_RING_TOKEN.getAndIncrement().toDouble()
  private var lastActivationId = -1L
  private var lastProjectionRevision = -1L
  @Volatile
  private var released = false
  private var slotListenersConfigured = false
  @Volatile
  private var cachedMemorySize = 0L

  override fun getPlayer(slotId: Double): HybridNitroPlayerSpec {
    val normalizedSlotId = normalizeSlotId(decodeBridgeInt(slotId, "slotId"))
    if (released) {
      throw IllegalStateException("Feed ring player is released")
    }

    return slots[normalizedSlotId].player
  }

  override fun configurePlayback(key: String, group: String, priority: Double, resumeAutomatically: Boolean) {
    runOnMainThread {
      if (released) {
        return@runOnMainThread
      }

      slots.forEach { slot ->
        slot.player.configurePlayback(
          key = "$key:slot-${slot.slotId}",
          group = group,
          priority = priority,
          resumeAutomatically = resumeAutomatically,
          requiresView = true
        )
      }
    }
  }

  override fun applyProjection(projection: FeedRingProjection) {
    runOnMainThread {
      if (released) {
        return@runOnMainThread
      }

      val activationId: Long
      val revision: Long
      val windowCenterIndex: Int
      val playbackIndex: Int
      try {
        activationId = decodeBridgeLong(projection.activationId, "activationId")
        revision = decodeBridgeLong(projection.revision, "revision")
        windowCenterIndex = decodeBridgeInt(projection.windowCenterIndex, "windowCenterIndex")
        playbackIndex = decodeBridgeInt(projection.playbackIndex, "playbackIndex")
        require(kotlin.math.abs(playbackIndex.toLong() - windowCenterIndex.toLong()) <= 1) {
          "Feed ring playbackIndex must belong to the prepared window"
        }
      } catch (error: IllegalArgumentException) {
        emitCommandEvent(
          kind = "apply-error",
          projectionRevision = if (projection.revision.isFinite()) projection.revision else -1.0,
          error = error.message
        )
        return@runOnMainThread
      }

      if (activationId > lastActivationId) {
        lastActivationId = activationId
        lastProjectionRevision = -1
        planner.resetRevisions()
      }

      if (revision <= lastProjectionRevision) {
        emitCommandEvent(kind = "rejected", projectionRevision = projection.revision)
        return@runOnMainThread
      }

      lastProjectionRevision = revision
      val parseErrors = mutableListOf<String>()
      projection.catalog?.let { catalog ->
        val items = catalog.items.mapNotNull { item ->
          try {
            parseCatalogItem(item)
          } catch (error: Throwable) {
            parseErrors.add(error.message ?: error.toString())
            null
          }
        }
        planner.replaceCatalog(
          FeedRingCatalogState(
            revision = revision,
            entries = items.map { item -> item.toPlannerEntry() }
          )
        )
        sourceCatalog.clear()
        items.forEach { item -> sourceCatalog[item.index] = item }
        resetRecoveryForCatalogChanges()
      }

      planner.commitViewport(
        FeedRingViewportState(
          revision = revision,
          windowCenterIndex = windowCenterIndex,
          playbackIndex = playbackIndex,
          playbackAllowed = projection.playbackAllowed,
          muted = projection.muted
        )
      )
      reconcileWindow()
      emitCommandEvent(kind = "accepted", projectionRevision = projection.revision)
      if (parseErrors.isNotEmpty()) {
        emitCommandEvent(
          kind = "apply-error",
          projectionRevision = projection.revision,
          error = parseErrors.joinToString("; ")
        )
      }
    }
  }

  override fun snapshot(): FeedRingSnapshot {
    return runOnMainThreadSync {
      val plannerSnapshot = planner.snapshot()
      FeedRingSnapshot(
        catalogRevision = plannerSnapshot.catalogRevision.toDouble(),
        viewportRevision = plannerSnapshot.viewportRevision.toDouble(),
        catalogSize = plannerSnapshot.catalogSize.toDouble(),
        windowCenterIndex = plannerSnapshot.windowCenterIndex?.toDouble(),
        playbackIndex = plannerSnapshot.playbackIndex?.toDouble(),
        playbackAllowed = plannerSnapshot.playbackAllowed,
        muted = plannerSnapshot.muted,
        released = released,
        slots = slots.map { slot -> snapshotSlot(slot) }.toTypedArray()
      )
    }
  }

  override fun addSlotStateListener(listener: (state: FeedRingSlotState) -> Unit): ListenerSubscription {
    val subscription = listenerRegistry.add("slotState", listener)
    runOnMainThread {
      configureSlotListenersIfNeeded()
      slots.forEach { slot -> emitSlotState(slot) }
    }
    return subscription
  }

  override fun addCommandEventListener(listener: (event: FeedRingCommandEvent) -> Unit): ListenerSubscription {
    return listenerRegistry.add("commandEvent", listener)
  }

  override fun release() {
    runOnMainThread {
      if (released) {
        return@runOnMainThread
      }

      released = true
      listenerRegistry.clearAll()
      slots.forEach { slot ->
        resetRecovery(slot)
        slot.desiredPlay = false
        slot.player.release()
        slot.assignedIndex = null
        slot.itemId = null
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
      index = decodeBridgeInt(item.index, "catalog.index"),
      itemId = item.itemId,
      sourceKey = item.sourceKey,
      source = source
    )
  }

  private fun CatalogItem.toPlannerEntry(): FeedRingCatalogEntry {
    return FeedRingCatalogEntry(
      index = index,
      itemId = itemId,
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
        itemId = command.itemId,
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
        itemId = command.itemId,
        hadSource = command.hadSource
      )
      return
    }

    val shouldPlay = command.shouldPlay
    if (
      command.action == FeedRingCommandAction.REPLACE &&
      slot.lastTransition == "retry-wait" &&
      slot.recoveryRunnable != null &&
      hasRecoveryTarget(slot, assignedIndex, sourceKey)
    ) {
      slot.assignedIndex = assignedIndex
      slot.itemId = command.itemId
      syncSlotPlayback(slot)
      emitSlotState(slot)
      return
    }
    if (slot.recoveryAssignedIndex != null && !hasRecoveryTarget(slot, assignedIndex, sourceKey)) {
      resetRecovery(slot)
    }
    slot.assignedIndex = assignedIndex
    slot.itemId = command.itemId
    slot.desiredPlay = shouldPlay
    slot.lastError = null

    if (command.action == FeedRingCommandAction.REPLACE) {
      if (slot.sourceKey == sourceKey && slot.lastTransition == "replace") {
        // Same-source replace already in flight: the pending completion (same
        // generation) owns the load; only refresh the play intent.
        syncSlotPlayback(slot)
        emitSlotState(slot)
        return
      }
      prepareRecoveryTarget(slot, assignedIndex, sourceKey)
      slot.sourceKey = sourceKey
      slot.generation += 1
      slot.awaitingSourceCommit = true
      slot.lastTransition = "replace"
      syncSlotPlayback(slot)
      emitSlotState(slot)
      val capturedGeneration = slot.generation
      startReplace(slot, source, capturedGeneration)
      return
    }

    slot.lastTransition = "reuse"
    syncSlotPlayback(slot)
    emitSlotState(slot)
  }

  private fun clearSlot(
    slot: SlotState,
    reason: String,
    assignedIndex: Int? = null,
    itemId: String? = null,
    hadSource: Boolean? = null
  ) {
    val player = slot.player
    val shouldClearNativeSource = hadSource ?: (slot.sourceKey != null)
    val isExactEmptyState =
      !shouldClearNativeSource &&
      slot.assignedIndex == assignedIndex &&
      slot.itemId == itemId &&
      slot.sourceKey == null &&
      !slot.desiredPlay &&
      !slot.awaitingSourceCommit &&
      slot.lastError == null &&
      slot.recoveryAssignedIndex == null &&
      slot.recoverySourceKey == null
    if (isExactEmptyState) {
      return
    }

    val resetsLifecycle =
      shouldClearNativeSource ||
      slot.sourceKey != null ||
      slot.awaitingSourceCommit ||
      slot.lastError != null ||
      slot.recoveryAssignedIndex != null ||
      slot.recoverySourceKey != null
    resetRecovery(slot)
    slot.desiredPlay = false
    slot.assignedIndex = assignedIndex
    slot.sourceKey = null
    slot.itemId = itemId
    if (resetsLifecycle) {
      slot.generation += 1
    }
    slot.awaitingSourceCommit = shouldClearNativeSource
    slot.lastTransition = reason
    slot.lastError = null
    syncSlotPlayback(slot)
    if (shouldClearNativeSource) {
      val capturedGeneration = slot.generation
      player.clearSourceAsync()
        .then {
          runOnMainThread {
            if (released || slot.generation != capturedGeneration) {
              return@runOnMainThread
            }

            slot.awaitingSourceCommit = false
            emitSlotState(slot)
          }
        }
        .catch { error ->
          runOnMainThread {
            if (released || slot.generation != capturedGeneration) {
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
      itemId = itemId,
      sourceKey = sourceKey,
      hasSource = player.hasActiveSource,
      hasError = player.playbackState.status == NitroPlayerStatus.ERROR || player.lastError != null
    )
  }

  private fun reconcilePlayback() {
    val plannedSlotsByIndex = planner.plannedSlots().associateBy { plannedSlot -> plannedSlot.assignedIndex }
    slots.forEach { slot ->
      val shouldPlay = slot.assignedIndex?.let { assignedIndex -> plannedSlotsByIndex[assignedIndex]?.shouldPlay } == true && slot.sourceKey != null
      val didChangeDesiredPlay = slot.desiredPlay != shouldPlay
      slot.desiredPlay = shouldPlay
      val didApplyPlayback = syncSlotPlayback(slot)
      if (didChangeDesiredPlay || didApplyPlayback) {
        emitSlotState(slot)
      }
    }
  }

  private fun syncSlotPlayback(slot: SlotState, force: Boolean = false): Boolean {
    val desiredAndCommitted = slot.desiredPlay && !slot.awaitingSourceCommit && slot.sourceKey != null
    val intent = PlaybackIntent(
      desiredAndCommitted = desiredAndCommitted,
      muted = planner.snapshot().muted || !desiredAndCommitted
    )
    if (!force && slot.lastPlaybackIntent == intent) {
      return false
    }

    slot.player.updatePlayback(
      active = desiredAndCommitted,
      visible = desiredAndCommitted,
      muted = intent.muted,
      loop = true
    )
    if (desiredAndCommitted) {
      slot.player.requestPlayback()
    } else {
      slot.player.requestIdle()
    }
    slot.lastPlaybackIntent = intent
    return true
  }

  private fun startReplace(slot: SlotState, source: HybridNitroPlayerSource, capturedGeneration: Long) {
    try {
      slot.player.replaceSourceAsync(source)
        .then {
          runOnMainThread {
            if (released || slot.generation != capturedGeneration) {
              return@runOnMainThread
            }

            slot.lastError = null
            slot.awaitingSourceCommit = false
            slot.lastTransition = "ready"
            resetRecovery(slot)
            syncSlotPlayback(slot, force = true)
            emitSlotState(slot)
            refreshMemorySize()
          }
        }
        .catch { error ->
          runOnMainThread {
            handleReplaceFailure(slot, capturedGeneration, error)
          }
        }
    } catch (error: Throwable) {
      handleReplaceFailure(slot, capturedGeneration, error)
    }
  }

  private fun handleReplaceFailure(slot: SlotState, capturedGeneration: Long, error: Throwable) {
    if (released || slot.generation != capturedGeneration) {
      return
    }

    slot.sourceKey = null
    slot.awaitingSourceCommit = false
    slot.desiredPlay = false
    slot.lastError = error.message ?: error.toString()
    slot.lastTransition = "retry-wait"
    syncSlotPlayback(slot)
    emitSlotState(slot)
    scheduleRecovery(slot, capturedGeneration)
    refreshMemorySize()
  }

  private fun prepareRecoveryTarget(slot: SlotState, assignedIndex: Int, sourceKey: String) {
    cancelScheduledRecovery(slot)
    if (!hasRecoveryTarget(slot, assignedIndex, sourceKey)) {
      resetRecovery(slot)
      slot.recoveryAssignedIndex = assignedIndex
      slot.recoverySourceKey = sourceKey
    }
  }

  private fun scheduleRecovery(slot: SlotState, capturedGeneration: Long) {
    if (
      slot.recoveryRunnable != null ||
      slot.recoveryAssignedIndex == null ||
      slot.recoverySourceKey == null
    ) {
      return
    }

    if (slot.recoveryAttempt >= MAX_RECOVERY_ATTEMPTS) {
      emitCommandEvent(
        kind = "source-error",
        projectionRevision = lastProjectionRevision.toDouble(),
        slotId = slot.slotId,
        assignedIndex = slot.recoveryAssignedIndex,
        error = slot.lastError ?: "recovery exhausted"
      )
      resetRecovery(slot)
      slot.lastTransition = "source-error"
      emitSlotState(slot)
      return
    }

    slot.recoveryAttempt += 1
    val delayMs = RECOVERY_DELAYS_MS[(slot.recoveryAttempt - 1).coerceAtMost(RECOVERY_DELAYS_MS.lastIndex)]
    slot.recoveryScheduleToken += 1
    val capturedScheduleToken = slot.recoveryScheduleToken
    val runnable = object : Runnable {
      override fun run() {
        if (slot.recoveryScheduleToken != capturedScheduleToken) {
          return
        }

        slot.recoveryRunnable = null
        if (!isRecoveryCurrent(slot, capturedGeneration)) {
          resetRecovery(slot)
          return
        }

        reconcileWindow()
      }
    }
    slot.recoveryRunnable = runnable
    recoveryHandler.postDelayed(runnable, delayMs)
  }

  private fun isRecoveryCurrent(slot: SlotState, capturedGeneration: Long): Boolean {
    val assignedIndex = slot.recoveryAssignedIndex ?: return false
    val sourceKey = slot.recoverySourceKey ?: return false
    val catalogItem = sourceCatalog[assignedIndex] ?: return false
    if (
      released ||
      slot.generation != capturedGeneration ||
      slot.assignedIndex != assignedIndex ||
      catalogItem.sourceKey != sourceKey ||
      catalogItem.source == null
    ) {
      return false
    }

    return planner.plannedSlots().any { plannedSlot ->
      plannedSlot.slotId == slot.slotId &&
        plannedSlot.assignedIndex == assignedIndex &&
        plannedSlot.entry?.sourceKey == sourceKey &&
        plannedSlot.entry?.hasSource == true
    }
  }

  private fun resetRecoveryForCatalogChanges() {
    slots.forEach { slot ->
      val assignedIndex = slot.recoveryAssignedIndex ?: return@forEach
      val sourceKey = slot.recoverySourceKey ?: return@forEach
      val catalogItem = sourceCatalog[assignedIndex]
      if (catalogItem?.sourceKey != sourceKey || catalogItem.source == null) {
        resetRecovery(slot)
      }
    }
  }

  private fun hasRecoveryTarget(slot: SlotState, assignedIndex: Int, sourceKey: String): Boolean {
    return slot.recoveryAssignedIndex == assignedIndex && slot.recoverySourceKey == sourceKey
  }

  private fun resetRecovery(slot: SlotState) {
    cancelScheduledRecovery(slot)
    slot.recoveryAttempt = 0
    slot.recoveryAssignedIndex = null
    slot.recoverySourceKey = null
  }

  private fun cancelScheduledRecovery(slot: SlotState) {
    slot.recoveryRunnable?.let { recoveryHandler.removeCallbacks(it) }
    slot.recoveryRunnable = null
    slot.recoveryScheduleToken += 1
  }

  private fun snapshotSlot(slot: SlotState): FeedRingSlotSnapshot {
    val player = slot.player
    val playbackState = player.playbackState
    val memorySnapshot = player.memorySnapshot
    val prepared = slot.sourceKey != null && (memorySnapshot.retentionState == RetentionLevel.HOT || playbackState.status != NitroPlayerStatus.IDLE)
    return FeedRingSlotSnapshot(
      slotId = slot.slotId.toDouble(),
      assignedIndex = slot.assignedIndex?.toDouble(),
      itemId = slot.itemId,
      sourceKey = slot.sourceKey,
      generation = slot.generation.toDouble(),
      desiredPlay = slot.desiredPlay,
      attached = memorySnapshot.isAttachedToView,
      prepared = prepared,
      ready = !slot.awaitingSourceCommit && playbackState.isVisualReady,
      playing = if (slot.awaitingSourceCommit) false else playbackState.isPlaying,
      buffering = playbackState.isBuffering,
      currentTime = if (slot.awaitingSourceCommit) 0.0 else playbackState.currentTime,
      duration = if (slot.awaitingSourceCommit) 0.0 else sanitizedDuration(playbackState.duration),
      bufferDuration = playbackState.bufferDuration,
      bufferedPosition = playbackState.bufferedPosition,
      rate = playbackState.rate,
      wantsToPlay = memorySnapshot.wantsToPlay,
      retentionState = memorySnapshot.retentionState.name.lowercase(),
      hasLoadedSource = player.hasLoadedCurrentSource,
      watchdogAttempts = player.playbackWatchdogAttemptCount.toDouble(),
      watchdogPending = player.hasPendingPlaybackWatchdog,
      nativePlaybackState = playbackStateName(player.currentPlayerOrNull()?.playbackState ?: Player.STATE_IDLE),
      status = playbackState.status.name.lowercase(),
      lastTransition = slot.lastTransition,
      lastError = slot.lastError
    )
  }

  private fun emitSlotState(slot: SlotState) {
    val state = slotState(slot)
    listenerRegistry.emit<(FeedRingSlotState) -> Unit>("slotState") { listener -> listener(state) }
  }

  private fun emitCommandEvent(
    kind: String,
    projectionRevision: Double,
    slotId: Int? = null,
    assignedIndex: Int? = null,
    error: String? = null
  ) {
    val event = FeedRingCommandEvent(
      ringToken = ringToken,
      projectionRevision = projectionRevision,
      kind = kind,
      slotId = slotId?.toDouble(),
      assignedIndex = assignedIndex?.toDouble(),
      error = error
    )
    listenerRegistry.emit<(FeedRingCommandEvent) -> Unit>("commandEvent") { listener -> listener(event) }
  }

  private fun slotState(slot: SlotState): FeedRingSlotState {
    val playbackState = slot.player.playbackState
    return FeedRingSlotState(
      slotId = slot.slotId.toDouble(),
      generation = slot.generation.toDouble(),
      assignedIndex = slot.assignedIndex?.toDouble(),
      ready = !slot.awaitingSourceCommit && playbackState.isVisualReady,
      playing = if (slot.awaitingSourceCommit) false else playbackState.isPlaying,
      buffering = playbackState.isBuffering,
      currentTime = if (slot.awaitingSourceCommit) 0.0 else playbackState.currentTime,
      duration = if (slot.awaitingSourceCommit) 0.0 else sanitizedDuration(playbackState.duration)
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

  private fun decodeBridgeInt(value: Double, field: String): Int {
    val decoded = decodeBridgeLong(value, field)
    require(decoded in Int.MIN_VALUE..Int.MAX_VALUE) {
      "Feed ring $field must fit a signed 32-bit integer: $value"
    }
    return decoded.toInt()
  }

  private fun decodeBridgeLong(value: Double, field: String): Long {
    val maxSafeInteger = 9_007_199_254_740_991.0
    require(value.isFinite() && value % 1.0 == 0.0 && value >= -maxSafeInteger && value <= maxSafeInteger) {
      "Feed ring $field must be a safe integer: $value"
    }
    return value.toLong()
  }
}
