package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Metadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.upstream.DefaultAllocator
import androidx.media3.extractor.metadata.emsg.EventMessage
import androidx.media3.extractor.metadata.id3.Id3Frame
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import androidx.media3.ui.PlayerView
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.twg.video.core.LibraryError
import com.twg.video.core.PlayerError
import com.twg.video.core.VideoManager
import com.twg.video.core.player.OnAudioFocusChangedListener
import com.twg.video.core.utils.TextTrackUtils
import com.twg.video.core.utils.Threading.mainThreadProperty
import com.twg.video.core.utils.Threading.runOnMainThread
import com.twg.video.core.utils.Threading.runOnMainThreadSync
import com.twg.video.core.utils.VideoOrientationUtils
import com.twg.video.view.VideoView
import java.lang.ref.WeakReference
import kotlin.math.max

@UnstableApi
@DoNotStrip
class HybridVideoPlayer() : HybridVideoPlayerSpec(), AutoCloseable {
  override lateinit var source: HybridVideoPlayerSourceSpec
  override var eventEmitter = HybridVideoPlayerEventEmitter()
    set(value) {
      if (field != value) {
        audioFocusChangedListener.setEventEmitter(value)
      }
      field = value
    }

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

  var wasAutoPaused = false

  // Buffer Config
  private var bufferConfig: BufferConfig? = null
    get() = source.config.bufferConfig

  // Time updates
  private val progressHandler = Handler(Looper.getMainLooper())
  private var progressRunnable: Runnable? = null

  // Listeners
  private val audioFocusChangedListener = OnAudioFocusChangedListener()

  // Text track selection state
  private var selectedExternalTrackIndex: Int? = null

  private companion object {
    const val PROGRESS_UPDATE_INTERVAL_MS = 250L
    private const val TAG = "HybridVideoPlayer"
    private const val DEFAULT_MIN_BUFFER_DURATION_MS = 5000
    private const val DEFAULT_MAX_BUFFER_DURATION_MS = 10000
    private const val DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS = 1000
    private const val DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS = 2000
    private const val DEFAULT_BACK_BUFFER_DURATION_MS = 0
  }

  override var status: VideoPlayerStatus = VideoPlayerStatus.IDLE

  override val playbackState: PlaybackState
    get() = runOnMainThreadSync {
      buildPlaybackState()
    }

  override val memorySnapshot: MemorySnapshot
    get() = runOnMainThreadSync {
      buildMemorySnapshot()
    }

  override var showNotificationControls: Boolean = false
    set(value) {
      field = value
    }

  // Player Properties
  override var currentTime: Double by mainThreadProperty(
    get = {
      if (!loadedWithSource) {
        return@mainThreadProperty desiredCurrentTimeMs.toDouble() / 1000.0
      }

      player.currentPosition.toDouble() / 1000.0
    },
    set = { value ->
      val nextPositionMs = (value * 1000).toLong().coerceAtLeast(0L)
      desiredCurrentTimeMs = nextPositionMs
      runOnMainThread {
        if (loadedWithSource) {
          player.seekTo(nextPositionMs)
        }
      }
    }
  )

  // volume defined by user
  var userVolume: Double = 1.0

  override var volume: Double by mainThreadProperty(
    get = { player.volume.toDouble() },
    set = { value ->
      userVolume = value
      player.volume = value.toFloat()
    }
  )

  override val duration: Double by mainThreadProperty(
    get = {
      val duration = player.duration
      return@mainThreadProperty if (duration == C.TIME_UNSET) Double.NaN else duration.toDouble() / 1000.0
    }
  )

  override var loop: Boolean by mainThreadProperty(
    get = {
      if (!loadedWithSource) {
        return@mainThreadProperty cachedLoop
      }

      player.repeatMode == Player.REPEAT_MODE_ONE
    },
    set = { value ->
      cachedLoop = value
      player.repeatMode = if (value) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }
  )

