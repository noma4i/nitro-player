//
//  NitroPlayerObserver.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 15/04/2025.
//

import Foundation
import AVFoundation

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
  func onBandwidthUpdate(bitrate: Double)
  func onProgressUpdate(currentTime: Double, bufferDuration: Double)
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
  func onBandwidthUpdate(bitrate: Double) {}
  func onProgressUpdate(currentTime: Double, bufferDuration: Double) {}
}

class NitroPlayerObserver: NSObject {
  private weak var delegate: HybridNitroPlayer?
  private weak var observedPlayer: AVPlayer?
  var player: AVPlayer? {
    delegate?.player
  }
  
  // Player observers
  var playerCurrentItemObserver: NSKeyValueObservation?
  var playerRateObserver: NSKeyValueObservation?
  var playerTimeControlStatusObserver: NSKeyValueObservation?
  var playerVolumeObserver: NSKeyValueObservation?
  var playerStatusObserver: NSKeyValueObservation?
  var playerProgressPeriodicObserver: Any?
  
  // Player item observers
  var playbackEndedObserver: NSObjectProtocol?
  var playbackBufferEmptyObserver: NSKeyValueObservation?
  var playbackLikelyToKeepUpObserver: NSKeyValueObservation?
  var playbackBufferFullObserver: NSKeyValueObservation?
  var playerItemStatusObserver: NSKeyValueObservation?
  var playerItemAccessLogObserver: NSObjectProtocol?
  
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
    
    playerRateObserver = player.observe(\.rate, options: [.new]) { [weak self] _, change in
      guard let rate = change.newValue else { return }
      self?.delegate?.onRateChanged(rate: rate)
    }
    
    playerTimeControlStatusObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, change in
      guard let status = change.newValue else { return }
      self?.delegate?.onTimeControlStatusChanged(status: status)
    }
    
    playerVolumeObserver = player.observe(\.volume, options: [.new]) { [weak self] _, change in
      guard let volume = change.newValue else { return }
      self?.delegate?.onVolumeChanged(volume: volume)
    }
    
    playerStatusObserver = player.observe(\.status, options: [.new]) { [weak self] _, change in
      guard let status = change.newValue else { return }
      self?.delegate?.onPlayerStatusChanged(status: status)
    }
    
    let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
    playerProgressPeriodicObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] _ in
      guard let self, let player = self.player, let delegate = self.delegate else { return }
      
      delegate.onProgressUpdate(currentTime: player.currentTime().seconds, bufferDuration: player.currentItem?.getBufferDuration() ?? 0)
    }
  }
  
  private func initializePlayerItemObservers(player: AVPlayer, playerItem: AVPlayerItem) {
    playbackEndedObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: playerItem,
      queue: .main
    ) { [weak self, weak player] notification in
      guard let player else { return }
      self?.delegate?.onPlayedToEnd(player: player)
    }
    
    playerItemAccessLogObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemNewAccessLogEntry,
      object: playerItem,
      queue: .main
    ) { [weak self, weak playerItem] notification in
      guard let playerItem else { return }
      self?.onPlayerAccessLog(playerItem: playerItem)
    }
    
    setupBufferObservers(for: playerItem)
    
    playerItemStatusObserver = playerItem.observe(\.status, options: [.new]) { [weak self, weak playerItem] _, change in
      guard let playerItem else { return }
      self?.delegate?.onPlayerItemStatusChanged(status: playerItem.status)
    }
    
    observedPlayerItem = playerItem
  }
  
  func invalidatePlayerItemObservers() {
    // Remove NotificationCenter observers
    if let playbackEndedObserver = playbackEndedObserver {
      NotificationCenter.default.removeObserver(playbackEndedObserver)
      self.playbackEndedObserver = nil
    }
    if let playerItemAccessLogObserver = playerItemAccessLogObserver {
      NotificationCenter.default.removeObserver(playerItemAccessLogObserver)
      self.playerItemAccessLogObserver = nil
    }
    // Invalidate KVO observers
    clearBufferObservers()
    playerItemStatusObserver?.invalidate()
    playerItemStatusObserver = nil
    observedPlayerItem = nil
  }
  
  func invalidatePlayerObservers() {
    // Invalidate KVO observers
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
    // Remove periodic time observer from player
    if let periodicObserver = playerProgressPeriodicObserver {
      let targetPlayer = player ?? observedPlayer
      targetPlayer?.removeTimeObserver(periodicObserver)
      playerProgressPeriodicObserver = nil
    }
    observedPlayer = nil
  }
  
  // MARK: - AVPlayer Observers
  func onPlayerCurrentItemChanged(player: AVPlayer, change: NSKeyValueObservedChange<AVPlayerItem?>) {
    let newPlayerItem = change.newValue?.flatMap { $0 }
    
    // Remove observers for old player item
    invalidatePlayerItemObservers()
    
    // Notify delegate about player item state change
    delegate?.onPlayerItemWillChange(hasNewPlayerItem: newPlayerItem != nil)
    
    if let playerItem = newPlayerItem {
      // Initialize observers for new player item
      initializePlayerItemObservers(player: player, playerItem: playerItem)
      
      delegate?.onPlayerItemChange(player: player, playerItem: playerItem)
    }
  }
  
  // MARK: - AVPlayerItem Observers
  func onPlayerAccessLog(playerItem: AVPlayerItem) {
    guard let accessLog = playerItem.accessLog() else { return }
    guard let lastEvent = accessLog.events.last else { return }
    
    delegate?.onBandwidthUpdate(bitrate: lastEvent.indicatedBitrate)
  }
  
  // MARK: - Buffer State Management

  private func observeBoolProperty(
    _ playerItem: AVPlayerItem,
    keyPath: KeyPath<AVPlayerItem, Bool>,
    handler: @escaping () -> Void
  ) -> NSKeyValueObservation {
    playerItem.observe(keyPath, options: [.new, .initial]) { item, change in
      if change.newValue ?? item[keyPath: keyPath] {
        handler()
      }
    }
  }

  func setupBufferObservers(for playerItem: AVPlayerItem) {
    clearBufferObservers()
    playbackBufferEmptyObserver = observeBoolProperty(playerItem, keyPath: \.isPlaybackBufferEmpty) { [weak self] in self?.delegate?.onPlaybackBufferEmpty() }
    playbackLikelyToKeepUpObserver = observeBoolProperty(playerItem, keyPath: \.isPlaybackLikelyToKeepUp) { [weak self] in self?.delegate?.onPlaybackLikelyToKeepUp() }
    playbackBufferFullObserver = observeBoolProperty(playerItem, keyPath: \.isPlaybackBufferFull) { [weak self] in self?.delegate?.onPlaybackLikelyToKeepUp() }
  }
  
  func clearBufferObservers() {
    playbackBufferEmptyObserver?.invalidate()
    playbackBufferFullObserver?.invalidate()
    playbackLikelyToKeepUpObserver?.invalidate()
    
    playbackBufferEmptyObserver = nil
    playbackBufferFullObserver = nil
    playbackLikelyToKeepUpObserver = nil
  }
}
