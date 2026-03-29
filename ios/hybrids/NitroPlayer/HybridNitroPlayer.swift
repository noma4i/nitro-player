//
//  HybridNitroPlayer.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import AVFoundation
import Foundation
import NitroModules
import OSLog

private let playerLogger = Logger(subsystem: "com.nitroplay.video", category: "Player")

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
  private let sourceLoader = SourceLoader()
  private var artworkTask: Task<Void, Never>?
  private var initTask: Task<Void, Never>?
  private var isReleased = false
  private var hasActiveSource = true
  private var lastError: PlaybackError?
  var readyToDisplay = false
  private var resumePositionSeconds: Double = 0
  private var isAttachedToVideoView = false
  private var pendingTrimWorkItem: DispatchWorkItem?

  private func replaceCurrentItem(_ item: AVPlayerItem?) {
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

  func initialize() throws -> Promise<Void> {
    return Promise.async { [weak self] in
      guard let self else {
        throw LibraryError.deallocated(objectName: "HybridNitroPlayer").error()
      }

      self.cancelPendingTrim()

      if !self.hasActiveSource || self.playerItem != nil {
        return
      }

      do {
        try await self.prepareBufferedState()
      } catch {
        if error is CancellationError {
          throw PlayerError.cancelled.error()
        }
        throw error
      }
    }
  }

  func release() {
    if isReleased { return }
    isReleased = true
    hasActiveSource = false
    lastError = nil

    cancelPendingTrim()
    sourceLoader.cancelSync()
    initTask?.cancel()
    initTask = nil
    artworkTask?.cancel()
    artworkTask = nil

    try? _eventEmitter?.clearAllListeners()

    self.playerItem = nil
    self.readyToDisplay = false

    if let source = self.source as? HybridNitroPlayerSource {
      source.trimToCold()
    }

    // Clear player observer
    playerObserver?.invalidatePlayerItemObservers()
    playerObserver?.invalidatePlayerObservers()
    self.playerObserver = nil

    self.replaceCurrentItem(nil)
    status = .idle

    NitroPlayerManager.shared.unregister(player: self)
  }

  func preload() throws -> NitroModules.Promise<Void> {
    let promise = Promise<Void>()
    cancelPendingTrim()

    if !hasActiveSource {
      promise.resolve(withResult: ())
      return promise
    }

    switch resolvedPreloadLevel() {
    case .none:
      promise.resolve(withResult: ())
    case .metadata:
      Task.detached(priority: .utility) { [weak self] in
        guard let self else {
          promise.reject(
            withError: LibraryError.deallocated(objectName: "HybridNitroPlayer").error()
          )
          return
        }

        do {
          try await (self.source as? HybridNitroPlayerSource)?.warmMetadata()
          promise.resolve(withResult: ())
        } catch {
          promise.reject(withError: error)
        }
      }
    case .buffered:
      Task.detached(priority: .userInitiated) { [weak self] in
        guard let self else {
          promise.reject(
            withError: LibraryError.deallocated(objectName: "HybridNitroPlayer")
              .error()
          )
          return
        }

        do {
          try await self.prepareBufferedState()
          promise.resolve(withResult: ())
        } catch {
          if error is CancellationError {
            promise.reject(withError: PlayerError.cancelled.error())
          } else {
            promise.reject(withError: error)
          }
        }
      }
    }

    return promise
  }

  func play() throws {
    guard !isReleased else { return }
    cancelPendingTrim()
    NitroPlayerManager.shared.touchFeedHotCandidate(self)

    guard hasActiveSource else {
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

    status = .loading
    readyToDisplay = false
    resetPlaybackError()
    emitPlaybackState()

    Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }

      do {
        try await self.prepareBufferedState()
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased else { return }
          self.player.play()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.isReleased else { return }
          self.status = .error
          self.setPlaybackError(code: .unknownUnknown, message: error.localizedDescription)
          self.emitPlaybackState()
        }
      }
    }
  }

  func pause() throws {
    guard !isReleased else { return }
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

  func replaceSourceAsync(source: any HybridNitroPlayerSourceSpec) throws -> Promise<Void> {
    let promise = Promise<Void>()
    Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else {
        promise.reject(
          withError: LibraryError.deallocated(objectName: "HybridNitroPlayer")
            .error()
        )
        return
      }

      await self.sourceLoader.cancel()

      if let oldSource = self.source as? HybridNitroPlayerSource {
        oldSource.trimToCold()
      }

      self.initTask?.cancel()
      self.initTask = nil
      self.artworkTask?.cancel()
      self.artworkTask = nil
      self.source = source
      self.hasActiveSource = true
      self.resumePositionSeconds = 0
      self.resetPlaybackError()

      do {
        try await self.prepareBufferedState()
        promise.resolve(withResult: ())
      } catch {
        if error is CancellationError {
          promise.reject(withError: PlayerError.cancelled.error())
        } else {
          promise.reject(withError: error)
        }
      }
    }

    return promise
  }

  func clearSourceAsync() throws -> Promise<Void> {
    let promise = Promise<Void>()
    clearCurrentSource()
    promise.resolve(withResult: ())
    return promise
  }

  // MARK: - Methods

  func initializePlayerItem() async throws -> AVPlayerItem {
    // Ensure the source is a valid HybridNitroPlayerSource
    guard let _hybridSource = source as? HybridNitroPlayerSource else {
      status = .error
      throw PlayerError.invalidSource.error()
    }

    let _source = _hybridSource

    let isNetworkSource = _source.url.isFileURL == false
    _eventEmitter?.onLoadStart(
      .init(sourceType: isNetworkSource ? .network : .local, source: _source)
    )

    let asset = try await _source.getAsset()

    let playerItem = AVPlayerItem(asset: asset)
    _source.retentionState = .hot

    if let metadata = currentSourceConfig()?.metadata {
      let title = metadata.title
      let artist = metadata.artist
      let imageUri = metadata.imageUri

      DispatchQueue.main.async { [weak playerItem] in
        guard let playerItem else { return }
        var items: [AVMetadataItem] = []

        if let title {
          items.append(.make(identifier: .commonIdentifierTitle, value: title as NSString))
        }
        if let artist {
          items.append(.make(identifier: .commonIdentifierArtist, value: artist as NSString))
        }
        if !items.isEmpty {
          playerItem.externalMetadata = items
        }
      }

      // Load artwork in background to not block player initialization
      if let imageUri, let imageUrl = URL(string: imageUri) {
        artworkTask = Task { [weak playerItem] in
          guard let (data, _) = try? await URLSession.shared.data(from: imageUrl) else {
            playerLogger.debug("Failed to load artwork from: \(imageUrl)")
            return
          }
          DispatchQueue.main.async {
            guard let playerItem else { return }
            playerItem.externalMetadata = playerItem.externalMetadata + [.make(identifier: .commonIdentifierArtwork, value: data as NSData)]
          }
        }
      } else if let imageUri {
        playerLogger.debug("Invalid imageUri for artwork: \(imageUri)")
      }
    }

    return playerItem
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

  private func resolvedPreloadLevel() -> PreloadLevel {
    guard hasActiveSource else {
      return .none
    }
    currentSourceConfig()?.advanced?.lifecycle?.preloadLevel ?? {
      switch currentSourceConfig()?.lifecycle ?? .balanced {
      case .feed:
        return .metadata
      case .balanced, .immersive:
        return .buffered
      }
    }()
  }

  private func resolvedOffscreenRetention() -> OffscreenRetention {
    guard hasActiveSource else {
      return .hot
    }
    currentSourceConfig()?.advanced?.lifecycle?.offscreenRetention ?? {
      switch currentSourceConfig()?.lifecycle ?? .balanced {
      case .feed:
        return .metadata
      case .balanced, .immersive:
        return .hot
      }
    }()
  }

  private func resolvedPauseTrimDelayMs() -> Double? {
    let delayMs = currentSourceConfig()?.advanced?.lifecycle?.trimDelayMs ?? {
      switch currentSourceConfig()?.lifecycle ?? .balanced {
      case .feed:
        return 3000.0
      case .balanced:
        return 10000.0
      case .immersive:
        return Double.infinity
      }
    }()
    if delayMs.isInfinite {
      return nil
    }
    return max(0, delayMs)
  }

  private func currentRetentionState() -> MemoryRetentionState {
    guard hasActiveSource else {
      return .cold
    }
    (source as? HybridNitroPlayerSource)?.retentionState ?? .cold
  }

  private func clearCurrentSource() {
    guard !isReleased else { return }

    cancelPendingTrim()
    sourceLoader.cancelSync()
    initTask?.cancel()
    initTask = nil
    artworkTask?.cancel()
    artworkTask = nil

    if let source = self.source as? HybridNitroPlayerSource {
      source.trimToCold()
    }

    hasActiveSource = false
    resumePositionSeconds = 0
    player.pause()
    playerItem = nil
    readyToDisplay = false
    isCurrentlyBuffering = false
    resetPlaybackError()
    replaceCurrentItem(nil)
    status = .idle
    emitPlaybackState()
  }

  private func prepareBufferedState() async throws {
    guard hasActiveSource else {
      return
    }

    let activeSource = source
    status = .loading
    readyToDisplay = false
    resetPlaybackError()
    emitPlaybackState()
    let playerItem = try await self.sourceLoader.load {
      try await self.initializePlayerItem()
    }
    let resumeSeconds = resumePositionSeconds
    await MainActor.run { [weak self] in
      guard let self, !self.isReleased, self.hasActiveSource else { return }
      guard (activeSource as AnyObject) === (self.source as AnyObject) else { return }
      self.playerItem = playerItem
      self.player.replaceCurrentItem(with: playerItem)
      if resumeSeconds > 0 {
        let time = CMTime(seconds: resumeSeconds, preferredTimescale: 1000)
        self.player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
      }
    }
  }

  private func cancelPendingTrim() {
    pendingTrimWorkItem?.cancel()
    pendingTrimWorkItem = nil
  }

  private func scheduleOffscreenTrim() {
    cancelPendingTrim()

    if resolvedOffscreenRetention() == .hot {
      return
    }

    guard let delayMs = resolvedPauseTrimDelayMs() else {
      return
    }

    let workItem = DispatchWorkItem { [weak self] in
      self?.trimToConfiguredRetentionIfNeeded()
    }
    pendingTrimWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + (delayMs / 1000), execute: workItem)
  }

  private func trimToConfiguredRetentionIfNeeded() {
    pendingTrimWorkItem = nil

    if isReleased || isAttachedToVideoView || isPlaying {
      return
    }

    switch resolvedOffscreenRetention() {
    case .hot:
      return
    case .metadata:
      trimToMetadataRetention()
    case .cold:
      trimToColdRetention()
    }
  }

  private func trimToMetadataRetention() {
    guard hasActiveSource else { return }
    resumePositionSeconds = currentTime.isNaN ? 0 : currentTime
    player.pause()
    playerItem = nil
    readyToDisplay = false
    replaceCurrentItem(nil)
    status = .idle
    (source as? HybridNitroPlayerSource)?.trimToMetadata()
    resetPlaybackError()
    emitPlaybackState()
  }

  private func trimToColdRetention() {
    trimToMetadataRetention()
    (source as? HybridNitroPlayerSource)?.trimToCold()
  }

  func isFeedProfile() -> Bool {
    guard hasActiveSource else {
      return false
    }
    currentSourceConfig()?.lifecycle == .feed
  }

  func shouldStayHotInFeedPool() -> Bool {
    if isReleased {
      return false
    }

    return isPlaying || isAttachedToVideoView
  }

  func trimForFeedHotPool() {
    let apply = { [weak self] in
      guard let self else { return }
      guard
        !self.isReleased,
        self.isFeedProfile(),
        !self.shouldStayHotInFeedPool(),
        self.currentRetentionState() == .hot
      else {
        return
      }

      self.trimToMetadataRetention()
    }

    if Thread.isMainThread {
      apply()
    } else {
      DispatchQueue.main.async(execute: apply)
    }
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
