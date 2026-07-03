//
//  HybridNitroPlayer.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import AVFoundation
import Foundation
import NitroModules

private enum InactiveNitroPlayerSource {
  static let shared: HybridNitroPlayerSource = {
    let config = NativeNitroPlayerConfig(
      uri: "file:///dev/null",
      headers: nil,
      metadata: nil,
      startup: .eager,
      buffer: nil,
      retention: nil,
      transport: nil,
      preview: nil
    )
    return try! HybridNitroPlayerSource(config: config)
  }()
}

class HybridNitroPlayer: HybridNitroPlayerSpec, NativeNitroPlayerSpec, @unchecked Sendable {
  struct SourceCommand {
    let generation: Int
    let oldSource: HybridNitroPlayerSource?
    let shouldAutoPlay: Bool
  }

  struct FirstFrameContext {
    let sourceUri: String
    let headers: [String: String]?
    let width: Double
    let height: Double
  }

  private struct PlaybackSnapshot {
    let status: NitroPlayerStatus
    let currentTime: Double
    let duration: Double
    let bufferDuration: Double
    let bufferedPosition: Double
    let rate: Double
    let isPlaying: Bool
    let isBuffering: Bool
    let isVisualReady: Bool
    let error: Variant_NullType_PlaybackError?
    let nativeTimestampMs: Double
    let fingerprint: PlaybackStateFingerprint
  }

  private struct PlaybackMetrics {
    var currentTime: Double = 0
    var duration: Double = Double.nan
    var bufferDuration: Double = 0
    var rate: Double = 0
    var timeControlStatus: AVPlayer.TimeControlStatus = .paused
  }

  /**
   * Player instance for video playback
   */
  var player: AVPlayer {
    didSet {
      playerObserver?.initializePlayerObservers()
      applyLoopMode()
    }
    willSet {
      playerObserver?.invalidatePlayerObservers()
    }
  }

  var playerItem: AVPlayerItem? {
    didSet {
      if let bufferConfig = currentSourceConfig()?.buffer {
        playerItem?.setBufferConfig(config: bufferConfig)
      }
    }
  }
  var playerObserver: NitroPlayerObserver?
  let sourceLoader = SourceLoader()
  let playerMutationExecutor = PlayerMutationExecutor()
  let mainThreadExecutor = MainThreadResourceExecutor()
  var artworkTask: Task<Void, Never>?
  var initTask: Task<Void, Never>?
  let lifecycleGate = LifecycleGate()
  var isReleased: Bool { lifecycleGate.isReleased }
  var hasActiveSource = false
  var lastError: PlaybackError?
  var readyToDisplay = false
  var resumePositionSeconds: Double = 0
  var isAttachedToVideoView = false
  var pendingTrimWorkItem: DispatchWorkItem?
  var startupRecoveryTask: Task<Void, Never>?
  var firstFrameTask: Task<Void, Never>?
  var firstFrameRequest: PreviewRequest<VideoPreviewResult>?
  var sourceGeneration: Int { lifecycleGate.generation }
  var startupRecoveryAttempts: Int = 0
  var hasLoadedCurrentSource = false
  var firstFrame: onFirstFrameData?
  var firstFrameContext: FirstFrameContext?
  private let playbackStateEmissionGate = PlaybackStateEmissionGate()
  private var playbackMetrics = PlaybackMetrics()

  private let startupRecoveryDelayNs: UInt64 = 250_000_000
  private let maxStartupRecoveryAttempts = 1

  // Playback-start watchdog: a loaded item can stall before advancing with no error event, so the
  // onError-driven startup recovery never fires. This re-prepares such a loaded-but-frozen item.
  var playbackWatchdogTask: Task<Void, Never>?
  var playbackWatchdogAttempts: Int = 0
  private let playbackWatchdogDelayNs: UInt64 = 3_000_000_000
  private let maxPlaybackWatchdogAttempts = 5

  func replaceCurrentItem(_ item: AVPlayerItem?) {
    let apply = { [weak self] in
      // Allow the release-time nil-clear even when released, but block a stale
      // non-nil re-attach that was queued before release ran.
      guard let self, !self.isReleased || item == nil else { return }
      self.player.replaceCurrentItem(with: item)
    }

    if Thread.isMainThread {
      apply()
      return
    }

    DispatchQueue.main.async(execute: apply)
  }

