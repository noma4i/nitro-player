package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.upstream.DefaultAllocator
import androidx.media3.ui.PlayerView
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.hls.HlsProxyRuntime
import com.nitroplay.hls.VideoPreviewRuntime
import com.nitroplay.video.core.LibraryError
import com.nitroplay.video.core.PlayerError
import com.nitroplay.video.core.NitroPlayerManager
import com.nitroplay.video.core.utils.Threading.mainThreadProperty
import com.nitroplay.video.core.utils.Threading.runOnMainThread
import com.nitroplay.video.core.utils.Threading.runOnMainThreadSync
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference
import kotlin.math.max

@UnstableApi
@DoNotStrip
class HybridNitroPlayer() : HybridNitroPlayerSpec(), AutoCloseable {
  override lateinit var source: HybridNitroPlayerSourceSpec
  override var eventEmitter = HybridNitroPlayerEventEmitter()

  internal var isReleased = false
  internal var wantsToPlay = false
  internal var allocator: DefaultAllocator? = null
  private var context = NitroModules.applicationContext
    ?: run {
    throw LibraryError.ApplicationContextNotFound
  }

  var player: ExoPlayer = runOnMainThreadSync {
    return@runOnMainThreadSync ExoPlayer.Builder(context).build()
  }

  var loadedWithSource = false
  internal var currentPlayerView: WeakReference<PlayerView>? = null
  internal var readyToDisplay = false
  internal var desiredCurrentTimeMs = 0L
  private var cachedLoop = false
  private var cachedMuted = false
  private var cachedRate = 1.0
  internal var pendingTrimRunnable: Runnable? = null
  internal var pendingStartupRecoveryRunnable: Runnable? = null
  internal var hasActiveSource = false
  internal var lastError: PlaybackError? = null
  internal var sourceGeneration = 0
  internal var startupRecoveryAttempts = 0
  internal var hasLoadedCurrentSource = false
  internal var firstFrame: onFirstFrameData? = null
  internal var pendingFirstFrameGeneration = -1
  internal var firstFrameContext: FirstFrameContext? = null

  var wasAutoPaused = false
  private val startupRecoveryHandler = Handler(Looper.getMainLooper())
  private val startupRecoveryDelayMs = 250L
  private val maxStartupRecoveryAttempts = 1

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

  override var status: NitroPlayerStatus = NitroPlayerStatus.IDLE
  internal var isCurrentlyBuffering: Boolean = false

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
      if (isReleased || !loadedWithSource) {
        return@mainThreadProperty desiredCurrentTimeMs.toDouble() / 1000.0
      }

