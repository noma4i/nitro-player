//
//  HybridNitroPlayer+Events.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 02/05/2025.
//

import AVFoundation
import Foundation

extension HybridNitroPlayer: NitroPlayerObserverDelegate {
  // MARK: - NitroPlayerObserverDelegate

  func onPlayedToEnd(player: AVPlayer) {
    status = .ended
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
    if player.timeControlStatus != .waitingToPlayAtSpecifiedRate {
      status = player.rate > 0 ? .playing : .paused
    }
    updateAndEmitPlaybackState()
  }

  func onExternalPlaybackActiveChanged(isActive: Bool) {
    _eventEmitter?.onExternalPlaybackChange(isActive)
  }

  func onTimeControlStatusChanged(status: AVPlayer.TimeControlStatus) {
    if player.status == .failed || playerItem?.status == .failed {
      self.status = .error
      isCurrentlyBuffering = false
      readyToDisplay = false
      emitPlaybackState()
      return
    }

    switch status {
    case .waitingToPlayAtSpecifiedRate:
      enterBuffering()
      break

    case .playing:
      isCurrentlyBuffering = false
      self.status = .playing
      break

    case .paused:
      isCurrentlyBuffering = false
      if self.status != .ended && self.status != .idle {
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
      self.status = .error
      isCurrentlyBuffering = false
      readyToDisplay = false
      updateAndEmitPlaybackState()
    }
  }

  func onPlayerItemStatusChanged(status: AVPlayerItem.Status) {
    if status == .failed {
      self.status = .error
      isCurrentlyBuffering = false
      updateAndEmitPlaybackState()
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

      let height = playerItem.presentationSize.height
      let width = playerItem.presentationSize.width
      let orientation: NitroPlayerOrientation =
        playerItem.asset.tracks.first(where: { $0.mediaType == .video })?
        .orientation ?? .unknown

      _eventEmitter?.onLoad(
        .init(currentTime, duration, height, width, orientation)
      )

      if playerItem.isPlaybackLikelyToKeepUp
        && !playerItem.isPlaybackBufferEmpty
      {
        isCurrentlyBuffering = false
        self.status = player.rate > 0 ? .playing : .paused
      }

    case .failed:
      self.status = .error
      isCurrentlyBuffering = false
      readyToDisplay = false

    @unknown default:
      break
    }

    updateAndEmitPlaybackState()
  }

  func onTextTrackDataChanged(texts: [NSAttributedString]) {}

  func onTimedMetadataChanged(timedMetadata: [AVMetadataItem]) {}

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
      updateAndEmitPlaybackState()
    } else {
      // Clean up state when playerItem is cleared
      isCurrentlyBuffering = false
      readyToDisplay = false
      status = .idle
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