  override var muted: Boolean by mainThreadProperty(
    get = {
      if (!loadedWithSource) {
        return@mainThreadProperty cachedMuted
      }

      val playerVolume = player.volume.toDouble()
      return@mainThreadProperty playerVolume == 0.0
    },
    set = { value ->
      cachedMuted = value
      if (value) {
        userVolume = volume
        player.volume = 0f
      } else {
        player.volume = userVolume.toFloat()
      }
      eventEmitter.onVolumeChange(onVolumeChangeData(
        volume = player.volume.toDouble(),
        muted = muted
      ))
    }
  )

  override var rate: Double by mainThreadProperty(
    get = {
      if (!loadedWithSource) {
        return@mainThreadProperty cachedRate
      }

      player.playbackParameters.speed.toDouble()
    },
    set = { value ->
      cachedRate = value
      player.playbackParameters = player.playbackParameters.withSpeed(value.toFloat())
    }
  )

  override var mixAudioMode: MixAudioMode = MixAudioMode.AUTO
    set(value) {
      VideoManager.audioFocusManager.requestAudioFocusUpdate()
      field = value
    }

  // iOS only property
  override var ignoreSilentSwitchMode: IgnoreSilentSwitchMode = IgnoreSilentSwitchMode.AUTO

  override var playInBackground: Boolean = false
    set(value) {
      field = value
    }

  override var playWhenInactive: Boolean = false

  override var isPlaying: Boolean by mainThreadProperty(
    get = { player.isPlaying == true }
  )

  override val bufferDuration: Double by mainThreadProperty(
    get = { calculateBufferDurationSeconds() }
  )

  override val bufferedPosition: Double by mainThreadProperty(
    get = { calculateBufferedPositionSeconds() }
  )

  override val isBuffering: Boolean by mainThreadProperty(
    get = { status == VideoPlayerStatus.BUFFERING }
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

  private fun initializePlayer() {
    cancelPendingTrim()

    if (NitroModules.applicationContext == null) {
      throw LibraryError.ApplicationContextNotFound
    }

    val hybridSource = source as? HybridVideoPlayerSource ?: throw PlayerError.InvalidSource

    // Initialize the allocator
    allocator = DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)

    // Create a LoadControl with the allocator
    val loadControl = DefaultLoadControl.Builder()
      .setAllocator(allocator!!)
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
    player.release()
    player = createExoPlayer(loadControl)

    loadedWithSource = true

    player.addListener(playerListener)
    player.addAnalyticsListener(analyticsListener)
    player.setMediaSource(mediaSource)

    if (desiredCurrentTimeMs > 0L) {
      player.seekTo(desiredCurrentTimeMs)
    }

    // Emit onLoadStart
    val sourceType = if (hybridSource.uri.startsWith("http")) SourceType.NETWORK else SourceType.LOCAL
    eventEmitter.onLoadStart(onLoadStartData(sourceType = sourceType, source = hybridSource))
    status = VideoPlayerStatus.LOADING
    readyToDisplay = false
    emitPlaybackState()
    startProgressUpdates()
  }

  override fun initialize(): Promise<Unit> {
    return Promise.async {
      return@async runOnMainThreadSync {
        initializePlayer()
        player.prepare()
      }
    }
  }

