//
//  HybridNitroPlayer.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import AVFoundation
import Foundation
import NitroModules

class HybridNitroPlayer: HybridNitroPlayerSpec, NativeNitroPlayerSpec {

  /**
   * Player instance for video playback
   */
  var player: AVPlayer {
    didSet {
      playerObserver?.initializePlayerObservers()
    }
    willSet {
      playerObserver?.invalidatePlayerObservers()
    }
  }

  var playerItem: AVPlayerItem? {
    didSet {
      if let bufferConfig = currentSourceConfig()?.advanced?.buffer {
        playerItem?.setBufferConfig(config: bufferConfig)
      }
    }
  }
  var playerObserver: NitroPlayerObserver?
  let sourceLoader = SourceLoader()
  var artworkTask: Task<Void, Never>?
  var initTask: Task<Void, Never>?
  var isReleased = false
  var hasActiveSource = true
  var lastError: PlaybackError?
  var readyToDisplay = false
  var resumePositionSeconds: Double = 0
  var isAttachedToVideoView = false
  var pendingTrimWorkItem: DispatchWorkItem?

  func replaceCurrentItem(_ item: AVPlayerItem?) {
    let apply = { [weak self] in
      guard let self else { return }
      self.player.replaceCurrentItem(with: item)
    }

    if Thread.isMainThread {
      apply()
      return
    }

    DispatchQueue.main.async(execute: apply)
  }

  init(source: (any HybridNitroPlayerSourceSpec)) throws {
    self.source = source
    self.eventEmitter = HybridNitroPlayerEventEmitter()

    // Initialize AVPlayer with empty item
    self.player = AVPlayer()
    self.player.automaticallyWaitsToMinimizeStalling = false

    super.init()
    self.playerObserver = NitroPlayerObserver(delegate: self)
    self.playerObserver?.initializePlayerObservers()

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
            try await (self.source as? HybridNitroPlayerSource)?.warmMetadata()
          } catch {
            // Ignore cancellation errors during initialization
          }
        case .none:
          break
        }
      }
      self.initTask = nil
    }

    NitroPlayerManager.shared.register(player: self)
    NitroPlayerManager.shared.touchFeedHotCandidate(self)
  }

  deinit {
    release()
  }

  // MARK: - Hybrid Impl

  var source: any HybridNitroPlayerSourceSpec

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
      resumePositionSeconds = max(0, newValue)
      emitPlaybackState()

      guard !isReleased, player.currentItem != nil else { return }

      player.seek(
        to: CMTime(seconds: resumePositionSeconds, preferredTimescale: 1000),
        toleranceBefore: .zero,
        toleranceAfter: .zero
      ) { [weak self] _ in
        self?.emitPlaybackState()
      }
    }
    get {
      if isReleased || player.currentItem == nil {
        return resumePositionSeconds
      }

      return player.currentTime().seconds
    }
  }

  var duration: Double {
    Double(player.currentItem?.duration.seconds ?? Double.nan)
  }

  var bufferDuration: Double {
    player.currentItem?.getBufferDuration() ?? 0
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
    }
    get {
      guard !isReleased else { return 0 }
      return Double(player.rate)
    }
  }

  var loop: Bool = false

  var mixAudioMode: MixAudioMode = .auto

  var ignoreSilentSwitchMode: IgnoreSilentSwitchMode = .auto

  var playInBackground: Bool = false

  var playWhenInactive: Bool = false

  var wasAutoPaused: Bool = false

  // Text track selection state

  var isCurrentlyBuffering: Bool = false

  var isPlaying: Bool {
    guard !isReleased else { return false }
    return player.rate != 0
  }

  var isBuffering: Bool {
    isCurrentlyBuffering
  }

  var isReadyToDisplay: Bool {
    readyToDisplay
  }

  var playbackState: PlaybackState {
    if isReleased {
      return PlaybackState(
        status: .idle,
        currentTime: 0,
        duration: 0,
        bufferDuration: 0,
        bufferedPosition: 0,
        rate: 0,
        isPlaying: false,
        isBuffering: false,
        isReadyToDisplay: false,
        error: nil,
        nativeTimestampMs: Date().timeIntervalSince1970 * 1000
      )
    }

    return PlaybackState(
      status: status,
      currentTime: currentTime,
      duration: duration,
      bufferDuration: bufferDuration,
      bufferedPosition: bufferedPosition,
      rate: rate,
      isPlaying: isPlaying,
      isBuffering: isBuffering,
      isReadyToDisplay: readyToDisplay,
      error: lastError.map { .second($0) },
      nativeTimestampMs: Date().timeIntervalSince1970 * 1000
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
        isPlaying: false
      )
    }

    let playerBytes = player.currentItem == nil ? 0 : max(bufferDuration * 256_000, 64_000)
    let sourceBytes = hasActiveSource ? Double((source as? HybridNitroPlayerSource)?.memorySize ?? 0) : 0

    return MemorySnapshot(
      playerBytes: playerBytes,
      sourceBytes: sourceBytes,
      totalBytes: playerBytes + sourceBytes,
      preloadLevel: resolvedPreloadLevel(),
      retentionState: currentRetentionState(),
      isAttachedToView: isAttachedToVideoView,
      isPlaying: isPlaying
    )
  }

  func emitPlaybackState() {
    _eventEmitter?.onPlaybackState(playbackState)
  }

  func currentSourceConfig() -> NativeNitroPlayerConfig? {
    (source as? HybridNitroPlayerSource)?.config
  }

  func resolvedInitialization() -> NitroSourceInitialization {
    currentSourceConfig()?.initialization ?? .eager
  }

  func resetPlaybackError() {
    lastError = nil
  }

  func setPlaybackError(code: NitroPlayerErrorCode, message: String) {
    lastError = PlaybackError(code: code, message: message)
  }

  func markReadyToDisplay() {
    readyToDisplay = true
    emitPlaybackState()
  }

  func resolvePlayPauseStatus() -> NitroPlayerStatus {
    if player.rate > 0 { return .playing }
    if wantsToPlay { return status }
    return .paused
  }

  func play() throws {
    guard !isReleased else { return }
    cancelPendingTrim()
    wantsToPlay = true
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

    if player.currentItem != nil {
      player.play()
      status = .playing
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

    Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }

      do {
        try await self.prepareBufferedState()
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased, self.wantsToPlay else { return }
          self.player.play()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased else { return }
          self.wantsToPlay = false
          self.status = .error
          self.setPlaybackError(code: .unknownUnknown, message: error.localizedDescription)
          self.emitPlaybackState()
        }
      }
    }
  }

  func pause() throws {
    guard !isReleased else { return }
    wantsToPlay = false
    player.pause()

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
    guard !isReleased, let currentItem = player.currentItem else {
      throw PlayerError.notInitialized.error()
    }

    let currentItemTime = currentItem.currentTime()

    // Duration is NaN for live streams
    let fixedDuration = duration.isNaN ? Double.infinity : duration

    // Clap by <0, duration>
    let newTime = max(0, min(currentItemTime.seconds + time, fixedDuration))

    currentTime = newTime
  }

  func seekTo(time: Double) {
    currentTime = time
  }

  func notifyViewAttached() {
    isAttachedToVideoView = true
    cancelPendingTrim()
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