  override init() {
    self.eventEmitter = HybridNitroPlayerEventEmitter()

    self.player = AVPlayer()
    self.player.automaticallyWaitsToMinimizeStalling = false

    super.init()
    self.playerObserver = NitroPlayerObserver(delegate: self)
    self.playerObserver?.initializePlayerObservers()
    self._eventEmitter?.onFirstFrameListenerAdded = { [weak self] in
      DispatchQueue.main.async {
        self?.requestFirstFrameIfNeeded()
      }
    }
    NitroPlayerManager.shared.register(player: self)
    NitroPlayerManager.shared.touchFeedHotCandidate(self)
  }

  convenience init(source: (any HybridNitroPlayerSourceSpec)) throws {
    self.init()
    self.sourceStorage = source
    self.hasActiveSource = true
    beginSourceGeneration()

    initTask = Task { [weak self] in
      guard let self else { return }
      if self.resolvedInitialization() == .eager {
        switch self.resolvedPreloadLevel() {
        case .buffered:
          do {
            try await self.prepareBufferedState()
          } catch {
            // Ignore cancellation errors during initialization
          }
        case .metadata:
          do {
            try await self.currentHybridSource()?.warmMetadata()
          } catch {
            // Ignore cancellation errors during initialization
          }
        case .none:
          break
        }
      }
      self.initTask = nil
    }
  }

  deinit {
    release()
  }

  // MARK: - Hybrid Impl

  var sourceStorage: (any HybridNitroPlayerSourceSpec)?

  var source: any HybridNitroPlayerSourceSpec {
    return sourceStorage ?? InactiveNitroPlayerSource.shared
  }

  var status: NitroPlayerStatus = .idle
  var wantsToPlay = false

  var eventEmitter: HybridNitroPlayerEventEmitterSpec
  var _eventEmitter: HybridNitroPlayerEventEmitter? {
    return eventEmitter as? HybridNitroPlayerEventEmitter
  }

  private var userVolume: Float = 1.0

  var volume: Double {
    set {
      guard !isReleased else { return }
      userVolume = Float(newValue)
      player.volume = Float(newValue)
    }
    get {
      guard !isReleased else { return Double(userVolume) }
      return Double(player.volume)
    }
  }

  var muted: Bool {
    set {
      guard !isReleased else { return }
      if newValue {
        if !player.isMuted {
          userVolume = player.volume
        }
        player.volume = 0
      } else {
        player.volume = userVolume
      }
      player.isMuted = newValue
      _eventEmitter?.onVolumeChange(
        onVolumeChangeData(
          volume: Double(player.volume),
          muted: newValue
        )
      )
    }
    get {
      guard !isReleased else { return false }
      return player.isMuted
    }
  }

  var currentTime: Double {
    set {
      resumePositionSeconds = clampedPlaybackTime(newValue)
      updateCachedProgress(currentTime: resumePositionSeconds)
      emitPlaybackState()

      guard !isReleased, playerItem != nil else { return }

      player.seek(
        to: CMTime(seconds: resumePositionSeconds, preferredTimescale: 1000),
        toleranceBefore: .zero,
        toleranceAfter: .zero
      ) { [weak self] _ in
        guard let self else { return }
        self.updateCachedProgress(currentTime: self.resumePositionSeconds)
        self.emitPlaybackState()
      }
    }
    get {
      playbackMetrics.currentTime
    }
  }

  var duration: Double {
    guard !isReleased else { return Double.nan }
    return playbackMetrics.duration
  }

  var bufferDuration: Double {
    guard !isReleased else { return 0 }
    return playbackMetrics.bufferDuration
  }

  var bufferedPosition: Double {
    currentTime + bufferDuration
  }

