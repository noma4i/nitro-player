//
//  NitroPlayerObserver.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 15/04/2025.
//

import AVFoundation
import Foundation

protocol NitroPlayerObserverDelegate: AnyObject {
  func onPlayedToEnd(player: AVPlayer)
  func onPlayerItemChange(player: AVPlayer, playerItem: AVPlayerItem?)
  func onPlayerItemWillChange(hasNewPlayerItem: Bool)
  func onRateChanged(rate: Float)
  func onPlaybackBufferEmpty()
  func onPlaybackLikelyToKeepUp()
  func onVolumeChanged(volume: Float)
  func onTimeControlStatusChanged(status: AVPlayer.TimeControlStatus)
  func onPlayerStatusChanged(status: AVPlayer.Status)
  func onPlayerItemStatusChanged(status: AVPlayerItem.Status)
  func onDurationChanged(duration: Double)
  func onBufferDurationChanged(bufferDuration: Double)
  func onBandwidthUpdate(bitrate: Double)
  func onProgressUpdate(currentTime: Double, bufferDuration: Double)
  func onPlayerItemErrorLogEntry(statusCode: Int, comment: String?)
}

extension NitroPlayerObserverDelegate {
  func onPlayedToEnd(player: AVPlayer) {}
  func onPlayerItemChange(player: AVPlayer, playerItem: AVPlayerItem?) {}
  func onPlayerItemWillChange(hasNewPlayerItem: Bool) {}
  func onRateChanged(rate: Float) {}
  func onPlaybackBufferEmpty() {}
  func onPlaybackLikelyToKeepUp() {}
  func onVolumeChanged(volume: Float) {}
  func onTimeControlStatusChanged(status: AVPlayer.TimeControlStatus) {}
  func onPlayerStatusChanged(status: AVPlayer.Status) {}
  func onPlayerItemStatusChanged(status: AVPlayerItem.Status) {}
  func onDurationChanged(duration: Double) {}
  func onBufferDurationChanged(bufferDuration: Double) {}
  func onBandwidthUpdate(bitrate: Double) {}
  func onProgressUpdate(currentTime: Double, bufferDuration: Double) {}
  func onPlayerItemErrorLogEntry(statusCode: Int, comment: String?) {}
}

class NitroPlayerObserver: NSObject {
  private weak var delegate: HybridNitroPlayer?
  private weak var observedPlayer: AVPlayer?
  var player: AVPlayer? {
    delegate?.player
  }

  var playerCurrentItemObserver: NSKeyValueObservation?
  var playerRateObserver: NSKeyValueObservation?
  var playerTimeControlStatusObserver: NSKeyValueObservation?
  var playerVolumeObserver: NSKeyValueObservation?
  var playerStatusObserver: NSKeyValueObservation?
  var playerProgressPeriodicObserver: Any?

  var playbackEndedObserver: NSObjectProtocol?
  var playbackBufferEmptyObserver: NSKeyValueObservation?
  var playbackLikelyToKeepUpObserver: NSKeyValueObservation?
  var playbackBufferFullObserver: NSKeyValueObservation?
  var playerItemStatusObserver: NSKeyValueObservation?
  var playerItemDurationObserver: NSKeyValueObservation?
  var playerItemLoadedTimeRangesObserver: NSKeyValueObservation?
  var playerItemAccessLogObserver: NSObjectProtocol?
  var playerItemErrorLogObserver: NSObjectProtocol?

  var observedPlayerItem: AVPlayerItem?

  init(delegate: HybridNitroPlayer) {
    self.delegate = delegate
  }

  deinit {
    invalidatePlayerObservers()
    invalidatePlayerItemObservers()
  }

  public func updatePlayerObservers() {
    invalidatePlayerItemObservers()
    invalidatePlayerObservers()
    initializePlayerObservers()
  }