  constructor(source: HybridVideoPlayerSource) : this() {
    this.source = source
    this.cachedLoop = false
    this.cachedMuted = false
    this.cachedRate = 1.0

    runOnMainThread {
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

    VideoManager.registerPlayer(this)
  }

  override fun play() {
    runOnMainThread {
      cancelPendingTrim()

      if (!loadedWithSource) {
        initializePlayer()
        player.prepare()
      }

      VideoManager.touchFeedHotCandidate(this)
      player.play()
    }
  }

  override fun pause() {
    runOnMainThread {
      player.pause()
      VideoManager.touchFeedHotCandidate(this)

      if (!isAttachedToView()) {
        scheduleOffscreenTrim()
      }
    }
  }

  override fun seekBy(time: Double) {
    currentTime = (currentTime + time).coerceIn(0.0, duration)
  }

  override fun seekTo(time: Double) {
    currentTime = time.coerceIn(0.0, duration)
  }

  override fun replaceSourceAsync(source: Variant_NullType_HybridVideoPlayerSourceSpec?): Promise<Unit> {
    return Promise.async {
      val source = source?.asSecondOrNull()

      if (source == null) {
        release()
        return@async
      }

      val hybridSource = source as? HybridVideoPlayerSource ?: throw PlayerError.InvalidSource

      val oldSource = this.source as? HybridVideoPlayerSource
      oldSource?.sourceLoader?.cancel()

      runOnMainThreadSync {
        // Update source
        this.source = source
        desiredCurrentTimeMs = 0L
        status = VideoPlayerStatus.LOADING
        readyToDisplay = false

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
      runOnMainThreadSync {
        cancelPendingTrim()

        when (resolvedPreloadLevel()) {
          PreloadLevel.NONE -> return@runOnMainThreadSync
          PreloadLevel.METADATA -> {
            Promise.async {
              (source as? HybridVideoPlayerSource)?.warmMetadata()
            }
            return@runOnMainThreadSync
          }
          PreloadLevel.BUFFERED -> {
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
        VideoManager.unregisterPlayer(this)
        stopProgressUpdates()
        cancelPendingTrim()
        loadedWithSource = false

        eventEmitter.clearAllListeners()

        player.removeListener(playerListener)
        player.removeAnalyticsListener(analyticsListener)

        audioFocusChangedListener.removeEventEmitter()

        status = VideoPlayerStatus.IDLE
        readyToDisplay = false
        allocator = null
        (source as? HybridVideoPlayerSource)?.trimToCold()
      } finally {
        player.release()
      }
    }
  }

  fun movePlayerToVideoView(videoView: VideoView) {
    VideoManager.addViewToPlayer(videoView, this)

    runOnMainThreadSync {
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
    return PlaybackState(
      status = status,
      currentTime = calculateCurrentTimeSeconds(),
      duration = calculateDurationSeconds(),
      bufferDuration = calculateBufferDurationSeconds(),
      bufferedPosition = calculateBufferedPositionSeconds(),
      rate = player.playbackParameters.speed.toDouble(),
      isPlaying = player.isPlaying,
      isBuffering = status == VideoPlayerStatus.BUFFERING,
      isReadyToDisplay = readyToDisplay,
      nativeTimestampMs = System.currentTimeMillis().toDouble()
    )
  }

  private fun buildMemorySnapshot(): MemorySnapshot {
    val playerBytes = memorySize.toDouble()
    val sourceBytes = source.memorySize.toDouble()

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

  private fun resolvedPreloadLevel(): PreloadLevel {
    return source.config.memoryConfig?.preloadLevel ?: PreloadLevel.BUFFERED
  }

  private fun resolvedOffscreenRetention(): OffscreenRetention {
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
    return (source as? HybridVideoPlayerSource)?.retentionState
      ?: MemoryRetentionState.COLD
  }

  private fun isAttachedToView(): Boolean {
    return currentPlayerView?.get()?.isAttachedToWindow == true
  }

  fun notifyViewAttached() {
    cancelPendingTrim()
    VideoManager.touchFeedHotCandidate(this)
  }

  fun notifyViewDetached() {
    VideoManager.touchFeedHotCandidate(this)
    if (isPlaying) {
      return
    }

    scheduleOffscreenTrim()
  }

  internal fun isFeedProfile(): Boolean {
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
    val isPinnedByPictureInPicture =
      VideoManager.getCurrentPictureInPictureVideo()?.hybridPlayer === this

    return currentView?.isAttachedToWindow == true || isPinnedByPictureInPicture
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
    val hybridSource = source as? HybridVideoPlayerSource ?: return

    if (loadedWithSource) {
      desiredCurrentTimeMs = player.currentPosition
      stopProgressUpdates()
      player.removeListener(playerListener)
      player.removeAnalyticsListener(analyticsListener)
      player.release()
      player = createExoPlayer(DefaultLoadControl.Builder().build())
      allocator = null
      loadedWithSource = false
    }

    hybridSource.trimToMetadata()
    status = VideoPlayerStatus.IDLE
    readyToDisplay = false
    emitPlaybackState()
  }

  private fun trimToColdRetention() {
    trimToMetadataRetention()
    (source as? HybridVideoPlayerSource)?.trimToCold()
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
      when (playbackState) {
        Player.STATE_IDLE -> {
          status = VideoPlayerStatus.IDLE
          readyToDisplay = false
        }
        Player.STATE_BUFFERING -> {
          status = VideoPlayerStatus.BUFFERING
        }
        Player.STATE_READY -> {
          status = if (player.isPlaying) {
            VideoPlayerStatus.PLAYING
          } else {
            VideoPlayerStatus.PAUSED
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
              orientation = VideoOrientationUtils.fromWHR(width, height, rotationDegrees)
            )
          )
          // If player becomes ready and is set to play, start progress updates
          if (player.playWhenReady) {
            startProgressUpdates()
          }
        }
        Player.STATE_ENDED -> {
          status = VideoPlayerStatus.ENDED
          stopProgressUpdates()
        }
      }

      emitPlaybackState()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      super.onIsPlayingChanged(isPlaying)
      if (player.playbackState == Player.STATE_READY) {
        status = if (isPlaying) {
          VideoPlayerStatus.PLAYING
        } else {
          VideoPlayerStatus.PAUSED
        }
      }
      if (isPlaying) {
        VideoManager.setLastPlayedPlayer(this@HybridVideoPlayer)
        startProgressUpdates()
      } else {
        if (player.playbackState == Player.STATE_ENDED || player.playbackState == Player.STATE_IDLE) {
          stopProgressUpdates()
        }
      }
      emitPlaybackState()
    }

    override fun onPlayerError(error: PlaybackException) {
      status = VideoPlayerStatus.ERROR
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
        status == VideoPlayerStatus.ENDED
      ) {
        status = VideoPlayerStatus.PAUSED
      }
      emitPlaybackState()
    }

    override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
      emitPlaybackState()
    }

    override fun onVolumeChanged(volume: Float) {
      // We get here device volume changes, and if
      // player is not muted we will sync it
      if (!muted) {
        this@HybridVideoPlayer.volume = volume.toDouble()
      }

      VideoManager.audioFocusManager.requestAudioFocusUpdate()
      eventEmitter.onVolumeChange(onVolumeChangeData(
        volume = volume.toDouble(),
        muted = muted
      ))
    }

    override fun onCues(cueGroup: CueGroup) {
      val texts = cueGroup.cues.mapNotNull { it.text?.toString() }
      if (texts.isNotEmpty()) {
        eventEmitter.onTextTrackDataChanged(texts.toTypedArray())
      }
    }

    override fun onMetadata(metadata: Metadata) {
      val timedMetadataObjects = mutableListOf<TimedMetadataObject>()
      for (i in 0 until metadata.length()) {
        val entry = metadata.get(i)

        when (entry) {
          is Id3Frame -> {
            var value = ""

            if (entry is TextInformationFrame) {
              value = entry.values.first()
            }

            timedMetadataObjects.add(TimedMetadataObject(entry.id, value))
          }
          is EventMessage ->
            timedMetadataObjects.add(TimedMetadataObject(entry.schemeIdUri, entry.value))
          else -> Log.d(TAG, "Unknown metadata: $entry")
        }
      }
      if (timedMetadataObjects.isNotEmpty()) {
        eventEmitter.onTimedMetadata(TimedMetadata(metadata = timedMetadataObjects.toTypedArray()))
      }
    }

    override fun onTracksChanged(tracks: Tracks) {
      super.onTracksChanged(tracks)
    }
  }

  // MARK: - Text Track Management

  override fun getAvailableTextTracks(): Array<TextTrack> {
    return TextTrackUtils.getAvailableTextTracks(player, source)
  }

  override fun selectTextTrack(textTrack: Variant_NullType_TextTrack?) {
    selectedExternalTrackIndex = TextTrackUtils.selectTextTrack(
      player = player,
      textTrack = textTrack?.asSecondOrNull(),
      source = source,
      onTrackChange = { track -> eventEmitter.onTrackChange(track) }
    )
  }

  override val selectedTrack: TextTrack?
    get() = TextTrackUtils.getSelectedTrack(player, source)
}
