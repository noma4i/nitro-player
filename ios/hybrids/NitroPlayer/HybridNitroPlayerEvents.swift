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

  func onRateChanged(rate: Float) {
    updateAndEmitPlaybackState()
  }

  func onVolumeChanged(volume: Float) {
    _eventEmitter?.onVolumeChange(
      onVolumeChangeData(
        volume: Double(volume),
        muted: muted
      )
    )
  }

  func onPlaybackBufferEmpty() {
    enterBuffering()
    updateAndEmitPlaybackState()
  }

  func onProgressUpdate(currentTime: Double, bufferDuration: Double) {
    emitPlaybackState()
  }

  func onPlaybackLikelyToKeepUp() {
    isCurrentlyBuffering = false
    resetPlaybackError()
    if player.timeControlStatus != .waitingToPlayAtSpecifiedRate {
      status = resolvePlayPauseStatus()
    }
    updateAndEmitPlaybackState()
  }

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

  func onPlayerStatusChanged(status: AVPlayer.Status) {
    if status == .failed || playerItem?.status == .failed {
      let message = player.error?.localizedDescription ?? playerItem?.error?.localizedDescription ?? "Unknown playback error"
      if attemptStartupRecoveryIfNeeded(message: message) {
        return
      }
      failPlayback(message: message)
    }
  }

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
      markCurrentSourceLoaded()
      resetPlaybackError()

      let height = playerItem.presentationSize.height
      let width = playerItem.presentationSize.width
      let orientation: NitroPlayerOrientation =
        playerItem.asset.tracks.first(where: { $0.mediaType == .video })?
        .orientation ?? .unknown

      _eventEmitter?.onLoad(
        .init(currentTime, duration, height, width, orientation)
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

  func onBandwidthUpdate(bitrate: Double) {
    _eventEmitter?.onBandwidthUpdate(
      .init(bitrate: bitrate, width: nil, height: nil)
    )
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