  func initializePlayerObservers() {
    guard let player else {
      return
    }

    observedPlayer = player

    playerCurrentItemObserver = player.observe(\.currentItem, options: [.new, .old]) { [weak self, weak player] _, change in
      guard let player else { return }
      self?.onPlayerCurrentItemChanged(player: player, change: change)
    }

    // AVFoundation KVO quirk: block-based observations on AVPlayer properties can
    // deliver `change.newValue == nil` (enum bridging), silently dropping the
    // update. Always re-read the property from the player inside the callback -
    // it was just set on this thread, so the read is safe and always current.
    playerRateObserver = player.observe(\.rate, options: [.new]) { [weak self, weak player] _, _ in
      guard let player else { return }
      let rate = player.rate
      self?.notifyDelegate(expectedPlayer: player) { $0.onRateChanged(rate: rate) }
    }

    observePlayerTimeControlStatus(player: player)

    playerVolumeObserver = player.observe(\.volume, options: [.new]) { [weak self, weak player] _, _ in
      guard let player else { return }
      let volume = player.volume
      self?.notifyDelegate(expectedPlayer: player) { $0.onVolumeChanged(volume: volume) }
    }

    playerStatusObserver = player.observe(\.status, options: [.new]) { [weak self, weak player] _, _ in
      guard let player else { return }
      let status = player.status
      self?.notifyDelegate(expectedPlayer: player) { $0.onPlayerStatusChanged(status: status) }
    }

    let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
    playerProgressPeriodicObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self, weak player] time in
      guard let self, let player else { return }
      guard self.isCurrent(player: player) else { return }
      let bufferDuration = player.currentItem?.getBufferDuration(at: time.seconds) ?? 0
      self.notifyDelegate(expectedPlayer: player) { $0.onProgressUpdate(currentTime: time.seconds, bufferDuration: bufferDuration) }
    }
  }

  private func observePlayerTimeControlStatus(player: AVPlayer) {
    playerTimeControlStatusObserver?.invalidate()
    // See the KVO quirk note in initializePlayerObservers: change.newValue is
    // unreliable for AVPlayer enums, so the status is re-read from the player.
    playerTimeControlStatusObserver = player.observe(\.timeControlStatus, options: [.new, .initial]) { [weak self, weak player] _, _ in
      guard let player else { return }
      let status = player.timeControlStatus
      self?.notifyDelegate(expectedPlayer: player) { $0.onTimeControlStatusChanged(status: status) }
    }
  }

  /// Re-registers the rate and timeControlStatus observers with an `.initial`
  /// delivery, re-seeding the delegate's playback-metrics cache from the player's
  /// actual state. Required after any cache reset: KVO is change-only, so a reset
  /// that fabricates `.paused`/`rate 0` while the player keeps playing would
  /// otherwise leave the cache stale until the next real transition.
  func resyncPlayerStateObservers() {
    guard let player else { return }

    playerRateObserver?.invalidate()
    playerRateObserver = player.observe(\.rate, options: [.new, .initial]) { [weak self, weak player] _, _ in
      guard let player else { return }
      let rate = player.rate
      self?.notifyDelegate(expectedPlayer: player) { $0.onRateChanged(rate: rate) }
    }

    observePlayerTimeControlStatus(player: player)
  }

  private func initializePlayerItemObservers(player: AVPlayer, playerItem: AVPlayerItem) {
    observedPlayerItem = playerItem

    playbackEndedObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: playerItem,
      queue: .main
    ) { [weak self, weak player, weak playerItem] _ in
      guard let player, let playerItem else { return }
      self?.notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { $0.onPlayedToEnd(player: player) }
    }

    playerItemAccessLogObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemNewAccessLogEntry,
      object: playerItem,
      queue: .main
    ) { [weak self, weak player, weak playerItem] _ in
      guard let player, let playerItem else { return }
      self?.onPlayerAccessLog(player: player, playerItem: playerItem)
    }

    playerItemErrorLogObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemNewErrorLogEntry,
      object: playerItem,
      queue: .main
    ) { [weak self, weak player, weak playerItem] _ in
      guard let player, let playerItem else { return }
      self?.onPlayerErrorLog(player: player, playerItem: playerItem)
    }

    setupBufferObservers(player: player, playerItem: playerItem)

    playerItemStatusObserver = playerItem.observe(\.status, options: [.new]) { [weak self, weak player, weak playerItem] _, change in
      guard let player, let playerItem else { return }
      self?.notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { $0.onPlayerItemStatusChanged(status: playerItem.status) }
    }

    playerItemDurationObserver = playerItem.observe(\.duration, options: [.new, .initial]) { [weak self, weak player, weak playerItem] _, change in
      guard let player, let playerItem else { return }
      let duration = change.newValue ?? playerItem.duration
      self?.notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { $0.onDurationChanged(duration: duration.seconds) }
    }

    playerItemLoadedTimeRangesObserver = playerItem.observe(\.loadedTimeRanges, options: [.new, .initial]) { [weak self, weak player, weak playerItem] _, _ in
      guard let player, let playerItem else { return }
      self?.notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { delegate in
        delegate.onBufferDurationChanged(bufferDuration: playerItem.getBufferDuration(at: delegate.currentTime))
      }
    }
  }

  func invalidatePlayerItemObservers() {
    if let playbackEndedObserver {
      NotificationCenter.default.removeObserver(playbackEndedObserver)
      self.playbackEndedObserver = nil
    }
    if let playerItemAccessLogObserver {
      NotificationCenter.default.removeObserver(playerItemAccessLogObserver)
      self.playerItemAccessLogObserver = nil
    }
    if let playerItemErrorLogObserver {
      NotificationCenter.default.removeObserver(playerItemErrorLogObserver)
      self.playerItemErrorLogObserver = nil
    }
    clearBufferObservers()
    playerItemStatusObserver?.invalidate()
    playerItemStatusObserver = nil
    playerItemDurationObserver?.invalidate()
    playerItemDurationObserver = nil
    playerItemLoadedTimeRangesObserver?.invalidate()
    playerItemLoadedTimeRangesObserver = nil
    observedPlayerItem = nil
  }

  func invalidatePlayerObservers() {
    playerCurrentItemObserver?.invalidate()
    playerCurrentItemObserver = nil
    playerRateObserver?.invalidate()
    playerRateObserver = nil
    playerTimeControlStatusObserver?.invalidate()
    playerTimeControlStatusObserver = nil
    playerVolumeObserver?.invalidate()
    playerVolumeObserver = nil
    playerStatusObserver?.invalidate()
    playerStatusObserver = nil
    if let periodicObserver = playerProgressPeriodicObserver {
      observedPlayer?.removeTimeObserver(periodicObserver)
      playerProgressPeriodicObserver = nil
    }
    observedPlayer = nil
  }

  func onPlayerCurrentItemChanged(player: AVPlayer, change: NSKeyValueObservedChange<AVPlayerItem?>) {
    guard isCurrent(player: player) else { return }
    let newPlayerItem = change.newValue?.flatMap { $0 }

    invalidatePlayerItemObservers()
    notifyDelegate(expectedPlayer: player) { $0.onPlayerItemWillChange(hasNewPlayerItem: newPlayerItem != nil) }

    if let playerItem = newPlayerItem {
      initializePlayerItemObservers(player: player, playerItem: playerItem)
      notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { $0.onPlayerItemChange(player: player, playerItem: playerItem) }
    }
  }

  func onPlayerAccessLog(player: AVPlayer, playerItem: AVPlayerItem) {
    guard let accessLog = playerItem.accessLog(), let lastEvent = accessLog.events.last else { return }
    notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { $0.onBandwidthUpdate(bitrate: lastEvent.indicatedBitrate) }
  }

  func onPlayerErrorLog(player: AVPlayer, playerItem: AVPlayerItem) {
    guard let errorLog = playerItem.errorLog(), let lastEvent = errorLog.events.last else { return }
    notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem) { $0.onPlayerItemErrorLogEntry(statusCode: lastEvent.errorStatusCode, comment: lastEvent.errorComment) }
  }

  private func observeBoolProperty(
    player: AVPlayer,
    playerItem: AVPlayerItem,
    keyPath: KeyPath<AVPlayerItem, Bool>,
    handler: @escaping (HybridNitroPlayer) -> Void
  ) -> NSKeyValueObservation {
    playerItem.observe(keyPath, options: [.new, .initial]) { [weak self, weak player, weak playerItem] item, change in
      guard change.newValue ?? item[keyPath: keyPath], let player, let playerItem else { return }
      self?.notifyDelegate(expectedPlayer: player, expectedPlayerItem: playerItem, handler)
    }
  }

  func setupBufferObservers(player: AVPlayer, playerItem: AVPlayerItem) {
    clearBufferObservers()
    playbackBufferEmptyObserver = observeBoolProperty(player: player, playerItem: playerItem, keyPath: \.isPlaybackBufferEmpty) { $0.onPlaybackBufferEmpty() }
    playbackLikelyToKeepUpObserver = observeBoolProperty(player: player, playerItem: playerItem, keyPath: \.isPlaybackLikelyToKeepUp) { $0.onPlaybackLikelyToKeepUp() }
    playbackBufferFullObserver = observeBoolProperty(player: player, playerItem: playerItem, keyPath: \.isPlaybackBufferFull) { $0.onPlaybackLikelyToKeepUp() }
  }

  func clearBufferObservers() {
    playbackBufferEmptyObserver?.invalidate()
    playbackBufferFullObserver?.invalidate()
    playbackLikelyToKeepUpObserver?.invalidate()
    playbackBufferEmptyObserver = nil
    playbackBufferFullObserver = nil
    playbackLikelyToKeepUpObserver = nil
  }

  private func isCurrent(player: AVPlayer) -> Bool {
    observedPlayer === player && delegate?.player === player
  }

  private func notifyDelegate(
    expectedPlayer: AVPlayer,
    expectedPlayerItem: AVPlayerItem? = nil,
    _ handler: @escaping (HybridNitroPlayer) -> Void
  ) {
    let deliver = { [weak self] in
      guard let self, let delegate = self.delegate, !delegate.isReleased, self.isCurrent(player: expectedPlayer) else { return }
      if let expectedPlayerItem {
        guard self.observedPlayerItem === expectedPlayerItem, delegate.playerItem === expectedPlayerItem else { return }
      }
      handler(delegate)
    }

    if Thread.isMainThread {
      deliver()
      return
    }

    DispatchQueue.main.async(execute: deliver)
  }
}
