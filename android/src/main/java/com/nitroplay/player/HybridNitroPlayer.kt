@file:kotlin.OptIn(com.nitroplay.video.support.MainThreadBlockingCall::class)

package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultAllocator
import androidx.media3.ui.PlayerView
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.video.streaming.HlsProxyRuntime
import com.nitroplay.video.support.errors.LibraryError
import com.nitroplay.video.support.errors.PlayerError
import com.nitroplay.video.support.LifecycleGate
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.player.PlayerAppStateSnapshot
import com.nitroplay.video.player.PlayerRetentionCoordinator
import com.nitroplay.video.player.PlayerRetentionSnapshot
import com.nitroplay.video.runtime.PlaybackSessionRuntime
import com.nitroplay.video.runtime.PlaybackSessionCoordinatorSnapshot
import com.nitroplay.video.runtime.PlaybackSessionPolicy
import com.nitroplay.video.runtime.PlaybackSessionResumeMode
import com.nitroplay.video.runtime.PlaybackSessionBinding
import com.nitroplay.video.runtime.PlaybackEligibility
import com.nitroplay.video.support.Threading.mainThreadProperty
import com.nitroplay.video.support.Threading.runOnMainThread
import com.nitroplay.video.support.Threading.runOnMainThreadSync
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max
import kotlin.math.min

internal data class RingSlotDiagnostics(
  val slotId: Int,
  val assignedIndex: Int?,
  val awaitingSourceCommit: Boolean,
  val desiredPlay: Boolean,
  val lastTransition: String
)

internal interface RingSlotDiagnosticsProviding {
  fun ringSlotDiagnostics(): RingSlotDiagnostics
}

@UnstableApi
@DoNotStrip
private object InactiveNitroPlayerSource {
  val shared: HybridNitroPlayerSource by lazy {
    HybridNitroPlayerSource(
      NativeNitroPlayerConfig(
        uri = "file:///dev/null",
        headers = null,
        startup = NitroSourceStartup.EAGER,
        buffer = null,
        retention = null,
        transport = null
      )
    )
  }
}

@UnstableApi
@DoNotStrip
class HybridNitroPlayer() : HybridNitroPlayerSpec(), AutoCloseable {
  private data class SourceCommand(
    val generation: Int,
    val oldSource: HybridNitroPlayerSource?,
    val shouldAutoPlay: Boolean
  )

  internal var sourceStorage: HybridNitroPlayerSource? = null
  override val source: HybridNitroPlayerSourceSpec
    get() = sourceStorage ?: InactiveNitroPlayerSource.shared
  override var eventEmitter = HybridNitroPlayerEventEmitter()

  internal val lifecycleGate = LifecycleGate()
  internal val isReleased get() = lifecycleGate.isReleased
  internal var wantsToPlay = false
  internal var allocator: DefaultAllocator? = null
  private var context = NitroModules.applicationContext
    ?: run {
    throw LibraryError.ApplicationContextNotFound
  }

  private var playerInstance: ExoPlayer? = null
  internal var activePlaybackConfig: NitroPlayerPlaybackConfig? = null
    private set
  internal var trackSelector: DefaultTrackSelector? = null
    private set

  var player: ExoPlayer
    get() = playerInstance ?: throw PlayerError.NotInitialized
    internal set(value) {
      playerInstance = value
    }

  var loadedWithSource = false
  internal var currentNitroPlayerView: WeakReference<NitroPlayerView>? = null
  internal var currentPlayerView: WeakReference<PlayerView>? = null
  internal var readyToDisplay = false
  private val renderedVideoFrameSequence = AtomicLong(0L)
  private var playbackBinding: PlaybackSessionBinding? = null
  internal var ringSlotDiagnosticsProvider: WeakReference<RingSlotDiagnosticsProviding>? = null
  internal var isRingSlot = false
  private val attachedViewIds = mutableSetOf<Long>()
  private var playbackActive = false
  private var playbackVisible = false
  private var playbackRequiresView = true
  internal val hasPlaybackBinding get() = playbackBinding != null
  internal var desiredCurrentTimeMs = 0L
  internal var loopWrapCount = 0L
  private var cachedLoop = false
  private var cachedMuted = false
  private var cachedRate = 1.0
  private var hasObservedClockProgress = false
  private var playbackWatchdogIsCoolingDown = false
  private var playbackWatchdogCooldownCycles = 0
  internal var pendingTrimRunnable: Runnable? = null
  internal var pendingStartupRecoveryRunnable: Runnable? = null
  private var pendingBoundErrorRecoveryRunnable: Runnable? = null
  private var boundErrorRecoveryAttempts = 0
  internal var hasActiveSource = false
  internal var reusePlayerInstanceForSourceChanges = false
  internal var lastError: PlaybackError? = null
  internal val sourceGeneration get() = lifecycleGate.generation
  internal var startupRecoveryAttempts = 0
  internal var hasLoadedCurrentSource = false

  var wasAutoPaused = false
  private val startupRecoveryHandler = Handler(Looper.getMainLooper())
  private var sourceRecoveryToken = 0L
  private val startupRecoveryDelayMs = 250L
  private val maxStartupRecoveryAttempts = 1

  // Playback-start watchdog: STATE_READY (buffered) does not guarantee playback actually advances.
  // A decoder/surface stall can leave the player loaded yet frozen at position 0 with no error event,
  // so onPlayerError-driven startup recovery never fires. This watchdog re-prepares such a stall.
  private var pendingPlaybackWatchdogRunnable: Runnable? = null
  private var playbackWatchdogAttempts = 0
  private var playbackWatchdogEscalatedGeneration: Int? = null
  private val maxPlaybackWatchdogAttempts = 5

  // Buffer Config
  internal var bufferConfig: BufferConfig? = null
    get() = currentSourceConfig()?.buffer

  // Delegates
  internal val listenerBridge = NitroPlayerListenerBridge(this)
  internal val lifecycle = NitroPlayerLifecycle(this)

  override var status: NitroPlayerStatus = NitroPlayerStatus.IDLE
  internal var isCurrentlyBuffering: Boolean = false
  private val playbackStateEmissionGate = PlaybackStateEmissionGate()

