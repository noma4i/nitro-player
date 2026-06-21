//
//  HybridNitroPlayerEvents.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 02/05/2025.
//

import AVFoundation
import Foundation

extension HybridNitroPlayer: NitroPlayerObserverDelegate {
  // MARK: - NitroPlayerObserverDelegate

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onPlayedToEnd(player: AVPlayer) {
    cancelStartupRecovery()
    wantsToPlay = false
    status = .ended
    resetPlaybackError()
    emitPlaybackState()

    if loop {
      currentTime = 0
      try? play()
    }
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onRateChanged(rate: Float) {
    updateAndEmitPlaybackState()
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onVolumeChanged(volume: Float) {
    _eventEmitter?.onVolumeChange(
      onVolumeChangeData(
        volume: Double(volume),
        muted: muted
      )
    )
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onPlaybackBufferEmpty() {
    enterBuffering()
    updateAndEmitPlaybackState()
  }

  // lifecycle-audit:ignore(guarded-by-periodic-observer-guard)
  func onProgressUpdate(currentTime: Double, bufferDuration: Double) {
    emitPlaybackState()
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onPlaybackLikelyToKeepUp() {
    isCurrentlyBuffering = false
    resetPlaybackError()
    if player.timeControlStatus != .waitingToPlayAtSpecifiedRate {
      status = resolvePlayPauseStatus()
    }
    updateAndEmitPlaybackState()
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onTimeControlStatusChanged(status: AVPlayer.TimeControlStatus) {
    if player.status == .failed || playerItem?.status == .failed {
      let message = player.error?.localizedDescription ?? playerItem?.error?.localizedDescription ?? "Unknown playback error"
      if attemptStartupRecoveryIfNeeded(message: message) {
        return
      }
      failPlayback(message: message)
      return
    }

    switch status {
    case .waitingToPlayAtSpecifiedRate:
      enterBuffering()
      break

    case .playing:
      isCurrentlyBuffering = false
      resetPlaybackError()
      self.status = .playing
      break

    case .paused:
      isCurrentlyBuffering = false
      resetPlaybackError()
      let resolved = resolvePlayPauseStatus()
      if self.status != .ended && self.status != .idle && resolved == .paused {
        self.status = .paused
      }
      break

    @unknown default:
      break
    }

    updateAndEmitPlaybackState()
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onPlayerStatusChanged(status: AVPlayer.Status) {
    if status == .failed || playerItem?.status == .failed {
      let message = player.error?.localizedDescription ?? playerItem?.error?.localizedDescription ?? "Unknown playback error"
      if attemptStartupRecoveryIfNeeded(message: message) {
        return
      }
      failPlayback(message: message)
    }
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onPlayerItemStatusChanged(status: AVPlayerItem.Status) {
    if status == .failed {
      let message = playerItem?.error?.localizedDescription ?? "Unknown playback error"
      if attemptStartupRecoveryIfNeeded(message: message) {
        return
      }
      failPlayback(message: message)
      return
    }

    switch status {
    case .unknown:
      isCurrentlyBuffering = true
      self.status = .loading
      readyToDisplay = false

      // Set initial buffering state when we have a playerItem
      if let playerItem = self.playerItem {
        if playerItem.isPlaybackBufferEmpty {
          isCurrentlyBuffering = true
        }
      }

    case .readyToPlay:
      guard let playerItem else { return }
      // Fire onLoad / first-frame only on the first ready of this source
      // generation; later READY transitions (rebuffer, seek) must not re-emit.
      let isFirstLoadForGeneration = !hasLoadedCurrentSource
      markCurrentSourceLoaded()
      resetPlaybackError()

      if isFirstLoadForGeneration {
        let height = playerItem.presentationSize.height
        let width = playerItem.presentationSize.width

        _eventEmitter?.onLoad(
          .init(currentTime, duration, height, width, .unknown)
        )

        if let asset = playerItem.asset as? AVURLAsset {
          let sourceUrl = currentHybridSource()?.previewSourceUri() ?? asset.url.absoluteString
          cacheFirstFrameContext(
            sourceUri: sourceUrl,
            width: width,
            height: height
          )
          requestFirstFrameIfNeeded()
        }
      }

      if playerItem.isPlaybackLikelyToKeepUp
        && !playerItem.isPlaybackBufferEmpty
      {
        isCurrentlyBuffering = false
        self.status = resolvePlayPauseStatus()
      }

    case .failed:
      let message = playerItem?.error?.localizedDescription ?? "Unknown playback error"
      if attemptStartupRecoveryIfNeeded(message: message) {
        return
      }
      failPlayback(message: message)
      return

    @unknown default:
      break
    }

    updateAndEmitPlaybackState()
  }

  // lifecycle-audit:ignore(guarded-by-notifyDelegate)
  func onBandwidthUpdate(bitrate: Double) {
    _eventEmitter?.onBandwidthUpdate(
      .init(bitrate: bitrate, width: nil, height: nil)
    )
  }

  // A fatal HTTP error on the initial HLS load (e.g. 401) is reported through the
  // AVPlayerItem error log without ever flipping AVPlayerItem.status to .failed,
  // so the status-based handlers above never fire. Surface it through the same
  // recovery/failPlayback path so onError and PlaybackState.error are emitted.
  func onPlayerItemErrorLogEntry(statusCode: Int, comment: String?) {
    guard HlsStartupErrorPolicy.isFatalStartupHttpError(
      statusCode: statusCode,
      hasLoaded: hasLoadedCurrentSource
    ) else {
      return
    }
    let message = HlsStartupErrorPolicy.describe(statusCode: statusCode, comment: comment)
    if attemptStartupRecoveryIfNeeded(message: message) {
      return
    }
    failPlayback(message: message)
  }

  func onPlayerItemWillChange(hasNewPlayerItem: Bool) {
    if hasNewPlayerItem {
      // Set initial buffering state when playerItem is assigned
      isCurrentlyBuffering = true
      status = .loading
      readyToDisplay = false
      resetPlaybackError()
      updateAndEmitPlaybackState()
    } else {
      // Clean up state when playerItem is cleared
      isCurrentlyBuffering = false
      readyToDisplay = false
      status = .idle
      resetPlaybackError()
      updateAndEmitPlaybackState()
    }
  }

  func updateAndEmitPlaybackState() {
    emitPlaybackState()
  }

  private func enterBuffering() {
    isCurrentlyBuffering = true
    if status != .playing && status != .paused {
      status = .buffering
    }
  }
}
