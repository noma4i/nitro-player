//
//  NitroPlayerManager.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 27/04/2025.
//

import Foundation
import AVFoundation

class NitroPlayerManager {
  // MARK: - Singleton
  static let shared = NitroPlayerManager()
  private let maxHotFeedPlayers = 2

  private var players = NSHashTable<HybridNitroPlayer>.weakObjects()
  private var videoView = NSHashTable<NitroPlayerComponentView>.weakObjects()
  private var feedHotActivity: [ObjectIdentifier: UInt64] = [:]
  private var feedHotSequence: UInt64 = 0
  private var notificationObservers: [NSObjectProtocol] = []

  private init() {
    let center = NotificationCenter.default
    notificationObservers = [
      center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.applicationWillResignActive()
      },
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.applicationDidBecomeActive()
      },
      center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
        self?.applicationDidEnterBackground()
      },
      center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
        self?.applicationWillEnterForeground()
      },
      center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
        self?.applicationDidReceiveMemoryWarning()
      }
    ]
  }

  deinit {
    notificationObservers.forEach(NotificationCenter.default.removeObserver)
    notificationObservers.removeAll()
  }

  // MARK: - public

  private func onMainThread(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }

  func register(player: HybridNitroPlayer) {
    onMainThread {
      self.players.add(player)
      self.touchFeedHotCandidate(player)
    }
  }

  func unregister(player: HybridNitroPlayer) {
    onMainThread {
      self.players.remove(player)
      self.feedHotActivity.removeValue(forKey: ObjectIdentifier(player))
      self.rebalanceFeedHotPlayers()
    }
  }

  func register(view: NitroPlayerComponentView) {
    onMainThread {
      self.videoView.add(view)
      if let player = view.player as? HybridNitroPlayer {
        self.touchFeedHotCandidate(player)
      }
    }
  }

  func unregister(view: NitroPlayerComponentView) {
    onMainThread {
      self.videoView.remove(view)
      self.rebalanceFeedHotPlayers()
    }
  }

  func touchFeedHotCandidate(_ player: HybridNitroPlayer) {
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

  func applicationWillResignActive() {
    for player in players.allObjects {
      if !PlayerAppStatePolicy.shouldAutoPauseWhenInactive(player.appStateSnapshot()) {
        continue
      }

      try? player.pause()
      player.wasAutoPaused = true
    }
  }

  func applicationDidBecomeActive() {
    // Resume handled in willEnterForeground; clear any remaining flags
    for player in players.allObjects {
      if PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(player.appStateSnapshot()) {
        player.wasAutoPaused = false
      }
    }
  }

  func applicationDidEnterBackground() {
    for player in players.allObjects {
      if !PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(player.appStateSnapshot()) {
        continue
      }

      try? player.pause()
      player.wasAutoPaused = true
    }
  }

  func applicationWillEnterForeground() {
    for player in players.allObjects {
      if PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(player.appStateSnapshot()) {
        do {
          try player.play()
          player.wasAutoPaused = false
        } catch {
          player.wasAutoPaused = true
        }
      } else {
        player.wasAutoPaused = false
      }
    }
  }

  func applicationDidReceiveMemoryWarning() {
    for player in players.allObjects {
      player.trimForResourcePressure()
    }
    feedHotActivity = feedHotActivity.filter { id, _ in
      players.allObjects.contains { ObjectIdentifier($0) == id }
    }
    rebalanceFeedHotPlayers()
  }

  private func rebalanceFeedHotPlayers() {
    let feedPlayers = players.allObjects.filter { $0.isFeedProfile() }
    if feedPlayers.isEmpty {
      feedHotActivity.removeAll()
      return
    }

    let feedPlayerIds = Set(feedPlayers.map(ObjectIdentifier.init))
    feedHotActivity = feedHotActivity.filter { feedPlayerIds.contains($0.key) }

    let playersToKeepHot = PlayerRetentionCoordinator.feedHotIds(
      players: feedPlayers.map { player in
        let id = ObjectIdentifier(player)
        return FeedHotPlayerSnapshot(
          id: id,
          activity: feedHotActivity[id] ?? 0,
          retention: player.retentionSnapshot()
        )
      },
      maxHotPlayers: maxHotFeedPlayers
    )

    for player in feedPlayers where !playersToKeepHot.contains(ObjectIdentifier(player)) {
      player.trimForFeedHotPool()
    }
  }
}