  internal fun diagnosticsSnapshot(
    coordinatorSnapshot: PlaybackSessionCoordinatorSnapshot
  ): Map<String, Any?> {
    val binding = playbackBinding?.snapshot()
    val session = coordinatorSnapshot.sessions.firstOrNull { session ->
      session.key == binding?.key && session.leaseId == binding?.leaseId
    }
    val ringSlot = ringSlotDiagnosticsProvider?.get()?.ringSlotDiagnostics()
    return mapOf(
      "key" to binding?.key,
      "group" to binding?.policy?.group,
      "priority" to binding?.policy?.priority,
      "requested" to (binding?.requested ?: false),
      "eligibility" to mapOf(
        "active" to playbackActive,
        "visible" to playbackVisible,
        "attached" to isAttachedToView(),
        "requiresView" to playbackRequiresView
      ),
      "intent" to (session?.intent?.name ?: "idle"),
      "effectiveState" to (session?.effectiveState?.name ?: "paused"),
      "retentionLevel" to lifecycle.currentRetentionState().name.lowercase(),
      "wantsToPlay" to wantsToPlay,
      "hasActiveSource" to hasActiveSource,
      "isRingSlot" to isRingSlot,
      "status" to status.name.lowercase(),
      "ringSlot" to ringSlot?.let { slot ->
        mapOf(
          "slotId" to slot.slotId,
          "assignedIndex" to slot.assignedIndex,
          "awaitingSourceCommit" to slot.awaitingSourceCommit,
          "desiredPlay" to slot.desiredPlay,
          "lastTransition" to slot.lastTransition
        )
      }
    )
  }

  override val playbackState: PlaybackState
    get() = runOnMainThreadSync {
      buildPlaybackState()
    }

  override val memorySnapshot: MemorySnapshot
    get() = runOnMainThreadSync {
      buildMemorySnapshot()
    }

  // Player Properties
  override var currentTime: Double by mainThreadProperty(
    get = {
      if (isReleased || !loadedWithSource || !hasPlayerInstance()) {
        return@mainThreadProperty desiredCurrentTimeMs.toDouble() / 1000.0
      }

      player.currentPosition.toDouble() / 1000.0
    },
    set = { value ->
      val nextPositionMs = (clampedPlaybackTime(value) * 1000).toLong().coerceAtLeast(0L)
      desiredCurrentTimeMs = nextPositionMs
      emitPlaybackState()
      runOnMainThread {
        if (!isReleased && loadedWithSource) {
          currentPlayerOrNull()?.seekTo(nextPositionMs)
        }
      }
    }
  )

  // volume defined by user
  var userVolume: Double = 1.0

  override var volume: Double by mainThreadProperty(
    get = { if (isReleased) userVolume else currentPlayerOrNull()?.volume?.toDouble() ?: userVolume },
    set = { value ->
      userVolume = value
      if (!isReleased) currentPlayerOrNull()?.volume = value.toFloat()
    }
  )

  override val duration: Double by mainThreadProperty(
    get = {
      if (isReleased || !loadedWithSource || !hasPlayerInstance()) return@mainThreadProperty Double.NaN
      val duration = player.duration
      return@mainThreadProperty if (duration == C.TIME_UNSET) Double.NaN else duration.toDouble() / 1000.0
    }
  )

  override var loop: Boolean by mainThreadProperty(
    get = {
      if (isReleased || !loadedWithSource || !hasPlayerInstance()) {
        return@mainThreadProperty cachedLoop
      }

      player.repeatMode == Player.REPEAT_MODE_ONE
    },
    set = { value ->
      cachedLoop = value
      if (!isReleased) currentPlayerOrNull()?.repeatMode = if (value) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }
  )

  override var muted: Boolean by mainThreadProperty(
    get = { cachedMuted },
    set = { value ->
      val currentPlayer = currentPlayerOrNull()
      if (!isReleased && currentPlayer != null) {
        if (value && !cachedMuted) {
          // Prefer the pre-duck volume: while audio focus is ducking, the live
          // player.volume is 0.5x, and caching that would make unmute restore
          // the ducked level instead of the user's real volume.
          userVolume = NitroPlayerManager.audioFocusManager.preDuckVolume(this)?.toDouble() ?: volume
        }
        cachedMuted = value
        currentPlayer.volume = if (value) 0f else userVolume.toFloat()
        eventEmitter.onVolumeChange(onVolumeChangeData(
          volume = currentPlayer.volume.toDouble(),
          muted = cachedMuted
        ))
      } else {
        cachedMuted = value
      }
    }
  )

  override var rate: Double by mainThreadProperty(
    get = {
      if (isReleased || !loadedWithSource || !hasPlayerInstance()) {
        return@mainThreadProperty cachedRate
      }

      player.playbackParameters.speed.toDouble()
    },
    set = { value ->
      cachedRate = value
      if (!isReleased) {
        currentPlayerOrNull()?.let { currentPlayer ->
          currentPlayer.playbackParameters = currentPlayer.playbackParameters.withSpeed(value.toFloat())
        }
      }
    }
  )

  override var mixAudioMode: MixAudioMode = MixAudioMode.AUTO
    set(value) {
      field = value
      NitroPlayerManager.audioFocusManager.requestAudioFocusUpdate()
    }

  // iOS only property
  override var ignoreSilentSwitchMode: IgnoreSilentSwitchMode = IgnoreSilentSwitchMode.AUTO

  override var playInBackground: Boolean = false
    set(value) {
      field = value
    }

  override var playWhenInactive: Boolean = false

  override var isPlaying: Boolean by mainThreadProperty(
    get = { !isReleased && currentPlayerOrNull()?.isPlaying == true }
  )

  override val bufferDuration: Double by mainThreadProperty(
    get = { calculateBufferDurationSeconds() }
  )

  override val bufferedPosition: Double by mainThreadProperty(
    get = { calculateBufferedPositionSeconds() }
  )

  override val isBuffering: Boolean by mainThreadProperty(
    get = { isCurrentlyBuffering }
  )

  override val isVisualReady: Boolean by mainThreadProperty(
    get = { readyToDisplay }
  )

  internal fun createExoPlayer(playbackConfig: NitroPlayerPlaybackConfig): ExoPlayer {
    val renderersFactory = DefaultRenderersFactory(context)
      .forceEnableMediaCodecAsynchronousQueueing()
      .setEnableDecoderFallback(true)
    val nextTrackSelector = playbackConfig.createTrackSelector(context)

    val newPlayer = ExoPlayer.Builder(context)
      .setLoadControl(playbackConfig.createLoadControl(requireAllocator()))
      .setTrackSelector(nextTrackSelector)
      .setLooper(Looper.getMainLooper())
      .setRenderersFactory(renderersFactory)
      .build()
    newPlayer.setVideoFrameMetadataListener { _, _, _, _ ->
      if (playerInstance === newPlayer && !isReleased && hasActiveSource) {
        renderedVideoFrameSequence.incrementAndGet()
      }
    }

    newPlayer.repeatMode = if (cachedLoop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    newPlayer.playbackParameters = PlaybackParameters(cachedRate.toFloat())
    newPlayer.volume = if (cachedMuted) 0f else userVolume.toFloat()
    activePlaybackConfig = playbackConfig
    trackSelector = nextTrackSelector

    return newPlayer
  }

  internal fun hasPlayerInstance(): Boolean {
    return playerInstance != null
  }

  internal fun currentPlayerOrNull(): ExoPlayer? {
    return playerInstance
  }

  internal fun clearPlayerInstance() {
    playerInstance = null
    activePlaybackConfig = null
    trackSelector = null
  }

  internal fun applyPlaybackConfig(playbackConfig: NitroPlayerPlaybackConfig) {
    trackSelector?.let(playbackConfig::applyToTrackSelector)
    activePlaybackConfig = playbackConfig
  }

  private fun requireAllocator(): DefaultAllocator {
    return allocator ?: DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE).also { allocator = it }
  }

