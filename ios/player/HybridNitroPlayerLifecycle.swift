//
//  HybridNitroPlayerLifecycle.swift
//  NitroPlay
//

import AVFoundation
import Foundation
import NitroModules

extension HybridNitroPlayer {

  func initialize() throws -> Promise<Void> {
    return Promise.async { [weak self] in
      guard let self else {
        throw LibraryError.deallocated(objectName: "HybridNitroPlayer").error()
      }

      self.cancelPendingTrim()
      self.cancelStartupRecovery()
      self.initTask?.cancel()
      self.initTask = nil

      if !self.hasActiveSource {
        return
      }
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
    lifecycleGate.markReleased()
    wantsToPlay = false
    hasActiveSource = false
    lastError = nil

    cancelPendingTrim()
    cancelStartupRecovery()
    cancelFirstFrameRequest()
    sourceLoader.cancelDetached()
    initTask?.cancel()
    initTask = nil
    artworkTask?.cancel()
    artworkTask = nil

    try? _eventEmitter?.clearAllListeners()

    self.playerItem = nil
    self.readyToDisplay = false
    self.resetPlaybackMetrics()

    if let source = self.currentHybridSource() {
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
          try await self.currentHybridSource()?.warmMetadata()
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

  func replaceSourceAsync(source: any HybridNitroPlayerSourceSpec) throws -> Promise<Void> {
    let command = beginSourceCommand(allowAutoPlay: true)
    let promise = Promise<Void>()
    Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else {
        promise.reject(
          withError: LibraryError.deallocated(objectName: "HybridNitroPlayer")
            .error()
        )
        return
      }
      guard let command else {
        promise.resolve(withResult: ())
        return
      }

      await self.sourceLoader.cancel()
      command.oldSource?.trimToCold()

      let accepted = await MainActor.run { () -> Bool in
        guard self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation) else {
          return false
        }

        self.performSourceGenerationReset(generation: command.generation)
        self.sourceStorage = source
        self.hasActiveSource = true
        self.resumePositionSeconds = 0
        self.resetPlaybackMetrics()
        self.readyToDisplay = false
        self.isCurrentlyBuffering = false
        self.status = .loading
        self.resetPlaybackError()
        self.emitPlaybackState()
        return true
      }
      guard accepted else {
        promise.resolve(withResult: ())
        return
      }

      do {
        try await self.prepareBufferedState()
        if command.shouldAutoPlay {
          await MainActor.run { [weak self] in
            guard let self, self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation) else { return }
            // currentItem is set by prepareBufferedState, so play() takes the
            // synchronous start path and re-asserts wantsToPlay.
            try? self.play()
          }
        }
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
    let command = beginSourceCommand(allowAutoPlay: false)
    let promise = Promise<Void>()
    guard let command else {
      promise.resolve(withResult: ())
      return promise
    }

    DispatchQueue.main.async { [weak self] in
      guard let self else {
        promise.reject(withError: LibraryError.deallocated(objectName: "HybridNitroPlayer").error())
        return
      }
      guard self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation) else {
        promise.resolve(withResult: ())
        return
      }
      self.clearCurrentSource(beginGeneration: false)
      promise.resolve(withResult: ())
    }
    return promise
  }

  func initializePlayerItem() async throws -> AVPlayerItem {
    // Ensure the source is a valid HybridNitroPlayerSource
    guard let _hybridSource = currentHybridSource() else {
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
      let subtitle = metadata.subtitle
      let artist = metadata.artist
      let imageUri = metadata.imageUri

      DispatchQueue.main.async { [weak playerItem] in
        guard let playerItem else { return }
        var items: [AVMetadataItem] = []

        if let title {
          items.append(.make(identifier: .commonIdentifierTitle, value: title as NSString))
        }
        if let subtitle {
          items.append(.make(identifier: .iTunesMetadataTrackSubTitle, value: subtitle as NSString))
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
            return
          }
          // lifecycle-audit:ignore(weak-captured-playerItem)
          DispatchQueue.main.async {
            guard let playerItem else { return }
            playerItem.externalMetadata = playerItem.externalMetadata + [.make(identifier: .commonIdentifierArtwork, value: data as NSData)]
          }
        }
      }
    }

    return playerItem
  }

  func resolvedPreloadLevel() -> PreloadLevel {
    guard hasActiveSource else {
      return .none
    }
    return currentSourceConfig()?.retention?.preload ?? .buffered
  }

  func resolvedOffscreenRetention() -> RetentionLevel {
    guard hasActiveSource else {
      return .hot
    }
    return currentSourceConfig()?.retention?.offscreen ?? .hot
  }

  func resolvedPauseTrimDelayMs() -> Double? {
    // parity: Android HybridNitroPlayerLifecycle DEFAULT_TRIM_DELAY_MS = 10000.
    let defaultTrimDelayMs = 10000.0
    let delayMs = currentSourceConfig()?.retention?.trimDelayMs ?? defaultTrimDelayMs
    if delayMs.isInfinite {
      return nil
    }
    return max(0, delayMs)
  }

  func currentRetentionState() -> RetentionLevel {
    guard hasActiveSource else {
      return .cold
    }
    return currentHybridSource()?.retentionState ?? .cold
  }

