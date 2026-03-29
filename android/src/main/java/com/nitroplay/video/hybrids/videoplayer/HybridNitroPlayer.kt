package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.upstream.DefaultAllocator
import androidx.media3.ui.PlayerView
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.video.core.LibraryError
import com.nitroplay.video.core.PlayerError
import com.nitroplay.video.core.NitroPlayerManager
import com.nitroplay.video.core.utils.Threading.mainThreadProperty
import com.nitroplay.video.core.utils.Threading.runOnMainThread
import com.nitroplay.video.core.utils.Threading.runOnMainThreadSync
import com.nitroplay.video.core.utils.NitroPlayerOrientationUtils
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference
import kotlin.math.max

@UnstableApi
@DoNotStrip
class HybridNitroPlayer() : HybridNitroPlayerSpec(), AutoCloseable {
  override lateinit var source: HybridNitroPlayerSourceSpec
  override var eventEmitter = HybridNitroPlayerEventEmitter()

  private var isReleased = false
  private var allocator: DefaultAllocator? = null
  private var context = NitroModules.applicationContext
    ?: run {
    throw LibraryError.ApplicationContextNotFound
  }

  var player: ExoPlayer = runOnMainThreadSync {
    // Build Temporary player that will be replaced when source is loaded
    return@runOnMainThreadSync ExoPlayer.Builder(context).build()
  }

  var loadedWithSource = false
  private var currentPlayerView: WeakReference<PlayerView>? = null
  private var readyToDisplay = false
  private var desiredCurrentTimeMs = 0L
  private var cachedLoop = false
  private var cachedMuted = false
  private var cachedRate = 1.0
  private var pendingTrimRunnable: Runnable? = null
  private var hasActiveSource = false

  var wasAutoPaused = false

  // Buffer Config
  private var bufferConfig: BufferConfig? = null
    get() = source.config.bufferConfig

  // Time updates
  private val progressHandler = Handler(Looper.getMainLooper())
  private var progressRunnable: Runnable? = null

  private companion object {
    const val PROGRESS_UPDATE_INTERVAL_MS = 250L
    private const val TAG = "HybridNitroPlayer"
    private const val DEFAULT_MIN_BUFFER_DURATION_MS = 5000
    private const val DEFAULT_MAX_BUFFER_DURATION_MS = 10000
    private const val DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS = 1000
    private const val DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS = 2000
    private const val DEFAULT_BACK_BUFFER_DURATION_MS = 0
  }

  override var status: NitroPlayerStatus = NitroPlayerStatus.IDLE
  private var isCurrentlyBuffering: Boolean = false

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

  override val isReadyToDisplay: Boolean by mainThreadProperty(
    get = { readyToDisplay }
  )

