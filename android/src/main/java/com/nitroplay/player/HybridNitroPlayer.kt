package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Format
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
import com.nitroplay.video.preview.PreviewRequest
import com.nitroplay.video.preview.VideoPreviewResult
import com.nitroplay.video.preview.VideoPreviewRuntime
import com.nitroplay.video.support.errors.LibraryError
import com.nitroplay.video.support.errors.PlayerError
import com.nitroplay.video.support.LifecycleGate
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.player.PlayerAppStateSnapshot
import com.nitroplay.video.player.PlayerRetentionCoordinator
import com.nitroplay.video.player.PlayerRetentionSnapshot
import com.nitroplay.video.support.Threading.mainThreadProperty
import com.nitroplay.video.support.Threading.runOnMainThread
import com.nitroplay.video.support.Threading.runOnMainThreadSync
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference
import java.util.concurrent.Future
import kotlin.math.max
import kotlin.math.min

@UnstableApi
@DoNotStrip
class HybridNitroPlayer() : HybridNitroPlayerSpec(), AutoCloseable {
  private data class SourceCommand(
    val generation: Int,
    val oldSource: HybridNitroPlayerSource?,
    val shouldAutoPlay: Boolean
  )

  override lateinit var source: HybridNitroPlayerSourceSpec
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
  internal var desiredCurrentTimeMs = 0L
  private var cachedLoop = false
  private var cachedMuted = false
  private var cachedRate = 1.0
  internal var pendingTrimRunnable: Runnable? = null
  internal var pendingStartupRecoveryRunnable: Runnable? = null
  internal var hasActiveSource = false
  internal var reusePlayerInstanceForSourceChanges = false
  internal var lastError: PlaybackError? = null
  internal val sourceGeneration get() = lifecycleGate.generation
  internal var startupRecoveryAttempts = 0
  internal var hasLoadedCurrentSource = false
  internal var firstFrame: onFirstFrameData? = null
  internal var pendingFirstFrameGeneration = -1
  internal var firstFrameContext: FirstFrameContext? = null
  // Inflight preview worker, cancelled on source generation changes to stop wasted fetch/decode.
  internal var firstFrameRequest: PreviewRequest<VideoPreviewResult>? = null
  internal var firstFrameTask: Future<*>? = null

  var wasAutoPaused = false
  private val startupRecoveryHandler = Handler(Looper.getMainLooper())
  private val startupRecoveryDelayMs = 250L
  private val maxStartupRecoveryAttempts = 1

  // Playback-start watchdog: STATE_READY (buffered) does not guarantee playback actually advances.
  // A decoder/surface stall can leave the player loaded yet frozen at position 0 with no error event,
  // so onPlayerError-driven startup recovery never fires. This watchdog re-prepares such a stall.
  private var pendingPlaybackWatchdogRunnable: Runnable? = null
  private var playbackWatchdogAttempts = 0
  private val playbackWatchdogDelayMs = 3000L
  private val maxPlaybackWatchdogAttempts = 5

  internal data class FirstFrameContext(
    val sourceUri: String,
    val headers: Map<String, String>?,
    val width: Double,
    val height: Double
  )

  // Buffer Config
  internal var bufferConfig: BufferConfig? = null
    get() = currentSourceConfig()?.buffer

  // Delegates
  internal val listenerBridge = NitroPlayerListenerBridge(this)
  internal val lifecycle = NitroPlayerLifecycle(this)
  internal var playbackListenersAttached = false

