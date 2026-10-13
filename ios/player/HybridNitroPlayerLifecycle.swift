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

      let target = self.mainThreadExecutor.run { [weak self] () -> (HybridNitroPlayerSource, Int)? in
        guard let self else {
          return nil
        }

        self.cancelPendingTrim()
        self.cancelStartupRecovery()
        self.cancelPreparationTask()

        guard !self.isReleased,
              self.hasActiveSource,
              self.playerItem == nil,
              let activeSource = self.currentHybridSource() else {
          return nil
        }
        return (activeSource, self.sourceGeneration)
      }
      guard let (activeSource, generation) = target else {
        return
      }

      do {
        try await self.prepareBufferedState(
          expectedSource: activeSource,
          expectedGeneration: generation
        )
      } catch {
        if error is CancellationError {
          throw PlayerError.cancelled.error()
        }
        throw error
      }
    }
  }

  func release() {
    // Synchronous, thread-safe part only: after release() returns (on any thread,
    // including the JS thread), the player observes isReleased == true and its
    // unregistration is initiated (off-main callers: applied on the next main-queue
    // drain; enumeration loops guard on isReleased). The AVFoundation teardown below
    // must NOT run under a cross-thread main.sync: main can be blocked inside
    // MediaToolbox by a concurrent item invalidation, and a sync bridge here freezes
    // the caller with it.
    guard lifecycleGate.markReleased() else { return }
    NitroPlayerManager.shared.unregister(player: self)

    // Strong self keeps the instance alive until the deferred teardown completes;
    // deinit therefore cannot start while this block is pending.
    mainThreadExecutor.runAsync { [self] in
      try? self.clearPlayback()
      self.playbackAudioSessionBinding.release()
      self.clearAttachedVideoViews()
      self.wantsToPlay = false
      self.hasActiveSource = false
      self.lastError = nil

      self.cancelPendingTrim()
      self.cancelStartupRecovery()
      self.cancelPlaybackWatchdog()
      self.sourceLoader.cancelDetached()
      self.cancelPreparationTask()

      try? self._eventEmitter?.clearAllListeners()

      self.playerItem = nil
      self.readyToDisplay = false
      self.resetPlaybackMetrics()

      if let source = self.currentHybridSource() {
        source.trimToCold()
      }

      // Clear player observer
      self.playerObserver?.invalidatePlayerItemObservers()
      self.playerObserver?.invalidatePlayerObservers()
      self.playerObserver = nil

      self.replaceCurrentItem(nil)
      self.status = .idle
    }
  }

  func preload() throws -> NitroModules.Promise<Void> {
    let promise = Promise<Void>()
    let target = mainThreadExecutor.run { [weak self] () -> (PreloadLevel, HybridNitroPlayerSource, Int)? in
      guard let self else {
        return nil
      }

      self.cancelPendingTrim()
      guard !self.isReleased,
            self.hasActiveSource,
            let activeSource = self.currentHybridSource() else {
        return nil
      }
      return (self.resolvedPreloadLevel(), activeSource, self.sourceGeneration)
    }
    guard let (level, activeSource, generation) = target else {
      promise.resolve(withResult: ())
      return promise
    }

    switch level {
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

        let shouldWarm = self.mainThreadExecutor.run { [weak self] in
          guard let self,
                !self.isReleased,
                self.sourceGeneration == generation,
                let currentSource = self.currentHybridSource(),
                (activeSource as AnyObject) === (currentSource as AnyObject) else {
            return false
          }
          return true
        }
        guard shouldWarm else {
          promise.resolve(withResult: ())
          return
        }

        do {
          try await activeSource.warmMetadata()
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
          try await self.prepareBufferedState(
            expectedSource: activeSource,
            expectedGeneration: generation
          )
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
      // clearCurrentSource pauses the player and invalidates the current item live;
      // hop via MainActor.run instead of a thread-blocking sync bridge.
      let activation = await MainActor.run { () -> (SourceActivationAction, HybridNitroPlayerSource?)? in
        guard self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation) else {
          return nil
        }

        self.clearCurrentSource(beginGeneration: false)
        self.sourceStorage = source
        self.hasActiveSource = true
        self.resumePositionSeconds = 0
        self.resetPlaybackMetrics()
        self.readyToDisplay = false
        self.isCurrentlyBuffering = false
        self.status = .idle
        self.resetPlaybackError()
        let action = SourceActivationPolicy.resolve(
          startup: self.resolvedInitialization(),
          preload: self.resolvedPreloadLevel(),
          shouldAutoPlay: command.shouldAutoPlay
        )
        self.emitPlaybackState()
        return (action, self.currentHybridSource())
      }
      guard let (action, activeSource) = activation else {
        promise.resolve(withResult: ())
        return
      }

      do {
        switch action {
        case .idle:
          break
        case .metadata:
          let shouldWarm = self.mainThreadExecutor.run {
            self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation)
          }
          if shouldWarm {
            try await activeSource?.warmMetadata()
          }
        case .buffered:
          guard let activeSource else {
            break
          }
          try await self.prepareBufferedState(
            expectedSource: activeSource,
            expectedGeneration: command.generation
          )
        case .play:
          await MainActor.run { [weak self] in
            guard let self, self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation) else { return }
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

    // clearCurrentSource pauses the player and invalidates the current item live;
    // run it on main without blocking the calling (JS) thread. The generation guard
    // keeps ordering against a concurrent replaceSourceAsync correct.
    Task { @MainActor [weak self] in
      if let self, self.lifecycleGate.shouldDeliverCallback(capturedGeneration: command.generation) {
        self.clearCurrentSource(beginGeneration: false)
      }
      promise.resolve(withResult: ())
    }
    return promise
  }

  private func buildPlayerItem(
    source: HybridNitroPlayerSource,
    sourceGeneration: Int
  ) async throws -> AVPlayerItem {
    let shouldLoad = mainThreadExecutor.run { [weak self] in
      guard let self,
            !self.isReleased,
            self.sourceGeneration == sourceGeneration,
            let currentSource = self.currentHybridSource(),
            (source as AnyObject) === (currentSource as AnyObject) else {
        return false
      }

      let isNetworkSource = source.url.isFileURL == false
      self._eventEmitter?.onLoadStart(
        .init(sourceType: isNetworkSource ? .network : .local, source: source)
      )
      return true
    }
    guard shouldLoad else {
      throw CancellationError()
    }

    let asset = try await source.getAsset()
    let playerItem = AVPlayerItem(asset: asset)
    try source.markHot(asset: asset)
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

  func clearCurrentSource(beginGeneration: Bool = true) {
    guard !isReleased else { return }
    wantsToPlay = false
    playbackAudioSessionBinding.pause()
    cancelStartupRecovery()
    if beginGeneration {
      beginSourceGeneration()
    }

    cancelPendingTrim()
    sourceLoader.cancelDetached()
    cancelPreparationTask()

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

  func prepareBufferedState(
    recreatePlayer: Bool = false,
    expectedSource: HybridNitroPlayerSource,
    expectedGeneration: Int,
    expectedPlaybackPreparationTicket: PlaybackPreparationTicket? = nil
  ) async throws {
    let capturedSource = mainThreadExecutor.run { [weak self] () -> (HybridNitroPlayerSource, Int)? in
      guard let self,
            !self.isReleased,
            self.hasActiveSource,
            let activeSource = self.currentHybridSource() else {
        return nil
      }

      if let expectedPlaybackPreparationTicket,
         !self.isPlaybackPreparationTicketCurrent(expectedPlaybackPreparationTicket) {
        return nil
      }

      guard (activeSource as AnyObject) === (expectedSource as AnyObject),
            self.sourceGeneration == expectedGeneration else {
        return nil
      }

      let sourceGeneration = expectedGeneration
      self.status = .loading
      self.readyToDisplay = false
      self.updateCachedProgress(currentTime: self.resumePositionSeconds, bufferDuration: 0)
      self.resetPlaybackError()
      self.emitPlaybackState()
      return (activeSource, sourceGeneration)
    }
    guard let (activeSource, sourceGeneration) = capturedSource else {
      return
    }

    let playerItem = try await self.sourceLoader.load {
      try await self.buildPlayerItem(source: activeSource, sourceGeneration: sourceGeneration)
    }

    let shouldCommit = mainThreadExecutor.run { [weak self] in
      guard let self else { return false }
      guard let expectedPlaybackPreparationTicket else { return true }
      return self.isPlaybackPreparationTicketCurrent(expectedPlaybackPreparationTicket)
    }
    guard shouldCommit else {
      return
    }

    // MainActor.run suspends this task until the commit has executed on main without
    // blocking any OS thread: a cross-thread main.sync here can freeze the caller if
    // main is stalled inside MediaToolbox by a concurrent item invalidation.
    await MainActor.run { [weak self] in
      guard let self else {
        return
      }
      if let expectedPlaybackPreparationTicket,
         !self.isPlaybackPreparationTicketCurrent(expectedPlaybackPreparationTicket) {
        return
      }
      guard !self.isReleased else {
        return
      }
      guard self.sourceGeneration == sourceGeneration else {
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
      let resumeSeconds = self.resumePositionSeconds
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
    playbackAudioSessionBinding.pause()
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
      isExternalPlaybackActive: player.isExternalPlaybackActive == true
    )
  }

  func appStateSnapshot() -> PlayerAppStateSnapshot {
    PlayerAppStateSnapshot(
      playInBackground: playInBackground,
      playWhenInactive: playWhenInactive,
      isPlaying: isPlaying,
      wasAutoPaused: wasAutoPaused,
      isExternalPlaybackActive: player.isExternalPlaybackActive == true,
      wantsToPlay: wantsToPlay
    )
  }
}