  private fun createExoPlayer(loadControl: DefaultLoadControl): ExoPlayer {
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

  private fun rebindCurrentPlayerView() {
    currentPlayerView?.get()?.player = player
  }

  private fun replacePlayerInstance(
    loadControl: DefaultLoadControl,
    attachPlaybackListeners: Boolean
  ) {
    stopProgressUpdates()
    player.removeListener(playerListener)
    player.removeAnalyticsListener(analyticsListener)
    player.release()
    player = createExoPlayer(loadControl)
    rebindCurrentPlayerView()
    if (attachPlaybackListeners) {
      player.addListener(playerListener)
      player.addAnalyticsListener(analyticsListener)
    }
  }

  private fun clearCurrentSourceState(sourceToTrim: HybridNitroPlayerSource?) {
    cancelPendingTrim()
    stopProgressUpdates()
    sourceToTrim?.sourceLoader?.cancel()
    sourceToTrim?.trimToCold()
    replacePlayerInstance(DefaultLoadControl.Builder().build(), attachPlaybackListeners = false)
    allocator = null
    loadedWithSource = false
    hasActiveSource = false
    desiredCurrentTimeMs = 0L
    readyToDisplay = false
    isCurrentlyBuffering = false
    status = NitroPlayerStatus.IDLE
    emitPlaybackState()
  }

  private fun initializePlayer() {
    if (isReleased || !hasActiveSource) return
    cancelPendingTrim()

    if (NitroModules.applicationContext == null) {
      throw LibraryError.ApplicationContextNotFound
    }

    val hybridSource = source as? HybridNitroPlayerSource ?: throw PlayerError.InvalidSource

    // Initialize the allocator
    allocator = DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)

    // Create a LoadControl with the allocator
    val currentAllocator = allocator ?: return
    val loadControl = DefaultLoadControl.Builder()
      .setAllocator(currentAllocator)
      .setBufferDurationsMs(
        bufferConfig?.minBufferMs?.toInt() ?: DEFAULT_MIN_BUFFER_DURATION_MS, // minBufferMs
        bufferConfig?.maxBufferMs?.toInt() ?: DEFAULT_MAX_BUFFER_DURATION_MS, // maxBufferMs
        bufferConfig?.bufferForPlaybackMs?.toInt()
          ?: DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS, // bufferForPlaybackMs
        bufferConfig?.bufferForPlaybackAfterRebufferMs?.toInt()
          ?: DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS // bufferForPlaybackAfterRebufferMs
      )
      .setBackBuffer(
        bufferConfig?.backBufferDurationMs?.toInt()
          ?: DEFAULT_BACK_BUFFER_DURATION_MS, // backBufferDurationMs,
        false // retainBackBufferFromKeyframe
      )
      .build()

    val mediaSource = hybridSource.createOrGetMediaSource()

    // Build the player with the LoadControl
    replacePlayerInstance(loadControl, attachPlaybackListeners = true)

    loadedWithSource = true
    player.setMediaSource(mediaSource)

    if (desiredCurrentTimeMs > 0L) {
      player.seekTo(desiredCurrentTimeMs)
    }

    // Emit onLoadStart
    val sourceType = if (hybridSource.uri.startsWith("http")) SourceType.NETWORK else SourceType.LOCAL
    eventEmitter.onLoadStart(onLoadStartData(sourceType = sourceType, source = hybridSource))
    status = NitroPlayerStatus.LOADING
    readyToDisplay = false
    emitPlaybackState()
    startProgressUpdates()
  }