  internal fun rebindCurrentPlayerView() {
    val nitroView = currentNitroPlayerView?.get()
    val playerView = currentPlayerView?.get()
    if (
      nitroView == null ||
      playerView == null ||
      nitroView.hybridPlayer !== this ||
      nitroView.playerView !== playerView ||
      !nitroView.isAttachedToWindow
    ) {
      currentNitroPlayerView = null
      currentPlayerView = null
      return
    }

    playerView.player = playerInstance
  }

  internal fun detachPlayerFromNitroPlayerView(videoView: NitroPlayerView) {
    if (currentNitroPlayerView?.get() !== videoView) {
      return
    }

    currentPlayerView?.get()?.takeIf { it === videoView.playerView }?.player = null
    currentNitroPlayerView = null
    currentPlayerView = null
  }

  internal fun currentSourceConfig(): NativeNitroPlayerConfig? {
    return sourceStorage?.config
  }

  private fun resolvedInitialization(): NitroSourceStartup {
    return currentSourceConfig()?.startup ?: NitroSourceStartup.EAGER
  }

  internal fun toPlaybackError(code: NitroPlayerErrorCode, message: String): PlaybackError {
    return PlaybackError(code = code, message = message)
  }

  override fun initialize(): Promise<Unit> {
    return Promise.async {
      runOnMainThreadSync {
        if (isReleased || loadedWithSource || !hasActiveSource) return@runOnMainThreadSync
        cancelStartupRecovery()
        lifecycle.initializePlayer()
        player.prepare()
      }
    }
  }

  constructor(source: HybridNitroPlayerSource) : this() {
    sourceStorage = source
    this.cachedLoop = false
    this.cachedMuted = false
    this.cachedRate = 1.0
    this.hasActiveSource = true
    beginSourceGeneration()

    runOnMainThread {
      if (isReleased) return@runOnMainThread
      if (resolvedInitialization() == NitroSourceStartup.EAGER) {
        when (lifecycle.resolvedPreloadLevel()) {
          PreloadLevel.BUFFERED -> {
            lifecycle.initializePlayer()
            player.prepare()
          }
          PreloadLevel.METADATA -> {
            Promise.async {
              source.warmMetadata()
            }
          }
          PreloadLevel.NONE -> Unit
        }
      }
    }
  }

  init {
    NitroPlayerManager.registerPlayer(this)
  }