      player.currentPosition.toDouble() / 1000.0
    },
    set = { value ->
      val nextPositionMs = (value * 1000).toLong().coerceAtLeast(0L)
      desiredCurrentTimeMs = nextPositionMs
      emitPlaybackState()
      runOnMainThread {
        if (!isReleased && loadedWithSource) {
          player.seekTo(nextPositionMs)
        }
      }
    }
  )

  // volume defined by user
  var userVolume: Double = 1.0

  override var volume: Double by mainThreadProperty(
    get = { if (isReleased) userVolume else player.volume.toDouble() },
    set = { value ->
      userVolume = value
      if (!isReleased) player.volume = value.toFloat()
    }
  )

  override val duration: Double by mainThreadProperty(
    get = {
      if (isReleased) return@mainThreadProperty Double.NaN
      val duration = player.duration
      return@mainThreadProperty if (duration == C.TIME_UNSET) Double.NaN else duration.toDouble() / 1000.0
    }
  )

  override var loop: Boolean by mainThreadProperty(
    get = {
      if (isReleased || !loadedWithSource) {
        return@mainThreadProperty cachedLoop
      }

      player.repeatMode == Player.REPEAT_MODE_ONE
    },
    set = { value ->
      cachedLoop = value
      if (!isReleased) player.repeatMode = if (value) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }
  )

  override var muted: Boolean by mainThreadProperty(
    get = { cachedMuted },
    set = { value ->
      if (!isReleased) {
        if (value) {
          if (!cachedMuted) {
            userVolume = volume
          }
          player.volume = 0f
        } else {
          player.volume = userVolume.toFloat()
        }
        cachedMuted = value
        eventEmitter.onVolumeChange(onVolumeChangeData(
          volume = player.volume.toDouble(),
          muted = cachedMuted
        ))
      } else {
        cachedMuted = value
      }
    }
  )

  override var rate: Double by mainThreadProperty(
    get = {
      if (isReleased || !loadedWithSource) {
        return@mainThreadProperty cachedRate
      }

      player.playbackParameters.speed.toDouble()
    },
    set = { value ->
      cachedRate = value
      if (!isReleased) player.playbackParameters = player.playbackParameters.withSpeed(value.toFloat())
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
    get = { !isReleased && player.isPlaying }
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

  internal fun createExoPlayer(loadControl: DefaultLoadControl): ExoPlayer {
    val renderersFactory = DefaultRenderersFactory(context)
      .forceEnableMediaCodecAsynchronousQueueing()
      .setEnableDecoderFallback(true)

    val newPlayer = ExoPlayer.Builder(context)
      .setLoadControl(loadControl)
      .setLooper(Looper.getMainLooper())
      .setRenderersFactory(renderersFactory)
      .build()

    newPlayer.repeatMode = if (cachedLoop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    newPlayer.playbackParameters = PlaybackParameters(cachedRate.toFloat())
    newPlayer.volume = if (cachedMuted) 0f else userVolume.toFloat()

    return newPlayer
  }

  internal fun rebindCurrentPlayerView() {
    currentPlayerView?.get()?.player = player
  }

  internal fun currentSourceConfig(): NativeNitroPlayerConfig? {
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

    NitroPlayerManager.registerPlayer(this)
  }

  init {
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
      wantsToPlay = true
      player.play()
      status = when {
        player.isPlaying -> NitroPlayerStatus.PLAYING
        player.playbackState == Player.STATE_BUFFERING -> NitroPlayerStatus.BUFFERING
        else -> NitroPlayerStatus.LOADING
      }
      emitPlaybackState()
    }
  }

  override fun pause() {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      wantsToPlay = false
      cancelStartupRecovery()
      player.pause()

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
    wantsToPlay = false
    cancelStartupRecovery()
    return Promise.async {
      val hybridSource = source as? HybridNitroPlayerSource ?: throw PlayerError.InvalidSource
      val oldSource = if (::source.isInitialized) {
        this.source as? HybridNitroPlayerSource
      } else {
        null
      }

      oldSource?.sourceLoader?.cancel()
      oldSource?.trimToCold()

      runOnMainThreadSync {
        if (isReleased) return@runOnMainThreadSync
        this.source = source
        hasActiveSource = true
        beginSourceGeneration()
        desiredCurrentTimeMs = 0L
        status = NitroPlayerStatus.LOADING
        readyToDisplay = false
        isCurrentlyBuffering = false
        lastError = null

        if (!loadedWithSource) {
          lifecycle.initializePlayer()
        } else {
          player.setMediaSource(hybridSource.createOrGetMediaSource())
        }

        player.prepare()
        emitPlaybackState()
      }
    }
  }

  override fun clearSourceAsync(): Promise<Unit> {
    return Promise.async {
      val oldSource = if (::source.isInitialized) {
        this.source as? HybridNitroPlayerSource
      } else {
        null
      }

      runOnMainThreadSync {
        if (isReleased) return@runOnMainThreadSync
        lifecycle.clearCurrentSourceState(oldSource)
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
      isReleased = true

      try {
        NitroPlayerManager.unregisterPlayer(this)
        listenerBridge.stopProgressUpdates()
        lifecycle.cancelPendingTrim()
        cancelStartupRecovery()
        loadedWithSource = false
        hasActiveSource = false

        eventEmitter.clearAllListeners()

        player.removeListener(listenerBridge.playerListener)
        player.removeAnalyticsListener(listenerBridge.analyticsListener)
        currentPlayerView?.get()?.player = null
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
        player.release()
      }
    }
  }

  fun movePlayerToNitroPlayerView(videoView: NitroPlayerView) {
    NitroPlayerManager.addViewToPlayer(videoView, this)

    runOnMainThread {
      if (isReleased) return@runOnMainThread
      PlayerView.switchTargetView(player, currentPlayerView?.get(), videoView.playerView)
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
    if (!loadedWithSource) {
      return desiredCurrentTimeMs / 1000.0
    }

    return player.currentPosition / 1000.0
  }

  private fun calculateDurationSeconds(): Double {
    val duration = player.duration
    return if (duration == C.TIME_UNSET) Double.NaN else duration.toDouble() / 1000.0
  }

  private fun calculateBufferedPositionSeconds(): Double {
    if (!loadedWithSource) {
      return desiredCurrentTimeMs / 1000.0
    }

    return player.bufferedPosition / 1000.0
  }

  private fun calculateBufferDurationSeconds(): Double {
    return max(0.0, calculateBufferedPositionSeconds() - calculateCurrentTimeSeconds())
  }

  internal fun buildPlaybackState(): PlaybackState {
    if (isReleased) return PlaybackState(
      status = NitroPlayerStatus.IDLE, currentTime = 0.0, duration = 0.0,
      bufferDuration = 0.0, bufferedPosition = 0.0, rate = 0.0,
      isPlaying = false, isBuffering = false, isVisualReady = false, error = null,
      nativeTimestampMs = System.currentTimeMillis().toDouble()
    )
    return PlaybackState(
      status = status,
      currentTime = calculateCurrentTimeSeconds(),
      duration = calculateDurationSeconds(),
      bufferDuration = calculateBufferDurationSeconds(),
      bufferedPosition = calculateBufferedPositionSeconds(),
      rate = player.playbackParameters.speed.toDouble(),
      isPlaying = player.isPlaying,
      isBuffering = isCurrentlyBuffering,
      isVisualReady = readyToDisplay,
      error = lastError?.let { Variant_NullType_PlaybackError.Second(it) },
      nativeTimestampMs = System.currentTimeMillis().toDouble()
    )
  }

  private fun buildMemorySnapshot(): MemorySnapshot {
    if (isReleased) return MemorySnapshot(
      playerBytes = 0.0, sourceBytes = 0.0, totalBytes = 0.0,
      preloadLevel = lifecycle.resolvedPreloadLevel(), retentionState = lifecycle.currentRetentionState(),
      isAttachedToView = false, isPlaying = false
    )
    val playerBytes = memorySize.toDouble()
    val sourceBytes = if (hasActiveSource) source.memorySize.toDouble() else 0.0

    return MemorySnapshot(
      playerBytes = playerBytes,
      sourceBytes = sourceBytes,
      totalBytes = playerBytes + sourceBytes,
      preloadLevel = lifecycle.resolvedPreloadLevel(),
      retentionState = lifecycle.currentRetentionState(),
      isAttachedToView = isAttachedToView(),
      isPlaying = loadedWithSource && player.isPlaying
    )
  }

  internal fun emitPlaybackState() {
    eventEmitter.onPlaybackState(buildPlaybackState())
  }

  internal fun beginSourceGeneration() {
    sourceGeneration += 1
    startupRecoveryAttempts = 0
    hasLoadedCurrentSource = false
    firstFrame = null
    pendingFirstFrameGeneration = -1
    firstFrameContext = null
    cancelStartupRecovery()
    eventEmitter.resetStickyState()
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

  internal fun currentHybridSource(): HybridNitroPlayerSource? {
    return source as? HybridNitroPlayerSource
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
    wantsToPlay = false
    isCurrentlyBuffering = false
    status = NitroPlayerStatus.ERROR
    readyToDisplay = false
    pendingFirstFrameGeneration = -1
    lastError = toPlaybackError(NitroPlayerErrorCode.UNKNOWN_UNKNOWN, message)
    lastError?.let { eventEmitter.onError(it) }
    listenerBridge.stopProgressUpdates()
    emitPlaybackState()
  }

  internal fun cacheFirstFrameContext(sourceUri: String, width: Double, height: Double) {
    firstFrameContext = FirstFrameContext(
      sourceUri = sourceUri,
      headers = currentSourceConfig()?.headers,
      width = width,
      height = height
    )
  }

  internal fun emitFirstFrame(uri: String, width: Double, height: Double, sourceUri: String, fromCache: Boolean) {
    val data = onFirstFrameData(
      uri = uri,
      width = width,
      height = height,
      sourceUri = sourceUri,
      fromCache = fromCache
    )
    firstFrame = data
    eventEmitter.onFirstFrame(data)
  }

  internal fun requestFirstFrameIfNeeded() {
    if (isReleased || !hasActiveSource || !readyToDisplay || firstFrame != null) {
      return
    }
    val autoThumbnailEnabled = currentAutoThumbnailEnabled()

    when (currentPreviewMode()) {
      NitroSourcePreviewMode.MANUAL -> {
        if (!autoThumbnailEnabled) {
          return
        }
      }
      NitroSourcePreviewMode.LISTENER -> {
        if (!autoThumbnailEnabled && !eventEmitter.hasOnFirstFrameListeners()) {
          return
        }
      }
      NitroSourcePreviewMode.ALWAYS -> Unit
    }

    val context = firstFrameContext ?: return
    val generation = sourceGeneration
    if (pendingFirstFrameGeneration == generation) {
      return
    }
    pendingFirstFrameGeneration = generation
    val previewConfig = currentSourceConfig()?.preview

    Thread {
      val preview = VideoPreviewRuntime.getFirstFrame(
        context.sourceUri,
        context.headers,
        previewConfig
      )

      Handler(Looper.getMainLooper()).post {
        if (
          isReleased ||
          sourceGeneration != generation ||
          !hasActiveSource ||
          !readyToDisplay ||
          firstFrame != null
        ) {
          return@post
        }

        if (pendingFirstFrameGeneration == generation) {
          pendingFirstFrameGeneration = -1
        }

        preview?.let {
          emitFirstFrame(
            uri = it.uri,
            width = context.width,
            height = context.height,
            sourceUri = context.sourceUri,
            fromCache = it.fromCache
          )
        }
      }
    }.start()
  }

  private fun currentPreviewMode(): NitroSourcePreviewMode {
    return currentSourceConfig()?.preview?.mode ?: NitroSourcePreviewMode.LISTENER
  }

  private fun currentAutoThumbnailEnabled(): Boolean {
    return currentSourceConfig()?.preview?.autoThumbnail ?: true
  }

  internal fun resolvePlayPauseStatus(): NitroPlayerStatus {
    if (player.isPlaying) return NitroPlayerStatus.PLAYING
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

  internal fun trimForFeedHotPool() {
    lifecycle.trimForFeedHotPool()
  }
}