  override fun initialize(): Promise<Unit> {
    return Promise.async {
      runOnMainThreadSync {
        if (isReleased || loadedWithSource || !hasActiveSource) return@runOnMainThreadSync
        initializePlayer()
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

    runOnMainThread {
      if (isReleased) return@runOnMainThread
      if (source.config.initializeOnCreation == true) {
        when (resolvedPreloadLevel()) {
          PreloadLevel.BUFFERED -> {
            initializePlayer()
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

  override fun play() {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      cancelPendingTrim()
      if (!hasActiveSource) {
        status = NitroPlayerStatus.IDLE
        readyToDisplay = false
        isCurrentlyBuffering = false
        emitPlaybackState()
        return@runOnMainThread
      }

      if (!loadedWithSource) {
        initializePlayer()
        player.prepare()
      }

      NitroPlayerManager.touchFeedHotCandidate(this)
      player.play()
      status = NitroPlayerStatus.PLAYING
      emitPlaybackState()
    }
  }

  override fun pause() {
    runOnMainThread {
      if (isReleased) return@runOnMainThread
      player.pause()

      if (status != NitroPlayerStatus.ENDED && status != NitroPlayerStatus.IDLE) {
        status = NitroPlayerStatus.PAUSED
        emitPlaybackState()
      }

      NitroPlayerManager.touchFeedHotCandidate(this)

      if (!isAttachedToView()) {
        scheduleOffscreenTrim()
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

  override fun replaceSourceAsync(source: Variant_NullType_HybridNitroPlayerSourceSpec?): Promise<Unit> {
    return Promise.async {
      val source = source?.asSecondOrNull()
      val oldSource = if (::source.isInitialized) {
        this.source as? HybridNitroPlayerSource
      } else {
        null
      }

      if (source == null) {
        runOnMainThreadSync {
          if (isReleased) return@runOnMainThreadSync
          clearCurrentSourceState(oldSource)
        }
        return@async
      }

      val hybridSource = source as? HybridNitroPlayerSource ?: throw PlayerError.InvalidSource

      oldSource?.sourceLoader?.cancel()
      oldSource?.trimToCold()

      runOnMainThreadSync {
        if (isReleased) return@runOnMainThreadSync
        // Update source
        this.source = source
        hasActiveSource = true
        desiredCurrentTimeMs = 0L
        status = NitroPlayerStatus.LOADING
        readyToDisplay = false
        isCurrentlyBuffering = false

        if (!loadedWithSource) {
          initializePlayer()
        } else {
          player.setMediaSource(hybridSource.createOrGetMediaSource())
        }

        // Prepare player
        player.prepare()
        emitPlaybackState()
      }
    }
  }

  override fun preload(): Promise<Unit> {
    return Promise.async {
      val level = runOnMainThreadSync {
        if (isReleased) return@runOnMainThreadSync PreloadLevel.NONE
        if (!hasActiveSource) return@runOnMainThreadSync PreloadLevel.NONE
        cancelPendingTrim()
        resolvedPreloadLevel()
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
              initializePlayer()
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
        stopProgressUpdates()
        cancelPendingTrim()
        loadedWithSource = false
        hasActiveSource = false

        eventEmitter.clearAllListeners()

        player.removeListener(playerListener)
        player.removeAnalyticsListener(analyticsListener)
        currentPlayerView?.get()?.player = null
        currentPlayerView = null

        status = NitroPlayerStatus.IDLE
        readyToDisplay = false
        isCurrentlyBuffering = false
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

  private fun buildPlaybackState(): PlaybackState {
    if (isReleased) return PlaybackState(
      status = NitroPlayerStatus.IDLE, currentTime = 0.0, duration = 0.0,
      bufferDuration = 0.0, bufferedPosition = 0.0, rate = 0.0,
      isPlaying = false, isBuffering = false, isReadyToDisplay = false,
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
      isReadyToDisplay = readyToDisplay,
      nativeTimestampMs = System.currentTimeMillis().toDouble()
    )
  }

  private fun buildMemorySnapshot(): MemorySnapshot {
    if (isReleased) return MemorySnapshot(
      playerBytes = 0.0, sourceBytes = 0.0, totalBytes = 0.0,
      preloadLevel = resolvedPreloadLevel(), retentionState = currentRetentionState(),
      isAttachedToView = false, isPlaying = false
    )
    val playerBytes = memorySize.toDouble()
    val sourceBytes = if (hasActiveSource) source.memorySize.toDouble() else 0.0

    return MemorySnapshot(
      playerBytes = playerBytes,
      sourceBytes = sourceBytes,
      totalBytes = playerBytes + sourceBytes,
      preloadLevel = resolvedPreloadLevel(),
      retentionState = currentRetentionState(),
      isAttachedToView = isAttachedToView(),
      isPlaying = loadedWithSource && player.isPlaying
    )
  }

  private fun emitPlaybackState() {
    eventEmitter.onPlaybackState(buildPlaybackState())
  }

  private fun enterBuffering() {
    isCurrentlyBuffering = true
    if (status != NitroPlayerStatus.PLAYING && status != NitroPlayerStatus.PAUSED) {
      status = NitroPlayerStatus.BUFFERING
    }
  }

  private fun resolvedPreloadLevel(): PreloadLevel {
    if (!hasActiveSource) {
      return PreloadLevel.NONE
    }
    return source.config.memoryConfig?.preloadLevel ?: PreloadLevel.BUFFERED
  }

  private fun resolvedOffscreenRetention(): OffscreenRetention {
    if (!hasActiveSource) {
      return OffscreenRetention.HOT
    }
    return source.config.memoryConfig?.offscreenRetention ?: OffscreenRetention.HOT
  }

  private fun resolvedPauseTrimDelayMs(): Long? {
    val delay = source.config.memoryConfig?.pauseTrimDelayMs ?: return 10000L
    if (delay.isInfinite()) {
      return null
    }

    return delay.toLong().coerceAtLeast(0L)
  }

  private fun currentRetentionState(): MemoryRetentionState {
    if (!hasActiveSource) {
      return MemoryRetentionState.COLD
    }
    return (source as? HybridNitroPlayerSource)?.retentionState
      ?: MemoryRetentionState.COLD
  }

  private fun isAttachedToView(): Boolean {
    return currentPlayerView?.get()?.isAttachedToWindow == true
  }

  fun notifyViewAttached() {
    cancelPendingTrim()
    NitroPlayerManager.touchFeedHotCandidate(this)
  }

  fun notifyViewDetached() {
    NitroPlayerManager.touchFeedHotCandidate(this)
    if (isPlaying) {
      return
    }

    scheduleOffscreenTrim()
  }

  internal fun isFeedProfile(): Boolean {
    if (!hasActiveSource) {
      return false
    }
    return source.config.memoryConfig?.profile == MemoryProfile.FEED
  }

  internal fun shouldStayHotInFeedPool(): Boolean {
    if (isReleased) {
      return false
    }

    if (isPlaying) {
      return true
    }

    val currentView = currentPlayerView?.get()
    return currentView?.isAttachedToWindow == true
  }

  internal fun trimForFeedHotPool() {
    runOnMainThread {
      if (
        isReleased ||
        !isFeedProfile() ||
        shouldStayHotInFeedPool() ||
        currentRetentionState() != MemoryRetentionState.HOT
      ) {
        return@runOnMainThread
      }

      trimToMetadataRetention()
    }
  }

  private fun scheduleOffscreenTrim() {
    cancelPendingTrim()

    if (resolvedOffscreenRetention() == OffscreenRetention.HOT) {
      return
    }

    val delayMs = resolvedPauseTrimDelayMs() ?: return
    val runnable = Runnable {
      trimToConfiguredRetention()
    }
    pendingTrimRunnable = runnable
    progressHandler.postDelayed(runnable, delayMs)
  }

  private fun cancelPendingTrim() {
    pendingTrimRunnable?.let { progressHandler.removeCallbacks(it) }
    pendingTrimRunnable = null
  }

  private fun trimToConfiguredRetention() {
    pendingTrimRunnable = null

    if (isReleased || isPlaying || isAttachedToView()) {
      return
    }

    when (resolvedOffscreenRetention()) {
      OffscreenRetention.HOT -> Unit
      OffscreenRetention.METADATA -> trimToMetadataRetention()
      OffscreenRetention.COLD -> trimToColdRetention()
    }
  }

  private fun trimToMetadataRetention() {
    if (isReleased || !hasActiveSource) return
    val hybridSource = source as? HybridNitroPlayerSource ?: return

    if (loadedWithSource) {
      desiredCurrentTimeMs = player.currentPosition
      replacePlayerInstance(DefaultLoadControl.Builder().build(), attachPlaybackListeners = false)
      allocator = null
      loadedWithSource = false
    }

    hybridSource.trimToMetadata()
    status = NitroPlayerStatus.IDLE
    readyToDisplay = false
    emitPlaybackState()
  }

  private fun trimToColdRetention() {
    trimToMetadataRetention()
    (source as? HybridNitroPlayerSource)?.trimToCold()
  }

  private fun startProgressUpdates() {
    stopProgressUpdates() // Ensure no multiple runnables
    progressRunnable = object : Runnable {
      override fun run() {
        if (player.playbackState != Player.STATE_IDLE && player.playbackState != Player.STATE_ENDED) {
          emitPlaybackState()
          progressHandler.postDelayed(this, PROGRESS_UPDATE_INTERVAL_MS)
        }
      }
    }
    progressHandler.post(progressRunnable ?: return)
  }

  private fun stopProgressUpdates() {
    progressRunnable?.let { progressHandler.removeCallbacks(it) }
    progressRunnable = null
  }

  private val analyticsListener = object: AnalyticsListener {
    override fun onBandwidthEstimate(
      eventTime: AnalyticsListener.EventTime,
      totalLoadTimeMs: Int,
      totalBytesLoaded: Long,
      bitrateEstimate: Long
    ) {
      if (isReleased) return
      val videoFormat = player.videoFormat
      eventEmitter.onBandwidthUpdate(
        BandwidthData(
          bitrate = bitrateEstimate.toDouble(),
          width = if (videoFormat != null) videoFormat.width.toDouble() else null,
          height = if (videoFormat != null) videoFormat.height.toDouble() else null
        )
      )
    }
  }

  private val playerListener = object : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
      if (isReleased) return
      when (playbackState) {
        Player.STATE_IDLE -> {
          isCurrentlyBuffering = false
          status = NitroPlayerStatus.IDLE
          readyToDisplay = false
        }
        Player.STATE_BUFFERING -> {
          enterBuffering()
        }
        Player.STATE_READY -> {
          isCurrentlyBuffering = false
          status = if (player.isPlaying) {
            NitroPlayerStatus.PLAYING
          } else {
            NitroPlayerStatus.PAUSED
          }
          readyToDisplay = true

          val generalVideoFormat = player.videoFormat
          val currentTracks = player.currentTracks

          val selectedVideoTrackGroup = currentTracks.groups.find { group -> group.type == C.TRACK_TYPE_VIDEO && group.isSelected }
          val selectedVideoTrackFormat = if (selectedVideoTrackGroup != null && selectedVideoTrackGroup.length > 0) {
            selectedVideoTrackGroup.getTrackFormat(0)
          } else {
            null
          }

          val width = selectedVideoTrackFormat?.width ?: generalVideoFormat?.width ?: 0
          val height = selectedVideoTrackFormat?.height ?: generalVideoFormat?.height ?: 0
          val rotationDegrees = selectedVideoTrackFormat?.rotationDegrees ?: generalVideoFormat?.rotationDegrees

          eventEmitter.onLoad(
            onLoadData(
              currentTime = player.currentPosition / 1000.0,
              duration = if (player.duration == C.TIME_UNSET) Double.NaN else player.duration / 1000.0,
              width = width.toDouble(),
              height = height.toDouble(),
              orientation = NitroPlayerOrientationUtils.fromWHR(width, height, rotationDegrees)
            )
          )
          // Progress updates are started in onIsPlayingChanged(true)
        }
        Player.STATE_ENDED -> {
          isCurrentlyBuffering = false
          status = NitroPlayerStatus.ENDED
          stopProgressUpdates()
        }
      }

      emitPlaybackState()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      super.onIsPlayingChanged(isPlaying)
      if (isPlaying) isCurrentlyBuffering = false
      if (player.playbackState == Player.STATE_READY) {
        status = if (isPlaying) {
          NitroPlayerStatus.PLAYING
        } else {
          NitroPlayerStatus.PAUSED
        }
      }
      if (isPlaying) {
        NitroPlayerManager.setLastPlayedPlayer(this@HybridNitroPlayer)
        startProgressUpdates()
      } else {
        if (player.playbackState == Player.STATE_ENDED || player.playbackState == Player.STATE_IDLE) {
          stopProgressUpdates()
        }
      }
      emitPlaybackState()
    }

    override fun onPlayerError(error: PlaybackException) {
      isCurrentlyBuffering = false
      status = NitroPlayerStatus.ERROR
      readyToDisplay = false
      stopProgressUpdates()
      emitPlaybackState()
    }

    override fun onPositionDiscontinuity(
      oldPosition: Player.PositionInfo,
      newPosition: Player.PositionInfo,
      reason: Int
    ) {
      if (
        (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT) &&
        status == NitroPlayerStatus.ENDED
      ) {
        status = NitroPlayerStatus.PAUSED
      }
      emitPlaybackState()
    }

    override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
      emitPlaybackState()
    }

    override fun onVolumeChanged(volume: Float) {
      // Sync userVolume only for real user/system changes,
      // not transient duck/unduck volume adjustments
      if (!muted && !NitroPlayerManager.audioFocusManager.isDucking()) {
        this@HybridNitroPlayer.volume = volume.toDouble()
      }

      NitroPlayerManager.audioFocusManager.requestAudioFocusUpdate()
      eventEmitter.onVolumeChange(onVolumeChangeData(
        volume = volume.toDouble(),
        muted = muted
      ))
    }

  }
}
