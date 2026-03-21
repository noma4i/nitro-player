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
      if let bufferConfig = source.config.bufferConfig {
        playerItem?.setBufferConfig(config: bufferConfig)
      }
    }
  }
  var playerObserver: NitroPlayerObserver?
  private let sourceLoader = SourceLoader()
  private var artworkTask: Task<Void, Never>?
  private var initTask: Task<Void, Never>?
  private var isReleased = false
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

    DispatchQueue.main.sync(execute: apply)
  }

  init(source: (any HybridNitroPlayerSourceSpec)) throws {
    self.source = source
    self.eventEmitter = HybridNitroPlayerEventEmitter()

    // Initialize AVPlayer with empty item
    self.player = AVPlayer()

    super.init()
    self.playerObserver = NitroPlayerObserver(delegate: self)
    self.playerObserver?.initializePlayerObservers()

    initTask = Task { [weak self] in
      guard let self else { return }
      if source.config.initializeOnCreation == true {
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
      userVolume = Float(newValue)
      player.volume = Float(newValue)
    }
    get {
      return Double(player.volume)
    }
  }

  var muted: Bool {
    set {
      if newValue {
        userVolume = player.volume
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
      return player.isMuted
    }
  }

  var currentTime: Double {
    set {
      resumePositionSeconds = max(0, newValue)

      guard player.currentItem != nil else {
        emitPlaybackState()
        return
      }

      player.seek(
        to: CMTime(seconds: resumePositionSeconds, preferredTimescale: 1000),
        toleranceBefore: .zero,
        toleranceAfter: .zero
      ) { [weak self] _ in
        self?.emitPlaybackState()
      }
    }
    get {
      if player.currentItem == nil {
        return resumePositionSeconds
      }

      return player.currentTime().seconds
    }
  }

  var duration: Double {
    Double(player.currentItem?.duration.seconds ?? Double.nan)
  }

  var bufferDuration: Double {
    player.currentItem?.getbufferDuration() ?? 0
  }

  var bufferedPosition: Double {
    currentTime + bufferDuration
  }

  var rate: Double {
    set {
      if #available(iOS 16.0, tvOS 16.0, *) {
        player.defaultRate = Float(newValue)
      }

      player.rate = Float(newValue)
    }
    get {
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
    return player.rate != 0
  }

  var isBuffering: Bool {
    status == .buffering
  }

  var isReadyToDisplay: Bool {
    readyToDisplay
  }

  var playbackState: PlaybackState {
    PlaybackState(
      status: status,
      currentTime: currentTime,
      duration: duration,
      bufferDuration: bufferDuration,
      bufferedPosition: bufferedPosition,
      rate: rate,
      isPlaying: isPlaying,
      isBuffering: isBuffering,
      isReadyToDisplay: readyToDisplay,
      nativeTimestampMs: Date().timeIntervalSince1970 * 1000
    )
  }

  var showNotificationControls: Bool = false

  var memorySnapshot: MemorySnapshot {
    let playerBytes = player.currentItem == nil ? 0 : max(bufferDuration * 256_000, 64_000)
    let sourceBytes = Double((source as? HybridNitroPlayerSource)?.memorySize ?? 0)

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

      if self.playerItem != nil {
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
    cancelPendingTrim()
    NitroPlayerManager.shared.touchFeedHotCandidate(self)

    if player.currentItem != nil {
      player.play()
      return
    }

    status = .loading
    readyToDisplay = false
    emitPlaybackState()

    Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }

      do {
        try await self.prepareBufferedState()
        DispatchQueue.main.async { [weak self] in
          self?.player.play()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          self?.status = .error
          self?.emitPlaybackState()
        }
      }
    }
  }

  func pause() throws {
    player.pause()
    NitroPlayerManager.shared.touchFeedHotCandidate(self)

    if !isAttachedToVideoView {
      scheduleOffscreenTrim()
    }
  }

  func seekBy(time: Double) throws {
    guard let currentItem = player.currentItem else {
      throw PlayerError.notInitialized.error()
    }

    let currentItemTime = currentItem.currentTime()

    // Duration is NaN for live streams
    let fixedDurration = duration.isNaN ? Double.infinity : duration

    // Clap by <0, duration>
    let newTime = max(0, min(currentItemTime.seconds + time, fixedDurration))

    currentTime = newTime
  }

  func seekTo(time: Double) {
    currentTime = time
  }

  func replaceSourceAsync(
    source: Variant_NullType__any_HybridNitroPlayerSourceSpec_?
  ) throws
    -> Promise<Void>
  {
    let promise = Promise<Void>()

    /**
     @frozen
     public indirect enum Variant_NullType__any_HybridNitroPlayerSourceSpec_ {
       case first(NullType)
       case second((any HybridNitroPlayerSourceSpec))
     }
     */

    // if source is nil, release player
    // if source is not NullType, set source
    guard let source else {
      release()
      promise.resolve(withResult: ())
      return promise
    }

    switch source {
    case .first(_):
      release()
      promise.resolve(withResult: ())
      return promise
    case .second(let newSource):
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
        self.source = newSource
        self.resumePositionSeconds = 0

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

    if let metadata = source.config.metadata {
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
    source.config.memoryConfig?.preloadLevel ?? .buffered
  }

  private func resolvedOffscreenRetention() -> OffscreenRetention {
    source.config.memoryConfig?.offscreenRetention ?? .hot
  }

  private func resolvedPauseTrimDelayMs() -> Double? {
    let delayMs = source.config.memoryConfig?.pauseTrimDelayMs ?? 10000
    if delayMs.isInfinite {
      return nil
    }
    return max(0, delayMs)
  }

  private func currentRetentionState() -> MemoryRetentionState {
    (source as? HybridNitroPlayerSource)?.retentionState ?? .cold
  }

  private func prepareBufferedState() async throws {
    status = .loading
    readyToDisplay = false
    emitPlaybackState()
    let playerItem = try await self.sourceLoader.load {
      try await self.initializePlayerItem()
    }
    self.playerItem = playerItem
    self.replaceCurrentItem(playerItem)

    if resumePositionSeconds > 0 {
      let time = CMTime(seconds: resumePositionSeconds, preferredTimescale: 1000)
      DispatchQueue.main.async { [weak self] in
        self?.player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
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
    resumePositionSeconds = currentTime.isNaN ? 0 : currentTime
    player.pause()
    playerItem = nil
    readyToDisplay = false
    replaceCurrentItem(nil)
    status = .idle
    (source as? HybridNitroPlayerSource)?.trimToMetadata()
    emitPlaybackState()
  }

  private func trimToColdRetention() {
    trimToMetadataRetention()
    (source as? HybridNitroPlayerSource)?.trimToCold()
  }

  func isFeedProfile() -> Bool {
    source.config.memoryConfig?.profile == .feed
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