  override var status: NitroPlayerStatus = NitroPlayerStatus.IDLE
  internal var isCurrentlyBuffering: Boolean = false
  private val playbackStateEmissionGate = PlaybackStateEmissionGate()

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
        if (value) {
          if (!cachedMuted) {
            // Prefer the pre-duck volume: while audio focus is ducking, the live
            // player.volume is 0.5x, and caching that would make unmute restore
            // the ducked level instead of the user's real volume.
            userVolume = NitroPlayerManager.audioFocusManager.preDuckVolume(this)?.toDouble() ?: volume
          }
          currentPlayer.volume = 0f
        } else {
          currentPlayer.volume = userVolume.toFloat()
        }
        cachedMuted = value
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
    currentPlayerView?.get()?.player = playerInstance
  }

  internal fun currentSourceConfig(): NativeNitroPlayerConfig? {
    if (!::source.isInitialized) {
      return null
    }
    return (source as? HybridNitroPlayerSource)?.config
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
    this.source = source
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
    eventEmitter.onFirstFrameListenerAdded = {
      runOnMainThread {
        requestFirstFrameIfNeeded()
      }
    }
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

      NitroPlayerManager.touchFeedHotCandidate(this)
      val wasPlayIntentActive = wantsToPlay
      wantsToPlay = true
      if (!wasPlayIntentActive) {
        playbackWatchdogAttempts = 0
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

  override fun pause() {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      wantsToPlay = false
      cancelStartupRecovery()
      cancelPlaybackWatchdog()
      currentPlayerOrNull()?.pause()

      if (status != NitroPlayerStatus.ENDED && status != NitroPlayerStatus.IDLE) {
        status = NitroPlayerStatus.PAUSED
        emitPlaybackState()
      }

      NitroPlayerManager.touchFeedHotCandidate(this)

      if (!isAttachedToView()) {
        lifecycle.scheduleOffscreenTrim()
      }
    }
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
      val hybridSource = source as? HybridNitroPlayerSource ?: throw PlayerError.InvalidSource
      val activeCommand = command ?: return@async

      activeCommand.oldSource?.sourceLoader?.cancel()
      activeCommand.oldSource?.trimToCold()
      hybridSource.requestLeadingSegmentPrefetch()

      runOnMainThreadSync {
        if (!lifecycleGate.shouldDeliverCallback(activeCommand.generation)) {
          return@runOnMainThreadSync
        }

        this.source = source
        hasActiveSource = true
        desiredCurrentTimeMs = 0L
        status = NitroPlayerStatus.LOADING
        readyToDisplay = false
        isCurrentlyBuffering = false
        lastError = null

        if (!loadedWithSource) {
          lifecycle.initializePlayer()
        } else {
          lifecycle.configurePlayerInstanceForCurrentSource(attachPlaybackListeners = true)
          player.setMediaSource(hybridSource.createOrGetMediaSource())
        }

        player.prepare()
        if (activeCommand.shouldAutoPlay) {
          play()
        } else {
          emitPlaybackState()
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
          (source as? HybridNitroPlayerSource)?.warmMetadata()
        }
        PreloadLevel.BUFFERED -> {
          (source as? HybridNitroPlayerSource)?.requestLeadingSegmentPrefetch()
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
      lifecycleGate.markReleased()

      try {
        NitroPlayerManager.unregisterPlayer(this)
        listenerBridge.stopProgressUpdates()
        lifecycle.cancelPendingTrim()
        cancelStartupRecovery()
        cancelFirstFrameRequest()
        loadedWithSource = false
        hasActiveSource = false

        eventEmitter.clearAllListeners()

        currentPlayerOrNull()?.removeListener(listenerBridge.playerListener)
        currentPlayerOrNull()?.removeAnalyticsListener(listenerBridge.analyticsListener)
        playbackListenersAttached = false
        currentPlayerView?.get()?.player = null
        currentNitroPlayerView = null
        currentPlayerView = null

        status = NitroPlayerStatus.IDLE
        readyToDisplay = false
        isCurrentlyBuffering = false
        lastError = null
        allocator = null
        if (::source.isInitialized) {
          (source as? HybridNitroPlayerSource)?.trimToCold()
        }
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
      if (currentPlayer != null) {
        PlayerView.switchTargetView(currentPlayer, currentPlayerView?.get(), videoView.playerView)
      } else {
        currentPlayerView?.get()?.player = null
        videoView.playerView.player = null
      }
      videoView.syncPlayerViewLayout()
      currentNitroPlayerView = WeakReference(videoView)
      currentPlayerView = WeakReference(videoView.playerView)
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
      isFeedPoolEligible = false, isPinnedForFeedPool = false, isPinnedForResourcePressure = false
    )
    val playerBytes = memorySize.toDouble()
    val sourceBytes = if (hasActiveSource) source.memorySize.toDouble() else 0.0
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
      isFeedPoolEligible = retention.isFeedPoolEligible,
      isPinnedForFeedPool = PlayerRetentionCoordinator.isPinnedForFeedPool(retention),
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
    startupRecoveryAttempts = 0
    hasLoadedCurrentSource = false
    playbackStateEmissionGate.reset()
    firstFrame = null
    cancelFirstFrameRequest()
    firstFrameContext = null
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    playbackWatchdogAttempts = 0
    eventEmitter.resetStickyState()
  }

  private fun beginSourceCommand(allowAutoPlay: Boolean): SourceCommand? {
    return runOnMainThreadSync {
      if (isReleased) {
        return@runOnMainThreadSync null
      }

      val shouldAutoPlay = allowAutoPlay && wantsToPlay
      val oldSource = if (::source.isInitialized) {
        source as? HybridNitroPlayerSource
      } else {
        null
      }

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
    pendingStartupRecoveryRunnable?.let { startupRecoveryHandler.removeCallbacks(it) }
    pendingStartupRecoveryRunnable = null
  }

  internal fun cancelPlaybackWatchdog() {
    pendingPlaybackWatchdogRunnable?.let { startupRecoveryHandler.removeCallbacks(it) }
    pendingPlaybackWatchdogRunnable = null
  }

  internal val playbackWatchdogAttemptCount: Int
    get() = playbackWatchdogAttempts

  internal val hasPendingPlaybackWatchdog: Boolean
    get() = pendingPlaybackWatchdogRunnable != null

  // Arm the playback watchdog. Idempotent: repeated play() intents do not reset an in-flight timer.
  // After ~3s the runnable checks advancement since this window's baseline; on healthy (advanced /
  // looped / near end) it resets the attempt counter and RE-ARMS to keep watching the whole playback,
  // so a freeze AFTER initial progress is still caught. A genuine freeze recovers the loaded player;
  // only CONSECUTIVE freezes are counted, and that count is hard-bounded, so healthy playback never
  // exhausts the retries.
  internal fun schedulePlaybackStartWatchdog() {
    if (isReleased || !hasActiveSource || !wantsToPlay) return
    if (pendingPlaybackWatchdogRunnable != null) return
    if (playbackWatchdogAttempts >= maxPlaybackWatchdogAttempts) return

    val generation = sourceGeneration
    val startPositionMs = currentPlayerOrNull()?.currentPosition ?: return
    val runnable = Runnable {
      pendingPlaybackWatchdogRunnable = null
      if (isReleased || !hasActiveSource || !wantsToPlay || sourceGeneration != generation) {
        return@Runnable
      }
      val activePlayer = currentPlayerOrNull() ?: return@Runnable
      // Relative advancement: any position change since this window's baseline is healthy. abs() so a
      // loop wrap (position jumps back to 0) reads as advancing, not a freeze. Near-end is healthy too
      // so a clip about to loop/end is never re-prepared. On healthy, RE-ARM to keep watching the whole
      // playback (the re-arm rebaselines startPositionMs), so a freeze AFTER initial progress is still
      // caught instead of disarming after the first window.
      val durationMs = activePlayer.duration
      val isNearEnd = durationMs > 0L && activePlayer.currentPosition >= durationMs - 250L
      val advancedOrWrapped = kotlin.math.abs(activePlayer.currentPosition - startPositionMs) > 10L
      if (activePlayer.isPlaying && (advancedOrWrapped || isNearEnd)) {
        playbackWatchdogAttempts = 0
        schedulePlaybackStartWatchdog()
        return@Runnable
      }
      playbackWatchdogAttempts += 1
      if (playbackWatchdogAttempts > maxPlaybackWatchdogAttempts) {
        return@Runnable
      }
      // Loaded + wantsToPlay + no time progress is a stall even when ExoPlayer reports
      // STATE_BUFFERING. Keeping that state on the watch loop strands the feed on the first
      // frame with no error. The HLS proxy is intentionally left alone: it already serves
      // this loaded source, and restartForPlaybackRecovery() binds a socket (blocking I/O)
      // which on the main looper freezes runOnMainThreadSync readers past their 5s bound.
      // initializePlayer re-sets the same media source and recreates the player; prepare/play
      // restart decoding. Genuine route/proxy failures surface via onPlayerError instead.
      if (hasLoadedCurrentSource) {
        lifecycle.initializePlayer()
        player.prepare()
        player.play()
      }
      schedulePlaybackStartWatchdog()
    }
    pendingPlaybackWatchdogRunnable = runnable
    startupRecoveryHandler.postDelayed(runnable, playbackWatchdogDelayMs)
  }

  internal fun currentHybridSource(): HybridNitroPlayerSource? {
    if (!::source.isInitialized) {
      return null
    }
    return source as? HybridNitroPlayerSource
  }

  internal fun selectedVideoTrackFormat(): Format? {
    val currentTracks = currentPlayerOrNull()?.currentTracks ?: return null
    val selectedVideoTrackGroup = currentTracks.groups.find { group ->
      group.type == C.TRACK_TYPE_VIDEO && group.isSelected
    } ?: return null
    val selectedIndex = (0 until selectedVideoTrackGroup.length).firstOrNull { index ->
      selectedVideoTrackGroup.isTrackSelected(index)
    } ?: return null
    return selectedVideoTrackGroup.getTrackFormat(selectedIndex)
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

    startupRecoveryAttempts += 1
    val generation = sourceGeneration
    readyToDisplay = false
    isCurrentlyBuffering = false
    lastError = null
    status = NitroPlayerStatus.LOADING
    emitPlaybackState()

    cancelStartupRecovery()
    val runnable = Runnable {
      pendingStartupRecoveryRunnable = null
      if (isReleased || !hasActiveSource || !wantsToPlay || sourceGeneration != generation) {
        return@Runnable
      }

      HlsProxyRuntime.restartForPlaybackRecovery()
      currentHybridSource()?.refreshPlaybackRouteForStartupRecovery()
      lifecycle.initializePlayer()
      player.prepare()
      player.play()
    }
    pendingStartupRecoveryRunnable = runnable
    startupRecoveryHandler.postDelayed(runnable, startupRecoveryDelayMs)
    return true
  }

  internal fun failPlayback(message: String) {
    cancelStartupRecovery()
    cancelFirstFrameRequest()
    wantsToPlay = false
    isCurrentlyBuffering = false
    status = NitroPlayerStatus.ERROR
    readyToDisplay = false
    lastError = toPlaybackError(NitroPlayerErrorCode.UNKNOWN_UNKNOWN, message)
    lastError?.let { eventEmitter.onError(it) }
    listenerBridge.stopProgressUpdates()
    emitPlaybackState()
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
    return currentPlayerView?.get()?.isAttachedToWindow == true
  }

  fun notifyViewAttached() {
    lifecycle.cancelPendingTrim()
    requestFirstFrameIfNeeded()
    NitroPlayerManager.touchFeedHotCandidate(this)
  }

  fun notifyViewDetached() {
    NitroPlayerManager.touchFeedHotCandidate(this)
    if (isPlaying) {
      return
    }

    lifecycle.scheduleOffscreenTrim()
  }

  internal fun isFeedProfile(): Boolean {
    return lifecycle.isFeedProfile()
  }

  internal fun shouldStayHotInFeedPool(): Boolean {
    return lifecycle.shouldStayHotInFeedPool()
  }

  internal fun retentionSnapshot(): PlayerRetentionSnapshot {
    return lifecycle.retentionSnapshot()
  }

  internal fun appStateSnapshot(): PlayerAppStateSnapshot {
    return lifecycle.appStateSnapshot()
  }

  internal fun trimForFeedHotPool() {
    lifecycle.trimForFeedHotPool()
  }

  internal fun trimForResourcePressure() {
    lifecycle.trimForResourcePressure()
  }
}
