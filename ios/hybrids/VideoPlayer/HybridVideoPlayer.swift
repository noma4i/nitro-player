//
//  HybridVideoPlayer.swift
//  JustPlayer
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import AVFoundation
import Foundation
import NitroModules

class HybridVideoPlayer: HybridVideoPlayerSpec, NativeVideoPlayerSpec {

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
  var playerObserver: VideoPlayerObserver?
  private let sourceLoader = SourceLoader()
  private var artworkTask: Task<Void, Never>?
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

  init(source: (any HybridVideoPlayerSourceSpec)) throws {
    self.source = source
    self.eventEmitter = HybridVideoPlayerEventEmitter()

    // Initialize AVPlayer with empty item
    self.player = AVPlayer()

    super.init()
    self.playerObserver = VideoPlayerObserver(delegate: self)
    self.playerObserver?.initializePlayerObservers()

    Task { [weak self] in
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
            try await (self.source as? HybridVideoPlayerSource)?.warmMetadata()
          } catch {
            // Ignore cancellation errors during initialization
          }
        case .none:
          break
        }
      }
    }

    VideoManager.shared.register(player: self)
  }

  deinit {
    release()
  }

  // MARK: - Hybrid Impl

  var source: any HybridVideoPlayerSourceSpec

  var status: VideoPlayerStatus = .idle

  var eventEmitter: HybridVideoPlayerEventEmitterSpec
  var _eventEmitter: HybridVideoPlayerEventEmitter? {
    return eventEmitter as? HybridVideoPlayerEventEmitter
  }

  var volume: Double {
    set {
      player.volume = Float(newValue)
    }
    get {
      return Double(player.volume)
    }
  }

  var muted: Bool {
    set {
      player.isMuted = newValue
      _eventEmitter?.onVolumeChange(
        onVolumeChangeData(
          volume: Double(player.volume),
          muted: muted
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

  var mixAudioMode: MixAudioMode = .auto {
    didSet {
      VideoManager.shared.requestAudioSessionUpdate()
    }
  }

  var ignoreSilentSwitchMode: IgnoreSilentSwitchMode = .auto {
    didSet {
      VideoManager.shared.requestAudioSessionUpdate()
    }
  }

  var playInBackground: Bool = false {
    didSet {
      VideoManager.shared.requestAudioSessionUpdate()
    }
  }

  var playWhenInactive: Bool = false

  var wasAutoPaused: Bool = false

  // Text track selection state
  private var selectedExternalTrackIndex: Int? = nil

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
    let sourceBytes = Double((source as? HybridVideoPlayerSource)?.memorySize ?? 0)

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
        throw LibraryError.deallocated(objectName: "HybridVideoPlayer").error()
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
    artworkTask?.cancel()
    artworkTask = nil

    try? _eventEmitter?.clearAllListeners()

    self.playerItem = nil
    self.readyToDisplay = false

    if let source = self.source as? HybridVideoPlayerSource {
      source.trimToCold()
    }

    // Clear player observer
    playerObserver?.invalidatePlayerItemObservers()
    playerObserver?.invalidatePlayerObservers()
    self.playerObserver = nil

    self.replaceCurrentItem(nil)
    status = .idle

    VideoManager.shared.unregister(player: self)
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
            withError: LibraryError.deallocated(objectName: "HybridVideoPlayer").error()
          )
          return
        }

        do {
          try await (self.source as? HybridVideoPlayerSource)?.warmMetadata()
          promise.resolve(withResult: ())
        } catch {
          promise.reject(withError: error)
        }
      }
    case .buffered:
      Task.detached(priority: .userInitiated) { [weak self] in
        guard let self else {
          promise.reject(
            withError: LibraryError.deallocated(objectName: "HybridVideoPlayer")
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
    source: Variant_NullType__any_HybridVideoPlayerSourceSpec_?
  ) throws
    -> Promise<Void>
  {
    let promise = Promise<Void>()

    /**
     @frozen
     public indirect enum Variant_NullType__any_HybridVideoPlayerSourceSpec_ {
       case first(NullType)
       case second((any HybridVideoPlayerSourceSpec))
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
            withError: LibraryError.deallocated(objectName: "HybridVideoPlayer")
              .error()
          )
          return
        }

        await self.sourceLoader.cancel()

        if let oldSource = self.source as? HybridVideoPlayerSource {
          oldSource.trimToCold()
        }

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
    // Ensure the source is a valid HybridVideoPlayerSource
    guard let _hybridSource = source as? HybridVideoPlayerSource else {
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
            print("[RNV] Failed to load artwork from: \(imageUrl)")
            return
          }
          DispatchQueue.main.async {
            guard let playerItem else { return }
            playerItem.externalMetadata = playerItem.externalMetadata + [.make(identifier: .commonIdentifierArtwork, value: data as NSData)]
          }
        }
      } else if let imageUri {
        print("[RNV] Invalid imageUri for artwork: \(imageUri)")
      }
    }

    return playerItem
  }

  func notifyViewAttached() {
    isAttachedToVideoView = true
    cancelPendingTrim()
  }

  func notifyViewDetached() {
    isAttachedToVideoView = false

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
    (source as? HybridVideoPlayerSource)?.retentionState ?? .cold
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
    (source as? HybridVideoPlayerSource)?.trimToMetadata()
    emitPlaybackState()
  }

  private func trimToColdRetention() {
    trimToMetadataRetention()
    (source as? HybridVideoPlayerSource)?.trimToCold()
  }

  // MARK: - Text Track Management

  func getAvailableTextTracks() throws -> [TextTrack] {
    guard let currentItem = player.currentItem else {
      return []
    }

    var tracks: [TextTrack] = []

    if let mediaSelection = currentItem.asset.mediaSelectionGroup(
      forMediaCharacteristic: .legible
    ) {
      for (index, option) in mediaSelection.options.enumerated() {
        let isSelected =
          currentItem.currentMediaSelection.selectedMediaOption(
            in: mediaSelection
          ) == option

        let name =
          option.commonMetadata.first(where: { $0.commonKey == .commonKeyTitle }
          )?.stringValue
          ?? option.displayName

        let isExternal =
          source.config.externalSubtitles?.contains { subtitle in
            name.contains(subtitle.label)
          } ?? false

        let trackId =
          isExternal
          ? "external-\(index)"
          : "builtin-\(option.displayName)-\(option.locale?.identifier ?? "unknown")"

        tracks.append(
          TextTrack(
            id: trackId,
            label: option.displayName,
            language: option.locale?.identifier,
            selected: isSelected
          )
        )
      }
    }

    return tracks
  }

  func selectTextTrack(textTrack: Variant_NullType_TextTrack?) throws {
    guard let currentItem = player.currentItem else {
      throw PlayerError.notInitialized.error()
    }

    guard
      let mediaSelection = currentItem.asset.mediaSelectionGroup(
        forMediaCharacteristic: .legible
      )
    else {
      return
    }

    // If textTrack is nil, deselect any selected track
    guard let textTrack = textTrack else {
      currentItem.select(nil, in: mediaSelection)
      selectedExternalTrackIndex = nil
      _eventEmitter?.onTrackChange(nil)
      return
    }

    switch textTrack {
    case .first(_):
      currentItem.select(nil, in: mediaSelection)
      selectedExternalTrackIndex = nil
      _eventEmitter?.onTrackChange(nil)
      return
    case .second(let textTrack):
      // If textTrack id is empty, deselect any selected track
      if textTrack.id.isEmpty {
        currentItem.select(nil, in: mediaSelection)
        selectedExternalTrackIndex = nil
        _eventEmitter?.onTrackChange(nil)
        return
      }

      if textTrack.id.hasPrefix("external-") {
        let trackIndexStr = String(textTrack.id.dropFirst("external-".count))
        if let trackIndex = Int(trackIndexStr),
          trackIndex < mediaSelection.options.count
        {
          let option = mediaSelection.options[trackIndex]
          currentItem.select(option, in: mediaSelection)
          selectedExternalTrackIndex = trackIndex
          _eventEmitter?.onTrackChange(.second(textTrack))
        }
      } else if textTrack.id.hasPrefix("builtin-") {
        for option in mediaSelection.options {
          let optionId =
            "builtin-\(option.displayName)-\(option.locale?.identifier ?? "unknown")"
          if optionId == textTrack.id {
            currentItem.select(option, in: mediaSelection)
            selectedExternalTrackIndex = nil
            _eventEmitter?.onTrackChange(.second(textTrack))
            return
          }
        }
      }
    }
  }

  var selectedTrack: TextTrack? {
    guard let currentItem = player.currentItem else {
      return nil
    }

    guard
      let mediaSelection = currentItem.asset.mediaSelectionGroup(
        forMediaCharacteristic: .legible
      )
    else {
      return nil
    }

    guard
      let selectedOption = currentItem.currentMediaSelection
        .selectedMediaOption(in: mediaSelection)
    else {
      return nil
    }

    guard let index = mediaSelection.options.firstIndex(of: selectedOption)
    else {
      return nil
    }

    let isExternal =
      source.config.externalSubtitles?.contains { subtitle in
        selectedOption.displayName.contains(subtitle.label)
      } ?? false

    let trackId =
      isExternal
      ? "external-\(index)"
      : "builtin-\(selectedOption.displayName)-\(selectedOption.locale?.identifier ?? "unknown")"

    return TextTrack(
      id: trackId,
      label: selectedOption.displayName,
      language: selectedOption.locale?.identifier,
      selected: true
    )
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