  var rate: Double {
    set {
      guard !isReleased else { return }
      if #available(iOS 16.0, tvOS 16.0, *) {
        player.defaultRate = Float(newValue)
      }

      player.rate = Float(newValue)
      updateCachedRate(newValue)
    }
    get {
      guard !isReleased else { return 0 }
      return playbackMetrics.rate
    }
  }

  var loop: Bool = false {
    didSet {
      applyLoopMode()
    }
  }

  var mixAudioMode: MixAudioMode = .auto

  var ignoreSilentSwitchMode: IgnoreSilentSwitchMode = .auto

  var playInBackground: Bool = false

  var playWhenInactive: Bool = false

  var wasAutoPaused: Bool = false

  // Text track selection state

  var isCurrentlyBuffering: Bool = false

  var isPlaying: Bool {
    guard !isReleased else { return false }
    return playbackMetrics.rate != 0
  }

  var isBuffering: Bool {
    isCurrentlyBuffering
  }

  var isVisualReady: Bool {
    readyToDisplay
  }

  var playbackState: PlaybackState {
    playbackState(from: currentPlaybackSnapshot())
  }

  private func currentPlaybackSnapshot() -> PlaybackSnapshot {
    if isReleased {
      return PlaybackSnapshot(
        status: .idle,
        currentTime: 0,
        duration: 0,
        bufferDuration: 0,
        bufferedPosition: 0,
        rate: 0,
        isPlaying: false,
        isBuffering: false,
        isVisualReady: false,
        error: nil,
        nativeTimestampMs: Date().timeIntervalSince1970 * 1000,
        fingerprint: PlaybackStateFingerprint(
          status: playbackStatusIndex(.idle),
          currentTime: 0,
          duration: 0,
          bufferDuration: 0,
          bufferedPosition: 0,
          rate: 0,
          isPlaying: false,
          isBuffering: false,
          isVisualReady: false,
          errorCode: nil,
          errorMessageHash: nil
        )
      )
    }

    let currentStatus = status
    let duration = playbackMetrics.duration
    let currentTime: Double
    if currentStatus == .ended && duration.isFinite && duration > 0 {
      currentTime = duration
    } else {
      currentTime = playbackMetrics.currentTime
    }
    let bufferDuration = playbackMetrics.bufferDuration
    let bufferedPosition: Double
    if duration.isFinite && duration > 0 {
      bufferedPosition = min(duration, currentTime + bufferDuration)
    } else {
      bufferedPosition = currentTime + bufferDuration
    }
    let rate = playbackMetrics.rate
    let isPlaying = rate != 0
    let isBuffering = isBuffering
    let isVisualReady = readyToDisplay
    let error = lastError.map { Variant_NullType_PlaybackError.second($0) }
    let errorFingerprint = playbackErrorFingerprint(error)
    return PlaybackSnapshot(
      status: status,
      currentTime: currentTime,
      duration: duration,
      bufferDuration: bufferDuration,
      bufferedPosition: bufferedPosition,
      rate: rate,
      isPlaying: isPlaying,
      isBuffering: isBuffering,
      isVisualReady: isVisualReady,
      error: error,
      nativeTimestampMs: Date().timeIntervalSince1970 * 1000,
      fingerprint: PlaybackStateFingerprint(
        status: playbackStatusIndex(currentStatus),
        currentTime: currentTime,
        duration: duration,
        bufferDuration: bufferDuration,
        bufferedPosition: bufferedPosition,
        rate: rate,
        isPlaying: isPlaying,
        isBuffering: isBuffering,
        isVisualReady: isVisualReady,
        errorCode: errorFingerprint.code,
        errorMessageHash: errorFingerprint.messageHash
      )
    )
  }

  private func playbackState(from snapshot: PlaybackSnapshot) -> PlaybackState {
    PlaybackState(
      status: snapshot.status,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
      bufferDuration: snapshot.bufferDuration,
      bufferedPosition: snapshot.bufferedPosition,
      rate: snapshot.rate,
      isPlaying: snapshot.isPlaying,
      isBuffering: snapshot.isBuffering,
      isVisualReady: snapshot.isVisualReady,
      error: snapshot.error,
      nativeTimestampMs: snapshot.nativeTimestampMs
    )
  }

  var memorySnapshot: MemorySnapshot {
    if isReleased {
      return MemorySnapshot(
        playerBytes: 0,
        sourceBytes: 0,
        totalBytes: 0,
        preloadLevel: resolvedPreloadLevel(),
        retentionState: currentRetentionState(),
        isAttachedToView: false,
        isPlaying: false,
        wantsToPlay: false,
        isFeedPoolEligible: false,
        isPinnedForFeedPool: false,
        isPinnedForResourcePressure: false
      )
    }

    let playerBytes = playerItem == nil ? 0 : max(bufferDuration * 256_000, 64_000)
    let sourceBytes = hasActiveSource ? Double(currentHybridSource()?.memorySize ?? 0) : 0
    let retention = retentionSnapshot()

    return MemorySnapshot(
      playerBytes: playerBytes,
      sourceBytes: sourceBytes,
      totalBytes: playerBytes + sourceBytes,
      preloadLevel: resolvedPreloadLevel(),
      retentionState: currentRetentionState(),
      isAttachedToView: isAttachedToVideoView,
      isPlaying: isPlaying,
      wantsToPlay: wantsToPlay,
      isFeedPoolEligible: retention.isFeedPoolEligible,
      isPinnedForFeedPool: PlayerRetentionCoordinator.isPinnedForFeedPool(retention),
      isPinnedForResourcePressure: PlayerRetentionCoordinator.isPinnedForResourcePressure(retention)
    )
  }

  func emitPlaybackState() {
    guard lifecycleGate.shouldEmit() else { return }
    let snapshot = currentPlaybackSnapshot()
    // The 0.25s observer tick rebuilds the state every time, but when nothing
    // meaningful changed (only the timestamp advanced) there is no reason to
    // cross the bridge. nativeTimestampMs is excluded from the fingerprint.
    if !playbackStateEmissionGate.shouldEmit(fingerprint: snapshot.fingerprint) {
      return
    }
    _eventEmitter?.onPlaybackState(playbackState(from: snapshot))
  }

  private func sanitizedDuration(_ value: Double) -> Double {
    value.isFinite && value >= 0 ? value : Double.nan
  }

  private func clampedPlaybackTime(_ value: Double) -> Double {
    let finiteValue = value.isFinite ? value : 0
    let positiveValue = max(0, finiteValue)
    let duration = playbackMetrics.duration
    guard duration.isFinite && duration > 0 else { return positiveValue }
    return min(positiveValue, duration)
  }

  private func isAtPlaybackEnd() -> Bool {
    let duration = playbackMetrics.duration
    guard duration.isFinite && duration > 0 else { return false }
    return playbackMetrics.currentTime >= duration - 0.05
  }

  private func playbackStatusIndex(_ status: NitroPlayerStatus) -> Int {
    switch status {
    case .idle:
      return 0
    case .loading:
      return 1
    case .buffering:
      return 2
    case .playing:
      return 3
    case .paused:
      return 4
    case .ended:
      return 5
    case .error:
      return 6
    }
  }

  private func playbackErrorFingerprint(_ error: Variant_NullType_PlaybackError?) -> (code: Int?, messageHash: UInt64?) {
    switch error {
    case .some(.second(let error)):
      return (playbackErrorCodeIndex(error.code), stableHash(error.message))
    case .some(.first):
      return (-1, nil)
    case .none:
      return (nil, nil)
    }
  }

  private func playbackErrorCodeIndex(_ code: NitroPlayerErrorCode) -> Int {
    switch code {
    case .libraryDeallocated:
      return 0
    case .libraryApplicationContextNotFound:
      return 1
    case .libraryMethodNotSupported:
      return 2
    case .playerReleased:
      return 3
    case .playerNotInitialized:
      return 4
    case .playerAssetNotInitialized:
      return 5
    case .playerInvalidSource:
      return 6
    case .playerInvalidTrackUrl:
      return 7
    case .playerCancelled:
      return 8
    case .sourceInvalidUri:
      return 9
    case .sourceMissingReadFilePermission:
      return 10
    case .sourceFileDoesNotExist:
      return 11
    case .sourceFailedToInitializeAsset:
      return 12
    case .sourceUnsupportedContentType:
      return 13
    case .sourceCancelled:
      return 14
    case .viewNotFound:
      return 15
    case .viewDeallocated:
      return 16
    case .viewPictureInPictureNotSupported:
      return 17
    case .unknownUnknown:
      return 18
    }
  }

  private func stableHash(_ value: String) -> UInt64 {
    var hash: UInt64 = 14_695_981_039_346_656_037
    for byte in value.utf8 {
      hash ^= UInt64(byte)
      hash &*= 1_099_511_628_211
    }
    return hash
  }

  func currentSourceConfig() -> NativeNitroPlayerConfig? {
    currentHybridSource()?.config
  }

  func resolvedInitialization() -> NitroSourceStartup {
    currentSourceConfig()?.startup ?? .eager
  }

  func resetPlaybackError() {
    lastError = nil
  }

  var cachedTimeControlStatus: AVPlayer.TimeControlStatus {
    playbackMetrics.timeControlStatus
  }

  func resetPlaybackMetrics(currentTime: Double = 0, duration: Double = Double.nan) {
    playbackMetrics.currentTime = max(0, currentTime.isFinite ? currentTime : 0)
    playbackMetrics.duration = sanitizedDuration(duration)
    playbackMetrics.bufferDuration = 0
    playbackMetrics.rate = 0
    playbackMetrics.timeControlStatus = .paused
  }

  func updateCachedProgress(currentTime: Double? = nil, bufferDuration: Double? = nil) {
    if let currentTime {
      playbackMetrics.currentTime = clampedPlaybackTime(currentTime)
      resumePositionSeconds = playbackMetrics.currentTime
    }
    if let bufferDuration {
      playbackMetrics.bufferDuration = max(0, bufferDuration.isFinite ? bufferDuration : 0)
    }
  }

  func updateCachedDuration(_ duration: Double) {
    playbackMetrics.duration = sanitizedDuration(duration)
    playbackMetrics.currentTime = clampedPlaybackTime(playbackMetrics.currentTime)
  }

  func updateCachedRate(_ rate: Float) {
    updateCachedRate(Double(rate))
  }

  func updateCachedRate(_ rate: Double) {
    let normalizedRate = rate.isFinite ? rate : 0
    playbackMetrics.rate = normalizedRate
    if normalizedRate > 0 {
      playbackMetrics.timeControlStatus = .playing
    } else if !wantsToPlay {
      playbackMetrics.timeControlStatus = .paused
    }
  }

  func updateCachedTimeControlStatus(_ status: AVPlayer.TimeControlStatus) {
    playbackMetrics.timeControlStatus = status
  }

  func setPlaybackError(code: NitroPlayerErrorCode, message: String) {
    lastError = PlaybackError(code: code, message: message)
  }

  func beginSourceGeneration() {
    lifecycleGate.beginGeneration()
    startupRecoveryAttempts = 0
    hasLoadedCurrentSource = false
    playbackStateEmissionGate.reset()
    firstFrame = nil
    firstFrameContext = nil
    resetPlaybackMetrics(currentTime: 0)
    cancelFirstFrameRequest()
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    playbackWatchdogAttempts = 0
    _eventEmitter?.resetStickyState()
  }

  func beginSourceCommand(allowAutoPlay: Bool) -> SourceCommand? {
    mainThreadExecutor.run {
      guard !isReleased else { return nil }

      let shouldAutoPlay = allowAutoPlay && wantsToPlay
      let oldSource = currentHybridSource()

      wantsToPlay = false
      cancelPendingTrim()
      initTask?.cancel()
      initTask = nil
      artworkTask?.cancel()
      artworkTask = nil
      beginSourceGeneration()

      return SourceCommand(
        generation: sourceGeneration,
        oldSource: oldSource,
        shouldAutoPlay: shouldAutoPlay
      )
    }
  }

  func markCurrentSourceLoaded() {
    hasLoadedCurrentSource = true
    startupRecoveryAttempts = 0
    cancelStartupRecovery()
  }

  func cancelStartupRecovery() {
    startupRecoveryTask?.cancel()
    startupRecoveryTask = nil
  }

  func cancelPlaybackWatchdog() {
    playbackWatchdogTask?.cancel()
    playbackWatchdogTask = nil
  }

  var playbackWatchdogAttemptCount: Int {
    playbackWatchdogAttempts
  }

  var hasPendingPlaybackWatchdog: Bool {
    playbackWatchdogTask != nil
  }

  func startCurrentItemPlayback() {
    guard playerItem != nil else { return }
    let targetRate: Float
    if #available(iOS 16.0, tvOS 16.0, *) {
      targetRate = player.defaultRate == 0 ? 1.0 : player.defaultRate
    } else {
      targetRate = 1.0
    }
    player.playImmediately(atRate: targetRate)
    if player.rate == 0 {
      player.rate = targetRate
    }
    updateCachedRate(targetRate)
  }

  private func applyLoopMode() {
    player.actionAtItemEnd = loop ? .none : .pause
  }

  func recreatePlayerForRecovery() {
    let oldPlayer = player
    let nextPlayer = AVPlayer()
    nextPlayer.automaticallyWaitsToMinimizeStalling = false
    nextPlayer.isMuted = oldPlayer.isMuted
    nextPlayer.volume = oldPlayer.volume
    nextPlayer.preventsDisplaySleepDuringVideoPlayback = oldPlayer.preventsDisplaySleepDuringVideoPlayback
    if #available(iOS 16.0, tvOS 16.0, *) {
      nextPlayer.defaultRate = oldPlayer.defaultRate == 0 ? 1.0 : oldPlayer.defaultRate
    }

    oldPlayer.pause()
    oldPlayer.replaceCurrentItem(with: nil)
    player = nextPlayer
    NitroPlayerManager.shared.rebindViews(for: self)
  }

  func refreshCurrentSourceAssetForPlaybackRestart() {
    guard let source = currentHybridSource() else { return }
    if source.refreshPlaybackRouteForStartupRecovery() {
      return
    }
    source.releaseAsset()
  }

  func performSeamlessLoopSeek() {
    guard !isReleased, hasActiveSource, playerItem != nil else { return }

    updateCachedProgress(currentTime: 0)
    emitPlaybackState()

    player.seek(
      to: .zero,
      toleranceBefore: .zero,
      toleranceAfter: .zero
    ) { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        guard let self, !self.isReleased, self.wantsToPlay else { return }
        if self.rate == 0 {
          self.startCurrentItemPlayback()
        }
        self.updateCachedProgress(currentTime: 0)
        self.emitPlaybackState()
      }
    }
  }

  // Arm the playback watchdog. Idempotent (no-op if already armed). After ~3s it verifies the player
  // advanced since this window's baseline; on healthy (advanced / looped / near end) it resets the
  // attempt counter and RE-ARMS to keep watching the whole playback, so a freeze AFTER initial progress
  // is still caught. On a genuine stall it bounded-retries by re-preparing the loaded source.
  func schedulePlaybackStartWatchdog() {
    guard !isReleased, hasActiveSource, wantsToPlay else { return }
    guard playbackWatchdogTask == nil else { return }
    guard playbackWatchdogAttempts < maxPlaybackWatchdogAttempts else { return }

    let generation = sourceGeneration
    let startPositionSeconds = currentTime

    playbackWatchdogTask = Task.detached(priority: .userInitiated) { [weak self] in
      do {
        try await Task.sleep(nanoseconds: self?.playbackWatchdogDelayNs ?? 0)
      } catch {
        return
      }

      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.playbackWatchdogTask = nil
        guard !self.isReleased, self.hasActiveSource, self.wantsToPlay, self.sourceGeneration == generation else {
          return
        }

        let currentSeconds = self.currentTime
        let durationSeconds = self.duration
        // Loop playback must advance or wrap; a player pinned near the end should recover.
        let isNearEnd = !self.loop && durationSeconds.isFinite && currentSeconds.isFinite &&
          currentSeconds >= durationSeconds - 0.25
        // Relative advancement: any change since this window's baseline is healthy. abs() so a loop wrap
        // (currentTime jumps back) reads as advancing, not a freeze. Near-end is healthy for non-loop playback.
        // On healthy, RE-ARM to keep watching the whole playback (the re-arm rebaselines startPositionSeconds), so a
        // freeze AFTER initial progress is still caught instead of disarming after the first window.
        let changed = currentSeconds.isFinite &&
          (!startPositionSeconds.isFinite || abs(currentSeconds - startPositionSeconds) > 0.01)
        if self.rate > 0 && (changed || isNearEnd) {
          self.playbackWatchdogAttempts = 0
          self.schedulePlaybackStartWatchdog()
          return
        }

        self.playbackWatchdogAttempts += 1
        guard self.playbackWatchdogAttempts <= self.maxPlaybackWatchdogAttempts else { return }

        // Loaded + wantsToPlay + no time progress is a stall even when AVPlayer reports
        // waitingToPlayAtSpecifiedRate. Keeping that state on the watch loop strands the
        // feed on the first frame with no error, so recover the loaded item directly.
        if self.hasLoadedCurrentSource {
          self.recoverStalledPlayback(generation: generation)
        } else {
          self.schedulePlaybackStartWatchdog()
        }
      }
    }
  }

  private func recoverStalledPlayback(generation: Int) {
    isCurrentlyBuffering = false
    readyToDisplay = false
    status = .loading
    emitPlaybackState()

    playbackWatchdogTask = Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }
      guard !self.isReleased, self.hasActiveSource, self.wantsToPlay, self.sourceGeneration == generation else {
        return
      }

      // The HLS proxy is intentionally not restarted: it already serves this loaded source, and a
      // decode/render stall does not need a new route. prepareBufferedState rebuilds the AVPlayerItem
      // from the existing source; genuine route failures surface via the item-failed startup recovery.
      self.initTask?.cancel()
      self.initTask = nil
      self.artworkTask?.cancel()
      self.artworkTask = nil
      self.refreshCurrentSourceAssetForPlaybackRestart()

      do {
        try await self.prepareBufferedState(recreatePlayer: true)
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          self.playbackWatchdogTask = nil
          guard !self.isReleased, self.sourceGeneration == generation, self.wantsToPlay else { return }
          self.startCurrentItemPlayback()
          self.schedulePlaybackStartWatchdog()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          self.playbackWatchdogTask = nil
          guard !self.isReleased, self.sourceGeneration == generation, self.wantsToPlay else { return }
          self.schedulePlaybackStartWatchdog()
        }
      }
    }
  }

  func currentHybridSource() -> HybridNitroPlayerSource? {
    sourceStorage as? HybridNitroPlayerSource
  }

  func shouldAttemptStartupRecovery() -> Bool {
    guard !isReleased else { return false }
    guard hasActiveSource, wantsToPlay, !hasLoadedCurrentSource else { return false }
    guard startupRecoveryAttempts < maxStartupRecoveryAttempts else { return false }
    return currentHybridSource()?.supportsStartupRecovery() == true
  }

  @discardableResult
  func attemptStartupRecoveryIfNeeded(message: String) -> Bool {
    guard shouldAttemptStartupRecovery() else {
      return false
    }

    startupRecoveryAttempts += 1
    let generation = sourceGeneration
    isCurrentlyBuffering = false
    readyToDisplay = false
    resetPlaybackError()
    status = .loading
    emitPlaybackState()

    cancelStartupRecovery()
    startupRecoveryTask = Task.detached(priority: .userInitiated) { [weak self] in
      do {
        try await Task.sleep(nanoseconds: self?.startupRecoveryDelayNs ?? 0)
      } catch {
        return
      }

      guard let self else { return }
      guard !self.isReleased, self.hasActiveSource, self.wantsToPlay else { return }
      guard self.sourceGeneration == generation else { return }

      HlsProxyRuntime.shared.restartForPlaybackRecovery()
      self.currentHybridSource()?.refreshPlaybackRouteForStartupRecovery()
      self.initTask?.cancel()
      self.initTask = nil
      self.artworkTask?.cancel()
      self.artworkTask = nil

      do {
        try await self.prepareBufferedState()
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased, self.sourceGeneration == generation, self.wantsToPlay else {
            return
          }
          self.startCurrentItemPlayback()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased, self.sourceGeneration == generation else { return }
          self.failPlayback(message: message.isEmpty ? error.localizedDescription : message)
        }
      }
    }

    return true
  }

  func failPlayback(message: String) {
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    cancelFirstFrameRequest()
    wantsToPlay = false
    status = .error
    isCurrentlyBuffering = false
    readyToDisplay = false
    setPlaybackError(code: .unknownUnknown, message: message)
    if let lastError {
      _eventEmitter?.onError(lastError)
    }
    emitPlaybackState()
  }

  func resolvePlayPauseStatus() -> NitroPlayerStatus {
    if rate > 0 { return .playing }
    if wantsToPlay {
      switch status {
      case .buffering, .loading, .playing:
        return status
      default:
        return .loading
      }
    }
    return .paused
  }

  func play() throws {
    guard !isReleased else { return }
    cancelPendingTrim()
    let wasPlayIntentActive = wantsToPlay
    wantsToPlay = true
    if !wasPlayIntentActive {
      playbackWatchdogAttempts = 0
    }
    NitroPlayerManager.shared.touchFeedHotCandidate(self)

    guard hasActiveSource else {
      wantsToPlay = false
      status = .idle
      readyToDisplay = false
      isCurrentlyBuffering = false
      resetPlaybackError()
      emitPlaybackState()
      return
    }

    schedulePlaybackStartWatchdog()

    if playerItem != nil {
      if status == .ended || isAtPlaybackEnd() {
        resumePositionSeconds = 0
        updateCachedProgress(currentTime: 0)
        status = .loading
        emitPlaybackState()
        player.seek(
          to: CMTime(seconds: 0, preferredTimescale: 1000),
          toleranceBefore: .zero,
          toleranceAfter: .zero
        ) { [weak self] _ in
          guard let self, !self.isReleased, self.wantsToPlay else { return }
          self.startCurrentItemPlayback()
          self.status = self.rate > 0 ? .playing : self.resolvePlayPauseStatus()
          self.isCurrentlyBuffering = false
          self.emitPlaybackState()
        }
        return
      }

      startCurrentItemPlayback()
      status = rate > 0 ? .playing : resolvePlayPauseStatus()
      isCurrentlyBuffering = false
      emitPlaybackState()
      return
    }

    initTask?.cancel()
    initTask = nil
    status = .loading
    readyToDisplay = false
    resetPlaybackError()
    emitPlaybackState()

    let generation = sourceGeneration
    Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }

      do {
        try await self.prepareBufferedState()
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased, self.sourceGeneration == generation, self.wantsToPlay else { return }
          self.startCurrentItemPlayback()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          // Guard the generation: if the source was replaced while preparing,
          // a stale failure must not fail/recover the new source.
          guard let self, !self.isReleased, self.sourceGeneration == generation else { return }
          if self.attemptStartupRecoveryIfNeeded(message: error.localizedDescription) {
            return
          }
          self.failPlayback(message: error.localizedDescription)
        }
      }
    }
  }

  func pause() throws {
    guard !isReleased else { return }
    wantsToPlay = false
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    player.pause()
    updateCachedRate(0.0)

    if status != .ended && status != .idle {
      status = .paused
      isCurrentlyBuffering = false
      emitPlaybackState()
    }

    NitroPlayerManager.shared.touchFeedHotCandidate(self)

    if !isAttachedToVideoView {
      scheduleOffscreenTrim()
    }
  }

  func seekBy(time: Double) throws {
    guard !isReleased, playerItem != nil else {
      throw PlayerError.notInitialized.error()
    }

    // Duration is NaN for live streams
    let fixedDuration = duration.isNaN ? Double.infinity : duration

    // Clap by <0, duration>
    let newTime = max(0, min(currentTime + time, fixedDuration))

    currentTime = newTime
  }

  func seekTo(time: Double) {
    currentTime = time
  }

  func notifyViewAttached() {
    isAttachedToVideoView = true
    cancelPendingTrim()
    requestFirstFrameIfNeeded()
    NitroPlayerManager.shared.touchFeedHotCandidate(self)
  }

  func notifyViewDetached() {
    isAttachedToVideoView = false
    NitroPlayerManager.shared.touchFeedHotCandidate(self)

    if isPlaying {
      return
    }

    scheduleOffscreenTrim()
  }

  // MARK: - Memory Management

  func dispose() {
    release()
  }

  var memorySize: Int {
    var size = 0

    size += playerItem?.asset.estimatedMemoryUsage ?? 0

    return size
  }
}
