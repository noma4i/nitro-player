//
//  VideoManager.swift
//  JustPlayer
//
//  Created by Krzysztof Moch on 27/04/2025.
//

import Foundation
import AVFoundation

class VideoManager {
  // MARK: - Singleton
  static let shared = VideoManager()
  private let maxHotFeedPlayers = 2

  private var players = NSHashTable<HybridVideoPlayer>.weakObjects()
  private var videoView = NSHashTable<VideoComponentView>.weakObjects()
  private var feedHotActivity: [ObjectIdentifier: UInt64] = [:]
  private var feedHotSequence: UInt64 = 0

  private init() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillResignActive(notification:)),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive(notification:)),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidEnterBackground(notification:)),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillEnterForeground(notification:)),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - public

  private func onMainThread(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }

  func register(player: HybridVideoPlayer) {
    onMainThread {
      self.players.add(player)
      self.touchFeedHotCandidate(player)
    }
  }

  func unregister(player: HybridVideoPlayer) {
    onMainThread {
      self.players.remove(player)
      self.feedHotActivity.removeValue(forKey: ObjectIdentifier(player))
      self.rebalanceFeedHotPlayers()
    }
  }

  func register(view: VideoComponentView) {
    onMainThread {
      self.videoView.add(view)
      if let player = view.player as? HybridVideoPlayer {
        self.touchFeedHotCandidate(player)
      }
    }
  }

  func unregister(view: VideoComponentView) {
    onMainThread {
      self.videoView.remove(view)
      self.rebalanceFeedHotPlayers()
    }
  }

  func touchFeedHotCandidate(_ player: HybridVideoPlayer) {
    onMainThread {
      if player.isFeedProfile() {
        self.feedHotSequence += 1
        self.feedHotActivity[ObjectIdentifier(player)] = self.feedHotSequence
      } else {
        self.feedHotActivity.removeValue(forKey: ObjectIdentifier(player))
      }
      self.rebalanceFeedHotPlayers()
    }
  }

  // MARK: - App Lifecycle

  @objc func applicationWillResignActive(notification: Notification) {
    for player in players.allObjects {
      if player.playInBackground || player.playWhenInactive || !player.isPlaying || player.player.isExternalPlaybackActive == true {
        continue
      }

      try? player.pause()
      player.wasAutoPaused = true
    }
  }

  @objc func applicationDidBecomeActive(notification: Notification) {
    // Resume handled in willEnterForeground; clear any remaining flags
    for player in players.allObjects {
      player.wasAutoPaused = false
    }
  }

  @objc func applicationDidEnterBackground(notification: Notification) {
    for player in players.allObjects {
      if player.playInBackground || player.player.isExternalPlaybackActive == true || !player.isPlaying {
        continue
      }

      try? player.pause()
      player.wasAutoPaused = true
    }
  }

  @objc func applicationWillEnterForeground(notification: Notification) {
    for player in players.allObjects {
      if player.wasAutoPaused {
        try? player.play()
      }
      player.wasAutoPaused = false
    }
  }

  private func rebalanceFeedHotPlayers() {
    let feedPlayers = players.allObjects.filter { $0.isFeedProfile() }
    if feedPlayers.isEmpty {
      feedHotActivity.removeAll()
      return
    }

    let feedPlayerIds = Set(feedPlayers.map(ObjectIdentifier.init))
    feedHotActivity = feedHotActivity.filter { feedPlayerIds.contains($0.key) }

    let pinnedPlayers = feedPlayers.filter { $0.shouldStayHotInFeedPool() }
      .sorted {
        (feedHotActivity[ObjectIdentifier($0)] ?? 0) >
          (feedHotActivity[ObjectIdentifier($1)] ?? 0)
      }

    let relaxedPlayers = feedPlayers.filter { !$0.shouldStayHotInFeedPool() }
      .sorted {
        (feedHotActivity[ObjectIdentifier($0)] ?? 0) >
          (feedHotActivity[ObjectIdentifier($1)] ?? 0)
      }

    var playersToKeepHot = Set(pinnedPlayers.map(ObjectIdentifier.init))
    let extraHotSlots = max(0, maxHotFeedPlayers - playersToKeepHot.count)
    for player in relaxedPlayers.prefix(extraHotSlots) {
      playersToKeepHot.insert(ObjectIdentifier(player))
    }

    for player in feedPlayers where !playersToKeepHot.contains(ObjectIdentifier(player)) {
      player.trimForFeedHotPool()
    }
  }
}