  override fun play() {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      lifecycle.cancelPendingTrim()
      if (!hasActiveSource) {
        status = NitroPlayerStatus.IDLE
        readyToDisplay = false
        isCurrentlyBuffering = false
        lastError = null
        emitPlaybackState()
        return@runOnMainThread
      }

      if (!loadedWithSource) {
        lifecycle.initializePlayer()
        player.prepare()
      }

      val wasPlayIntentActive = wantsToPlay
      wantsToPlay = true
      if (!wasPlayIntentActive) {
        playbackWatchdogAttempts = 0
        playbackWatchdogIsCoolingDown = false
        hasObservedClockProgress = false
      }
      if (status == NitroPlayerStatus.ERROR || lastError != null) {
        val failureMessage = lastError?.message ?: "Unknown playback error"
        playbackWatchdogAttempts = 0
        playbackWatchdogEscalatedGeneration = null
        playbackWatchdogIsCoolingDown = false
        hasObservedClockProgress = false
        lastError = null
        readyToDisplay = false
        isCurrentlyBuffering = false
        status = NitroPlayerStatus.LOADING
        emitPlaybackState()
        val recoverySource = currentHybridSource() ?: return@runOnMainThread
        val recoveryGeneration = sourceGeneration
        val recoveryToken = beginSourceRecovery()
        runSourceRecovery(
          capturedToken = recoveryToken,
          expectedSourceGeneration = recoveryGeneration,
          expectedSource = recoverySource,
          purgeCache = false,
          trimWhenNotProxying = false,
          forceRebuild = true,
          failureMessage = failureMessage
        )
        return@runOnMainThread
      }
      if (player.playbackState == Player.STATE_ENDED || isAtPlaybackEnd()) {
        desiredCurrentTimeMs = 0L
        status = NitroPlayerStatus.LOADING
        emitPlaybackState()
        player.seekTo(0L)
      }
      player.play()
      // Cleared only here, after a successful start: if initializePlayer()
      // above throws, the flag survives so the next foreground resume retries.
      wasAutoPaused = false
      status = when {
        player.isPlaying -> NitroPlayerStatus.PLAYING
        player.playbackState == Player.STATE_BUFFERING -> NitroPlayerStatus.BUFFERING
        else -> NitroPlayerStatus.LOADING
      }
      emitPlaybackState()
      schedulePlaybackStartWatchdog()
    }
  }

  private fun pauseTransport(clearPlayIntent: Boolean) {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      if (clearPlayIntent) {
        wantsToPlay = false
      }
      cancelStartupRecovery()
      cancelPlaybackWatchdog()
      currentPlayerOrNull()?.pause()
      listenerBridge.stopProgressUpdates()

      if (status != NitroPlayerStatus.ENDED && status != NitroPlayerStatus.IDLE) {
        status = NitroPlayerStatus.PAUSED
        emitPlaybackState()
      }

      if (!isAttachedToView()) {
        lifecycle.scheduleOffscreenTrim()
      }
    }
  }

  override fun pause() {
    pauseTransport(clearPlayIntent = true)
  }

  override fun configurePlayback(key: String, group: String, priority: Double, resumeAutomatically: Boolean, requiresView: Boolean) {
    require(key.isNotBlank()) { "Playback key must not be blank" }
    require(group.isNotBlank()) { "Playback group must not be blank" }
    require(priority.isFinite() && priority % 1.0 == 0.0 && priority >= Int.MIN_VALUE.toDouble() && priority <= Int.MAX_VALUE.toDouble()) {
      "Playback priority must be a signed 32-bit integer"
    }

    runOnMainThread {
      if (isReleased) return@runOnMainThread
      playbackRequiresView = requiresView
      if (playbackBinding == null) {
        playbackBinding = PlaybackSessionBinding(
          PlaybackSessionRuntime.coordinator,
          {
            try {
              play()
            } catch (error: Throwable) {
              failPlayback(error.message ?: "Unknown playback error")
            }
          },
          { pause() },
          { eventEmitter.onPlaybackIntentIdled() },
        )
      }
      playbackBinding?.configure(
        key,
        PlaybackSessionPolicy(
          group = group,
          priority = priority.toInt(),
          resume = if (resumeAutomatically) PlaybackSessionResumeMode.automatic else PlaybackSessionResumeMode.manual,
        ),
      )
      playbackBinding?.updateEligibility(PlaybackEligibility.resolve(playbackActive, playbackVisible, isAttachedToView(), playbackRequiresView))
    }
  }

  override fun updatePlayback(active: Boolean, visible: Boolean, muted: Boolean, loop: Boolean) {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      this.muted = muted
      this.loop = loop
      playbackActive = active
      playbackVisible = visible
      playbackBinding?.updateEligibility(PlaybackEligibility.resolve(playbackActive, playbackVisible, isAttachedToView(), playbackRequiresView))
    }
  }

  /**
   * Re-delivers the intent already declared by the playback binding after a foreground
   * transition.
   *
   * Lifecycle handlers skip bound players because the arbiter owns their intent, but nothing
   * re-delivers that intent when the process returns to the foreground: the player stays idle
   * while its binding still declares playback. Re-asserting keeps the arbiter authoritative -
   * a binding that wants idle stays idle.
   */
  internal fun reassertPlaybackIntentAfterForeground() {
    if (isReleased || !hasActiveSource) {
      return
    }
    if (playbackBinding?.snapshot()?.desiredPlayback != true) {
      return
    }
    if (isPlaying) {
      return
    }
    playbackBinding?.requestPlay()
  }

  override fun requestPlayback() {
    runOnMainThread {
      playbackBinding?.requestPlay()
    }
  }

  override fun requestIdle() {
    runOnMainThread {
      resetBoundErrorRecovery()
      playbackBinding?.requestIdle()
    }
  }

  override fun clearPlayback() {
    runOnMainThread {
      resetBoundErrorRecovery()
      playbackBinding?.release()
      playbackBinding = null
      playbackActive = false
      playbackVisible = false
      playbackRequiresView = true
    }
  }

  // App-state pause must preserve wantsToPlay so the foreground policy can resume it.
  internal fun lifecyclePause() {
    pauseTransport(clearPlayIntent = false)
  }

  override fun seekBy(time: Double) {
    val safeDuration = if (duration.isNaN()) Double.MAX_VALUE else duration
    currentTime = (currentTime + time).coerceIn(0.0, safeDuration)
  }

  override fun seekTo(time: Double) {
    val safeDuration = if (duration.isNaN()) Double.MAX_VALUE else duration
    currentTime = time.coerceIn(0.0, safeDuration)
  }

  override fun replaceSourceAsync(source: HybridNitroPlayerSourceSpec): Promise<Unit> {
    val command = beginSourceCommand(allowAutoPlay = true)
    return Promise.async {
      val hybridSource = when (source) {
        is HybridNitroPlayerSource -> source
        else -> throw PlayerError.InvalidSource
      }
      val activeCommand = command ?: return@async

      activeCommand.oldSource?.sourceLoader?.cancel()
      val action = runOnMainThreadSync {
        if (!lifecycleGate.shouldDeliverCallback(activeCommand.generation)) {
          return@runOnMainThreadSync null
        }

        lifecycle.clearCurrentSourceState(activeCommand.oldSource, beginGeneration = false)
        sourceStorage = hybridSource
        hasActiveSource = true
        desiredCurrentTimeMs = 0L
        status = NitroPlayerStatus.IDLE
        readyToDisplay = false
        isCurrentlyBuffering = false
        lastError = null
        val resolvedAction = SourceActivationPolicy.resolve(
          startup = resolvedInitialization(),
          preload = lifecycle.resolvedPreloadLevel(),
          shouldAutoPlay = activeCommand.shouldAutoPlay
        )
        emitPlaybackState()
        resolvedAction
      } ?: return@async

      when (action) {
        SourceActivationAction.IDLE -> Unit
        SourceActivationAction.METADATA -> {
          val shouldWarm = runOnMainThreadSync {
            lifecycleGate.shouldDeliverCallback(activeCommand.generation)
          }
          if (shouldWarm) {
            hybridSource.warmMetadata()
          }
        }
        SourceActivationAction.BUFFERED -> runOnMainThreadSync {
          if (!lifecycleGate.shouldDeliverCallback(activeCommand.generation)) {
            return@runOnMainThreadSync
          }
          lifecycle.initializePlayer()
          player.prepare()
        }
        SourceActivationAction.PLAY -> runOnMainThreadSync {
          if (!lifecycleGate.shouldDeliverCallback(activeCommand.generation)) {
            return@runOnMainThreadSync
          }
          play()
        }
      }
    }
  }

  override fun clearSourceAsync(): Promise<Unit> {
    val command = beginSourceCommand(allowAutoPlay = false)
    return Promise.async {
      val activeCommand = command ?: return@async

      activeCommand.oldSource?.sourceLoader?.cancel()
      runOnMainThreadSync {
        if (!lifecycleGate.shouldDeliverCallback(activeCommand.generation)) {
          return@runOnMainThreadSync
        }

        lifecycle.clearCurrentSourceState(activeCommand.oldSource, beginGeneration = false)
      }
    }
  }

  override fun preload(): Promise<Unit> {
    return Promise.async {
      val level = runOnMainThreadSync {
        if (isReleased) return@runOnMainThreadSync PreloadLevel.NONE
        if (!hasActiveSource) return@runOnMainThreadSync PreloadLevel.NONE
        lifecycle.cancelPendingTrim()
        lifecycle.resolvedPreloadLevel()
      }

      when (level) {
        PreloadLevel.NONE -> {}
        PreloadLevel.METADATA -> {
          sourceStorage?.warmMetadata()
        }
        PreloadLevel.BUFFERED -> {
          sourceStorage?.requestLeadingSegmentPrefetch(HlsProxyRuntime.DEFAULT_PREFETCH_DURATION_SECONDS)
          runOnMainThreadSync {
            if (isReleased) return@runOnMainThreadSync
            if (!loadedWithSource) {
              lifecycle.initializePlayer()
            }

            if (player.playbackState != Player.STATE_IDLE) {
              return@runOnMainThreadSync
            }

            player.prepare()
          }
        }
      }
    }
  }

  override fun release() {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      clearPlayback()
      lifecycleGate.markReleased()

      try {
        NitroPlayerManager.unregisterPlayer(this)
        listenerBridge.unbind()
        lifecycle.cancelPendingTrim()
        cancelStartupRecovery()
        cancelPlaybackWatchdog()
        loadedWithSource = false
        hasActiveSource = false

        eventEmitter.clearAllListeners()

        attachedViewIds.clear()
        currentPlayerView?.get()?.player = null
        currentNitroPlayerView = null
        currentPlayerView = null

        status = NitroPlayerStatus.IDLE
        readyToDisplay = false
        isCurrentlyBuffering = false
        lastError = null
        allocator = null
        sourceStorage?.trimToCold()
      } finally {
        currentPlayerOrNull()?.release()
        clearPlayerInstance()
      }
    }
  }

  fun movePlayerToNitroPlayerView(videoView: NitroPlayerView) {
    NitroPlayerManager.addViewToPlayer(videoView, this)

    runOnMainThread {
      if (isReleased) return@runOnMainThread
      val currentPlayer = currentPlayerOrNull()
      val previousPlayerView = currentPlayerView?.get()
      val nextPlayerView = videoView.playerView
      if (currentPlayer != null) {
        if (previousPlayerView === nextPlayerView || nextPlayerView.player !== currentPlayer) {
          previousPlayerView?.takeIf { it !== nextPlayerView }?.player = null
          nextPlayerView.player = currentPlayer
        } else {
          PlayerView.switchTargetView(currentPlayer, previousPlayerView, nextPlayerView)
        }
      } else {
        previousPlayerView?.player = null
        nextPlayerView.player = null
      }
      videoView.syncPlayerViewLayout()
      currentNitroPlayerView = WeakReference(videoView)
      currentPlayerView = WeakReference(nextPlayerView)
    }
  }

  override fun dispose() {
    release()
  }

  override fun close() {
    release()
  }

  override val memorySize: Long
    get() = allocator?.totalBytesAllocated?.toLong() ?: 0L

  private fun calculateCurrentTimeSeconds(): Double {
    if (!loadedWithSource || !hasPlayerInstance()) {
      return desiredCurrentTimeMs / 1000.0
    }

    return clampedPlaybackTime(player.currentPosition / 1000.0)
  }

  private fun calculateDurationSeconds(): Double {
    val duration = currentPlayerOrNull()?.duration ?: return Double.NaN
    return if (duration == C.TIME_UNSET) Double.NaN else sanitizedDuration(duration.toDouble() / 1000.0)
  }

  private fun calculateBufferedPositionSeconds(): Double {
    if (!loadedWithSource || !hasPlayerInstance()) {
      return desiredCurrentTimeMs / 1000.0
    }

    return player.bufferedPosition / 1000.0
  }

  private fun calculateBufferDurationSeconds(): Double {
    return max(0.0, calculateBufferedPositionSeconds() - calculateCurrentTimeSeconds())
  }

  // Lightweight raw-value holder + fingerprint built once per tick, mirroring the
  // iOS PlaybackSnapshot. Lets emitPlaybackState() dedupe before allocating the
  // Nitro PlaybackState.
  private data class PlaybackSnapshot(
    val status: NitroPlayerStatus,
    val currentTime: Double,
    val duration: Double,
    val bufferDuration: Double,
    val bufferedPosition: Double,
    val rate: Double,
    val isPlaying: Boolean,
    val isBuffering: Boolean,
    val isVisualReady: Boolean,
    val error: PlaybackError?,
    val nativeTimestampMs: Double,
    val fingerprint: PlaybackStateFingerprint
  )

  private fun currentPlaybackSnapshot(): PlaybackSnapshot {
    if (isReleased) {
      return PlaybackSnapshot(
        status = NitroPlayerStatus.IDLE,
        currentTime = 0.0, duration = 0.0, bufferDuration = 0.0,
        bufferedPosition = 0.0, rate = 0.0,
        isPlaying = false, isBuffering = false, isVisualReady = false,
        error = null,
        nativeTimestampMs = System.currentTimeMillis().toDouble(),
        fingerprint = PlaybackStateFingerprint.fromValues(
          NitroPlayerStatus.IDLE, 0.0, 0.0, 0.0, 0.0, 0.0, false, false, false, null
        )
      )
    }

    val currentTime = calculateCurrentTimeSeconds()
    val duration = calculateDurationSeconds()
    val terminalCurrentTime = if (status == NitroPlayerStatus.ENDED && duration.isFinite() && duration > 0.0) {
      duration
    } else {
      currentTime
    }
    val bufferedPosition = calculateBufferedPositionSeconds()
    val cappedBufferedPosition = if (duration.isFinite() && duration > 0.0) {
      min(duration, terminalCurrentTime + max(0.0, bufferedPosition - currentTime))
    } else {
      bufferedPosition
    }
    val bufferDuration = max(0.0, cappedBufferedPosition - terminalCurrentTime)
    val currentPlayer = currentPlayerOrNull()
    val rate = currentPlayer?.playbackParameters?.speed?.toDouble() ?: cachedRate
    val playing = currentPlayer?.isPlaying == true
    val buffering = isCurrentlyBuffering
    val visualReady = readyToDisplay
    val error = lastError
    return PlaybackSnapshot(
      status = status,
      currentTime = terminalCurrentTime,
      duration = duration,
      bufferDuration = bufferDuration,
      bufferedPosition = cappedBufferedPosition,
      rate = rate,
      isPlaying = playing,
      isBuffering = buffering,
      isVisualReady = visualReady,
      error = error,
      nativeTimestampMs = System.currentTimeMillis().toDouble(),
      fingerprint = PlaybackStateFingerprint.fromValues(
        status, terminalCurrentTime, duration, bufferDuration, cappedBufferedPosition, rate,
        playing, buffering, visualReady, error
      )
    )
  }

  private fun sanitizedDuration(value: Double): Double {
    return if (value.isFinite() && value >= 0.0) value else Double.NaN
  }

  private fun clampedPlaybackTime(value: Double): Double {
    val positiveValue = if (value.isFinite()) max(0.0, value) else 0.0
    val duration = calculateDurationSeconds()
    return if (duration.isFinite() && duration > 0.0) min(positiveValue, duration) else positiveValue
  }

  private fun isAtPlaybackEnd(): Boolean {
    val duration = calculateDurationSeconds()
    return duration.isFinite() && duration > 0.0 && calculateCurrentTimeSeconds() >= duration - 0.05
  }

  private fun playbackStateFrom(snapshot: PlaybackSnapshot): PlaybackState = PlaybackState(
    status = snapshot.status,
    currentTime = snapshot.currentTime,
    duration = snapshot.duration,
    bufferDuration = snapshot.bufferDuration,
    bufferedPosition = snapshot.bufferedPosition,
    rate = snapshot.rate,
    isPlaying = snapshot.isPlaying,
    isBuffering = snapshot.isBuffering,
    isVisualReady = snapshot.isVisualReady,
    error = snapshot.error?.let { Variant_NullType_PlaybackError.Second(it) },
    nativeTimestampMs = snapshot.nativeTimestampMs
  )

  internal fun buildPlaybackState(): PlaybackState = playbackStateFrom(currentPlaybackSnapshot())

  private fun buildMemorySnapshot(): MemorySnapshot {
    if (isReleased) return MemorySnapshot(
      playerBytes = 0.0, sourceBytes = 0.0, totalBytes = 0.0,
      preloadLevel = lifecycle.resolvedPreloadLevel(), retentionState = lifecycle.currentRetentionState(),
      isAttachedToView = false, isPlaying = false, wantsToPlay = false,
      isRingSlot = false, isPinnedForResourcePressure = false
    )
    val playerBytes = memorySize.toDouble()
    val sourceBytes = sourceStorage?.memorySize?.toDouble() ?: 0.0
    val retention = lifecycle.retentionSnapshot()

    return MemorySnapshot(
      playerBytes = playerBytes,
      sourceBytes = sourceBytes,
      totalBytes = playerBytes + sourceBytes,
      preloadLevel = lifecycle.resolvedPreloadLevel(),
      retentionState = lifecycle.currentRetentionState(),
      isAttachedToView = isAttachedToView(),
      isPlaying = loadedWithSource && currentPlayerOrNull()?.isPlaying == true,
      wantsToPlay = wantsToPlay,
      isRingSlot = isRingSlot,
      isPinnedForResourcePressure = PlayerRetentionCoordinator.isPinnedForResourcePressure(retention)
    )
  }

  internal fun emitPlaybackState() {
    if (!lifecycleGate.shouldEmit()) return
    val snapshot = currentPlaybackSnapshot()
    // The 0.25s progress tick rebuilds the snapshot every time, but when nothing
    // meaningful changed (only the timestamp advanced) there is no reason to cross
    // the bridge or allocate the Nitro PlaybackState. nativeTimestampMs is excluded
    // from the fingerprint.
    if (!playbackStateEmissionGate.shouldEmit(snapshot.fingerprint)) {
      return
    }
    eventEmitter.onPlaybackState(playbackStateFrom(snapshot))
  }

  internal fun beginSourceGeneration() {
    lifecycleGate.beginGeneration()
    resetBoundErrorRecovery()
    startupRecoveryAttempts = 0
    hasLoadedCurrentSource = false
    playbackStateEmissionGate.reset()
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    playbackWatchdogAttempts = 0
    playbackWatchdogEscalatedGeneration = null
    playbackWatchdogIsCoolingDown = false
    playbackWatchdogCooldownCycles = 0
    hasObservedClockProgress = false
    renderedVideoFrameSequence.set(0L)
  }

  /**
   * A foreground transition opens a new lifecycle epoch. Recovery budgets spent while the process
   * was backgrounded must not disable recovery for the rest of the process lifetime.
   */
  internal fun resetRecoveryBudgetsForNewLifecycleEpoch() {
    if (isReleased) {
      return
    }
    startupRecoveryAttempts = 0
    playbackWatchdogAttempts = 0
    playbackWatchdogEscalatedGeneration = null
    playbackWatchdogIsCoolingDown = false
    playbackWatchdogCooldownCycles = 0
  }

  private fun beginSourceCommand(allowAutoPlay: Boolean): SourceCommand? {
    return runOnMainThreadSync {
      if (isReleased) {
        return@runOnMainThreadSync null
      }

      val shouldAutoPlay = allowAutoPlay && wantsToPlay
      val oldSource = sourceStorage

      wantsToPlay = false
      beginSourceGeneration()
      SourceCommand(
        generation = sourceGeneration,
        oldSource = oldSource,
        shouldAutoPlay = shouldAutoPlay
      )
    }
  }

  internal fun markCurrentSourceLoaded() {
    hasLoadedCurrentSource = true
    startupRecoveryAttempts = 0
    cancelStartupRecovery()
  }

  internal fun cancelStartupRecovery() {
    invalidateSourceRecovery()
    pendingStartupRecoveryRunnable?.let { startupRecoveryHandler.removeCallbacks(it) }
    pendingStartupRecoveryRunnable = null
  }

  private fun invalidateSourceRecovery() {
    sourceRecoveryToken += 1L
  }

  private fun beginSourceRecovery(): Long {
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    sourceRecoveryToken += 1L
    return sourceRecoveryToken
  }

  private fun resetBoundErrorRecovery() {
    pendingBoundErrorRecoveryRunnable?.let { startupRecoveryHandler.removeCallbacks(it) }
    pendingBoundErrorRecoveryRunnable = null
    boundErrorRecoveryAttempts = 0
  }

  private fun nextBoundErrorRecoveryDelayMs(): Long = when (boundErrorRecoveryAttempts) {
    0 -> 250L
    1 -> 1_000L
    2 -> 3_000L
    3 -> 8_000L
    else -> 15_000L
  }

  private fun scheduleBoundErrorRecovery() {
    val binding = playbackBinding ?: return
    if (isReleased || !hasActiveSource || !binding.snapshot().desiredPlayback) return
    if (pendingBoundErrorRecoveryRunnable != null) return

    val generation = sourceGeneration
    val delayMs = nextBoundErrorRecoveryDelayMs()
    val runnable = Runnable {
      pendingBoundErrorRecoveryRunnable = null
      val currentBinding = playbackBinding
      if (
        isReleased ||
        !hasActiveSource ||
        sourceGeneration != generation ||
        currentBinding?.snapshot()?.desiredPlayback != true
      ) {
        resetBoundErrorRecovery()
        return@Runnable
      }

      currentBinding.requestPlay()
    }
    boundErrorRecoveryAttempts += 1
    pendingBoundErrorRecoveryRunnable = runnable
    startupRecoveryHandler.postDelayed(runnable, delayMs)
  }

  internal fun cancelPlaybackWatchdog() {
    invalidateSourceRecovery()
    pendingPlaybackWatchdogRunnable?.let { startupRecoveryHandler.removeCallbacks(it) }
    pendingPlaybackWatchdogRunnable = null
  }

  internal val playbackWatchdogAttemptCount: Int
    get() = playbackWatchdogAttempts

  internal val hasPendingPlaybackWatchdog: Boolean
    get() = pendingPlaybackWatchdogRunnable != null

  // Arm the playback watchdog. Idempotent: repeated play() intents do not reset an in-flight timer.
  // Uses dynamic timing: 12s for cold-start/post-rearm, 3s after observed progress, 15s during cooldown.
  // The runnable checks advancement since this window's baseline; on healthy (advanced /
  // looped / near end) it resets the attempt counter and RE-ARMS to keep watching the whole playback,
  // so a freeze AFTER initial progress is still caught. Buffer growth is not playback liveness, so a
  // loaded source without clock progress consumes the bounded recovery budget. A genuine freeze
  // recovers the loaded player;
  // only CONSECUTIVE freezes are counted, and that count is hard-bounded, so healthy playback never
  // exhausts the retries.
  internal fun schedulePlaybackStartWatchdog() {
    if (isReleased || !hasActiveSource || !wantsToPlay) return
    if (pendingPlaybackWatchdogRunnable != null) return

    val generation = sourceGeneration
    val activePlayer = currentPlayerOrNull() ?: return
    val startPositionMs = activePlayer.currentPosition
    val startLoopWrapCount = loopWrapCount
    val startRenderedVideoFrameSequence = renderedVideoFrameSequence.get()
    val isWindowCoolingDown = playbackWatchdogIsCoolingDown
    val isWindowObserved = hasObservedClockProgress
    val windowDelayMs = PlaybackWatchdogPolicy.playbackWatchdogWindowDelayMs(
      hasObservedClockProgress = isWindowObserved,
      isCoolingDown = isWindowCoolingDown
    )
    val runnable = Runnable {
      pendingPlaybackWatchdogRunnable = null
      if (isReleased || !hasActiveSource || !wantsToPlay || sourceGeneration != generation) {
        return@Runnable
      }
      val activePlayer = currentPlayerOrNull() ?: return@Runnable
      val cooldownElapsed = isWindowCoolingDown
      // Relative advancement, a completed loop, or non-loop near-end playback is healthy. On healthy,
      // RE-ARM to keep watching the whole playback.
      val decision = PlaybackWatchdogPolicy.evaluate(
        startPositionMs = startPositionMs,
        currentPositionMs = activePlayer.currentPosition,
        durationMs = activePlayer.duration,
        loop = loop,
        loopWrapped = loopWrapCount != startLoopWrapCount,
        hasLoadedCurrentSource = hasLoadedCurrentSource,
        attempts = playbackWatchdogAttempts,
        maxAttempts = maxPlaybackWatchdogAttempts,
        escalationUsed = playbackWatchdogEscalatedGeneration == generation,
        cooldownElapsed = cooldownElapsed,
        cooldownCycles = playbackWatchdogCooldownCycles,
        maxCooldownCycles = 2,
        requiresRenderedFrameProgress = isAttachedToView() && hasLoadedCurrentSource,
        renderedFrameProgressed = readyToDisplay && renderedVideoFrameSequence.get() > startRenderedVideoFrameSequence
      )
      playbackWatchdogAttempts = decision.attempts
      when (decision.action) {
        PlaybackWatchdogAction.RESET_AND_REARM -> {
          playbackWatchdogIsCoolingDown = false
          playbackWatchdogCooldownCycles = 0
          hasObservedClockProgress = true
          schedulePlaybackStartWatchdog()
          return@Runnable
        }
        PlaybackWatchdogAction.ESCALATE_SOURCE -> {
          playbackWatchdogIsCoolingDown = false
          hasObservedClockProgress = false
          escalatePlaybackWatchdog(generation)
          return@Runnable
        }
        PlaybackWatchdogAction.ENTER_COOLDOWN -> {
          playbackWatchdogIsCoolingDown = true
          playbackWatchdogCooldownCycles += 1
          schedulePlaybackStartWatchdog()
          return@Runnable
        }
        PlaybackWatchdogAction.TERMINATE -> {
          failPlayback("watchdog terminal")
          return@Runnable
        }
        PlaybackWatchdogAction.REARM -> {
          playbackWatchdogIsCoolingDown = false
          schedulePlaybackStartWatchdog()
          return@Runnable
        }
        PlaybackWatchdogAction.RECOVER_STALLED_PLAYBACK -> Unit
      }
      // Loaded + wantsToPlay + no time progress is a stall even when ExoPlayer reports
      // STATE_BUFFERING. Keeping that state on the watch loop strands the feed on the first
      // frame with no error. The HLS proxy is intentionally left alone: it already serves
      // this loaded source, and transport recovery binds a socket (blocking I/O)
      // which on the main looper freezes runOnMainThreadSync readers past their 5s bound.
      // initializePlayer re-sets the same media source and recreates the player; prepare/play
      // restart decoding. Genuine route/proxy failures surface via onPlayerError instead.
      if (hasLoadedCurrentSource) {
        playbackWatchdogIsCoolingDown = false
        hasObservedClockProgress = false
        if (runRecoveryAction(generation) {
          lifecycle.initializePlayer()
          player.prepare()
          player.play()
        }) {
          schedulePlaybackStartWatchdog()
        }
        return@Runnable
      }
      schedulePlaybackStartWatchdog()
    }
    pendingPlaybackWatchdogRunnable = runnable
    startupRecoveryHandler.postDelayed(runnable, windowDelayMs)
  }

  private fun escalatePlaybackWatchdog(generation: Int) {
    if (isReleased || !hasActiveSource || !wantsToPlay || sourceGeneration != generation) {
      return
    }
    if (playbackWatchdogEscalatedGeneration == generation) {
      playbackWatchdogIsCoolingDown = true
      playbackWatchdogAttempts = maxPlaybackWatchdogAttempts
      schedulePlaybackStartWatchdog()
      return
    }

    val recoverySource = currentHybridSource() ?: return
    playbackWatchdogEscalatedGeneration = generation
    playbackWatchdogAttempts = 0
    playbackWatchdogIsCoolingDown = false
    hasObservedClockProgress = false
    readyToDisplay = false
    isCurrentlyBuffering = false
    status = NitroPlayerStatus.LOADING
    emitPlaybackState()

    val recoveryToken = beginSourceRecovery()
    runSourceRecovery(
      capturedToken = recoveryToken,
      expectedSourceGeneration = generation,
      expectedSource = recoverySource,
      purgeCache = true,
      trimWhenNotProxying = true,
      forceRebuild = true,
      failureMessage = "Playback watchdog source recovery failed"
    )
  }

  internal fun currentHybridSource(): HybridNitroPlayerSource? {
    return sourceStorage
  }

  /**
   * Re-resolves the playback route when it no longer matches the current transport. The existing
   * async recovery path already re-prepares the item, so the new route actually takes effect.
   */
  internal fun refreshPlaybackRouteIfStale() {
    if (isReleased) {
      return
    }
    val source = currentHybridSource() ?: return
    if (!source.isRouteStale) {
      return
    }
    source.recoverPlaybackRouteAsync(
      purgeCache = false,
      trimWhenNotProxying = true
    ) { }
  }

  internal fun clearStoredHybridSource() {
    sourceStorage = null
  }

  internal fun shouldAttemptStartupRecovery(): Boolean {
    if (isReleased || !hasActiveSource || !wantsToPlay || hasLoadedCurrentSource) {
      return false
    }
    if (startupRecoveryAttempts >= maxStartupRecoveryAttempts) {
      return false
    }
    return currentHybridSource()?.supportsStartupRecovery() == true
  }

  internal fun attemptStartupRecoveryIfNeeded(message: String): Boolean {
    if (!shouldAttemptStartupRecovery()) {
      return false
    }

    val recoverySource = currentHybridSource() ?: return false
    startupRecoveryAttempts += 1
    val generation = sourceGeneration
    readyToDisplay = false
    isCurrentlyBuffering = false
    lastError = null
    status = NitroPlayerStatus.LOADING
    emitPlaybackState()

    val recoveryToken = beginSourceRecovery()
    lateinit var runnable: Runnable
    runnable = Runnable {
      if (pendingStartupRecoveryRunnable !== runnable) {
        return@Runnable
      }
      pendingStartupRecoveryRunnable = null
      if (
        sourceRecoveryToken != recoveryToken ||
        isReleased ||
        !hasActiveSource ||
        !wantsToPlay ||
        sourceGeneration != generation ||
        currentHybridSource() !== recoverySource
      ) {
        return@Runnable
      }
      runSourceRecovery(
        capturedToken = recoveryToken,
        expectedSourceGeneration = generation,
        expectedSource = recoverySource,
        purgeCache = false,
        trimWhenNotProxying = false,
        forceRebuild = false,
        failureMessage = message
      )
    }
    pendingStartupRecoveryRunnable = runnable
    startupRecoveryHandler.postDelayed(runnable, startupRecoveryDelayMs)
    return true
  }

  internal fun failPlayback(message: String) {
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    status = NitroPlayerStatus.ERROR
    wantsToPlay = false
    isCurrentlyBuffering = false
    readyToDisplay = false
    lastError = toPlaybackError(NitroPlayerErrorCode.UNKNOWN_UNKNOWN, message)
    listenerBridge.stopProgressUpdates()

    currentHybridSource()?.purgePlaybackCacheAsync()
    try {
      currentPlayerOrNull()?.pause()
    } catch (_: Throwable) {
    }

    lastError?.let { eventEmitter.onError(it) }
    emitPlaybackState()
    scheduleBoundErrorRecovery()
  }

  private fun runRecoveryAction(generation: Int, action: () -> Unit): Boolean {
    if (isReleased || !hasActiveSource || !wantsToPlay || sourceGeneration != generation) {
      return false
    }

    return try {
      action()
      true
    } catch (error: Throwable) {
      if (!isReleased && sourceGeneration == generation) {
        failPlayback(error.message ?: "Unknown playback error")
      }
      false
    }
  }

  private fun runSourceRecovery(
    capturedToken: Long,
    expectedSourceGeneration: Int,
    expectedSource: HybridNitroPlayerSource,
    purgeCache: Boolean,
    trimWhenNotProxying: Boolean,
    forceRebuild: Boolean,
    failureMessage: String
  ) {
    expectedSource.recoverPlaybackRouteAsync(purgeCache, trimWhenNotProxying) { result ->
      startupRecoveryHandler.post {
        if (
          sourceRecoveryToken != capturedToken ||
          isReleased ||
          !hasActiveSource ||
          !wantsToPlay ||
          sourceGeneration != expectedSourceGeneration ||
          currentHybridSource() !== expectedSource
        ) {
          return@post
        }

        val error = result.exceptionOrNull()
        if (error != null) {
          failPlayback(failureMessage.ifBlank { error.message ?: "Unknown playback error" })
          return@post
        }

        try {
          lifecycle.initializePlayer(forceRebuild)
          player.prepare()
          player.play()
          wasAutoPaused = false
          schedulePlaybackStartWatchdog()
        } catch (error: Throwable) {
          if (
            sourceRecoveryToken == capturedToken &&
            !isReleased &&
            hasActiveSource &&
            wantsToPlay &&
            sourceGeneration == expectedSourceGeneration &&
            currentHybridSource() === expectedSource
          ) {
            failPlayback(error.message ?: "Unknown playback error")
          }
        }
      }
    }
  }

  internal fun markReadyToDisplay(expectedPlayer: ExoPlayer, expectedSourceGeneration: Int) {
    runOnMainThread {
      if (
        isReleased ||
        !hasActiveSource ||
        currentPlayerOrNull() !== expectedPlayer ||
        sourceGeneration != expectedSourceGeneration
      ) {
        return@runOnMainThread
      }
      readyToDisplay = true
      resetBoundErrorRecovery()
      emitPlaybackState()
    }
  }

  internal fun resolvePlayPauseStatus(): NitroPlayerStatus {
    if (currentPlayerOrNull()?.isPlaying == true) return NitroPlayerStatus.PLAYING
    if (wantsToPlay) {
      return when (status) {
        NitroPlayerStatus.BUFFERING,
        NitroPlayerStatus.LOADING,
        NitroPlayerStatus.PLAYING -> status
        else -> NitroPlayerStatus.LOADING
      }
    }
    return NitroPlayerStatus.PAUSED
  }

  internal fun enterBuffering() {
    isCurrentlyBuffering = true
    if (status != NitroPlayerStatus.PLAYING && status != NitroPlayerStatus.PAUSED) {
      status = NitroPlayerStatus.BUFFERING
    }
  }

  internal fun isAttachedToView(): Boolean {
    return attachedViewIds.isNotEmpty()
  }

  fun notifyViewAttached(attachmentId: Long) {
    if (!attachedViewIds.add(attachmentId)) {
      return
    }
    playbackBinding?.updateEligibility(PlaybackEligibility.resolve(playbackActive, playbackVisible, isAttachedToView(), playbackRequiresView))
    lifecycle.cancelPendingTrim()
  }

  fun notifyViewDetached(attachmentId: Long) {
    if (!attachedViewIds.remove(attachmentId)) {
      return
    }
    playbackBinding?.updateEligibility(PlaybackEligibility.resolve(playbackActive, playbackVisible, isAttachedToView(), playbackRequiresView))
    if (isAttachedToView()) {
      return
    }

    lifecycle.scheduleOffscreenTrim()
  }

  internal fun retentionSnapshot(): PlayerRetentionSnapshot {
    return lifecycle.retentionSnapshot()
  }

  internal fun appStateSnapshot(): PlayerAppStateSnapshot {
    return lifecycle.appStateSnapshot()
  }

  internal fun trimForResourcePressure() {
    lifecycle.trimForResourcePressure()
  }
}
