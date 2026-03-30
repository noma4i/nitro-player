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
    isReleased = true
    wantsToPlay = false
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

  func replaceSourceAsync(source: any HybridNitroPlayerSourceSpec) throws -> Promise<Void> {
    wantsToPlay = false
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
            return
          }
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
    return currentSourceConfig()?.advanced?.lifecycle?.preloadLevel ?? {
      switch currentSourceConfig()?.lifecycle ?? .balanced {
      case .feed:
        return .metadata
      case .balanced, .immersive:
        return .buffered
      }
    }()
  }

  func resolvedOffscreenRetention() -> OffscreenRetention {
    guard hasActiveSource else {
      return .hot
    }
    return currentSourceConfig()?.advanced?.lifecycle?.offscreenRetention ?? {
      switch currentSourceConfig()?.lifecycle ?? .balanced {
      case .feed:
        return .metadata
      case .balanced, .immersive:
        return .hot
      }
    }()
  }

  func resolvedPauseTrimDelayMs() -> Double? {
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

  func currentRetentionState() -> MemoryRetentionState {
    guard hasActiveSource else {
      return .cold
    }
    return (source as? HybridNitroPlayerSource)?.retentionState ?? .cold
  }

  func clearCurrentSource() {
    guard !isReleased else { return }
    wantsToPlay = false

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

  func prepareBufferedState() async throws {
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
      guard let self else {
        return
      }
      guard !self.isReleased else {
        return
      }
      guard self.hasActiveSource else {
        return
      }
      guard (activeSource as AnyObject) === (self.source as AnyObject) else {
        return
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
    player.pause()
    playerItem = nil
    readyToDisplay = false
    replaceCurrentItem(nil)
    status = .idle
    (source as? HybridNitroPlayerSource)?.trimToMetadata()
    resetPlaybackError()
    emitPlaybackState()
  }

  func trimToColdRetention() {
    trimToMetadataRetention()
    (source as? HybridNitroPlayerSource)?.trimToCold()
  }

  func isFeedProfile() -> Bool {
    guard hasActiveSource else {
      return false
    }
    return currentSourceConfig()?.lifecycle == .feed
  }

  func shouldStayHotInFeedPool() -> Bool {
    if isReleased {
      return false
    }

    return isPlaying || isAttachedToVideoView || wantsToPlay
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
}