  func currentRetentionLevel() -> PlayerRetentionLevel {
    switch currentRetentionState() {
    case .cold:
      return .cold
    case .metadata:
      return .metadata
    case .hot:
      return .hot
    @unknown default:
      return .cold
    }
  }

  func clearCurrentSource(beginGeneration: Bool = true) {
    guard !isReleased else { return }
    wantsToPlay = false
    cancelStartupRecovery()
    if beginGeneration {
      beginSourceGeneration()
    }

    cancelPendingTrim()
    sourceLoader.cancelDetached()
    initTask?.cancel()
    initTask = nil
    artworkTask?.cancel()
    artworkTask = nil

    if let source = self.currentHybridSource() {
      source.trimToCold()
    }

    hasActiveSource = false
    sourceStorage = nil
    resumePositionSeconds = 0
    resetPlaybackMetrics()
    player.pause()
    playerItem = nil
    readyToDisplay = false
    isCurrentlyBuffering = false
    resetPlaybackError()
    replaceCurrentItem(nil)
    status = .idle
    emitPlaybackState()
  }

  func prepareBufferedState(recreatePlayer: Bool = false) async throws {
    guard hasActiveSource else {
      return
    }

    guard let activeSource = currentHybridSource() else {
      return
    }
    status = .loading
    readyToDisplay = false
    updateCachedProgress(currentTime: resumePositionSeconds, bufferDuration: 0)
    resetPlaybackError()
    emitPlaybackState()
    let playerItem = try await self.sourceLoader.load {
      try await self.initializePlayerItem()
    }
    let resumeSeconds = resumePositionSeconds
    await MainActor.run { [weak self] in
      guard let self else {
        return
      }
      guard !self.isReleased else {
        return
      }
      guard self.hasActiveSource else {
        return
      }
      guard let currentSource = self.currentHybridSource(),
            (activeSource as AnyObject) === (currentSource as AnyObject) else {
        return
      }
      if recreatePlayer {
        self.recreatePlayerForRecovery()
      }
      self.playerItem = playerItem
      self.player.replaceCurrentItem(with: playerItem)
      if resumeSeconds > 0 {
        let time = CMTime(seconds: resumeSeconds, preferredTimescale: 1000)
        self.player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
      }
    }
  }

  func cancelPendingTrim() {
    pendingTrimWorkItem?.cancel()
    pendingTrimWorkItem = nil
  }

  func scheduleOffscreenTrim() {
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

  func trimToConfiguredRetentionIfNeeded() {
    pendingTrimWorkItem = nil

    if isReleased || isAttachedToVideoView || isPlaying || wantsToPlay {
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

  func trimToMetadataRetention() {
    guard hasActiveSource else { return }
    resumePositionSeconds = currentTime.isNaN ? 0 : currentTime
    updateCachedProgress(currentTime: resumePositionSeconds, bufferDuration: 0)
    player.pause()
    updateCachedRate(0.0)
    playerItem = nil
    readyToDisplay = false
    replaceCurrentItem(nil)
    status = .idle
    currentHybridSource()?.trimToMetadata()
    resetPlaybackError()
    emitPlaybackState()
  }

  func trimToColdRetention() {
    trimToMetadataRetention()
    currentHybridSource()?.trimToCold()
  }

  func isFeedProfile() -> Bool {
    guard hasActiveSource else {
      return false
    }
    return currentSourceConfig()?.retention?.feedPoolEligible == true
  }

  func shouldStayHotInFeedPool() -> Bool {
    PlayerRetentionCoordinator.isPinnedForFeedPool(retentionSnapshot())
  }

  func shouldStayHotUnderResourcePressure() -> Bool {
    PlayerRetentionCoordinator.isPinnedForResourcePressure(retentionSnapshot())
  }

  func trimForFeedHotPool() {
    let apply = { [weak self] in
      guard let self else { return }
      guard
        !self.isReleased,
        self.isFeedProfile(),
        PlayerRetentionCoordinator.shouldTrimForFeedHotPool(self.retentionSnapshot())
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

  func trimForResourcePressure() {
    let apply = { [weak self] in
      guard let self else { return }
      guard PlayerRetentionCoordinator.shouldTrimForResourcePressure(self.retentionSnapshot()) else {
        return
      }

      self.trimToColdRetention()
    }

    if Thread.isMainThread {
      apply()
    } else {
      DispatchQueue.main.async(execute: apply)
    }
  }

  func retentionSnapshot() -> PlayerRetentionSnapshot {
    PlayerRetentionSnapshot(
      isReleased: isReleased,
      hasActiveSource: hasActiveSource,
      isPlaying: isPlaying,
      isAttachedToView: isAttachedToVideoView,
      wantsToPlay: wantsToPlay,
      isExternalPlaybackActive: player.isExternalPlaybackActive == true,
      isFeedPoolEligible: isFeedProfile(),
      retentionLevel: currentRetentionLevel()
    )
  }

  func appStateSnapshot() -> PlayerAppStateSnapshot {
    PlayerAppStateSnapshot(
      playInBackground: playInBackground,
      playWhenInactive: playWhenInactive,
      isPlaying: isPlaying,
      wasAutoPaused: wasAutoPaused,
      isExternalPlaybackActive: player.isExternalPlaybackActive == true
    )
  }
}
