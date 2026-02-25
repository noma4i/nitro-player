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
  
  private var isAudioSessionActive = false
  private var remoteControlEventsActive = false
  
  // TODO: Create Global Config, and expose it there
  private var isAudioSessionManagementDisabled: Bool = true
  
  private init() {
    // Subscribe to audio interruption notifications
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioSessionInterruption),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    
    // Subscribe to route change notifications
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioRouteChange),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    
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
  
  func register(player: HybridVideoPlayer) {
    players.add(player)
    touchFeedHotCandidate(player)
  }
  
  func unregister(player: HybridVideoPlayer) {
    players.remove(player)
    feedHotActivity.removeValue(forKey: ObjectIdentifier(player))
    rebalanceFeedHotPlayers()
  }
  
  func register(view: VideoComponentView) {
    videoView.add(view)
    if let player = view.player as? HybridVideoPlayer {
      touchFeedHotCandidate(player)
    }
  }
  
  func unregister(view: VideoComponentView) {
    videoView.remove(view)
    rebalanceFeedHotPlayers()
  }
  
  func requestAudioSessionUpdate() {
    updateAudioSessionConfiguration()
  }

  func touchFeedHotCandidate(_ player: HybridVideoPlayer) {
    if player.isFeedProfile() {
      feedHotSequence += 1
      feedHotActivity[ObjectIdentifier(player)] = feedHotSequence
    } else {
      feedHotActivity.removeValue(forKey: ObjectIdentifier(player))
    }

    rebalanceFeedHotPlayers()
  }
  
  // MARK: - Remote Control Events
  func setRemoteControlEventsActive(_ active: Bool) {
    if isAudioSessionManagementDisabled || remoteControlEventsActive == active {
      return
    }
    
    remoteControlEventsActive = active
    requestAudioSessionUpdate()
  }
  
  // MARK: - Audio Session Management
  private func activateAudioSession() {
    if isAudioSessionActive {
      return
    }
    
    do {
      try AVAudioSession.sharedInstance().setActive(true)
      isAudioSessionActive = true
    } catch {
      print("Failed to activate audio session: \(error.localizedDescription)")
    }
  }
  
  private func deactivateAudioSession() {
    if !isAudioSessionActive {
      return
    }
    
    do {
      try AVAudioSession.sharedInstance().setActive(
        false, options: .notifyOthersOnDeactivation
      )
      isAudioSessionActive = false
    } catch {
      print("Failed to deactivate audio session: \(error.localizedDescription)")
    }
  }
  
  private func updateAudioSessionConfiguration() {
    if isAudioSessionManagementDisabled {
      return
    }

    let isAnyPlayerPlaying = players.allObjects.contains { hybridPlayer in
      hybridPlayer.player.isMuted == false && hybridPlayer.player.rate != 0
    }
    
    let anyPlayerNeedsNotMixWithOthers = players.allObjects.contains { player in
      player.mixAudioMode == .donotmix
    }
    
    let anyPlayerNeedsNotificationControls = players.allObjects.contains { player in
      player.showNotificationControls
    }
    
    if isAnyPlayerPlaying || anyPlayerNeedsNotMixWithOthers || anyPlayerNeedsNotificationControls || remoteControlEventsActive {
      activateAudioSession()
    } else {
      deactivateAudioSession()
    }
    
    configureAudioSession()
  }
  
  private func configureAudioSession() {
    let audioSession = AVAudioSession.sharedInstance()
    var audioSessionCategoryOptions: AVAudioSession.CategoryOptions = audioSession.categoryOptions
    
    let anyViewNeedsPictureInPicture = videoView.allObjects.contains { view in
      view.allowsPictureInPicturePlayback
    }
    
    let anyPlayerNeedsSilentSwitchObey = players.allObjects.contains { player in
      player.ignoreSilentSwitchMode == .obey
    }
    
    let anyPlayerNeedsSilentSwitchIgnore = players.allObjects.contains { player in
      player.ignoreSilentSwitchMode == .ignore
    }

    let anyPlayerNeedsBackgroundPlayback = players.allObjects.contains { player in
      player.playInBackground
    }
    
    let anyPlayerNeedsNotificationControls = players.allObjects.contains { player in
      player.showNotificationControls
    }
    
    if isAudioSessionManagementDisabled {
      return
    }
    
    let category: AVAudioSession.Category = determineAudioCategory(
      silentSwitchObey: anyPlayerNeedsSilentSwitchObey,
      silentSwitchIgnore: anyPlayerNeedsSilentSwitchIgnore,
      earpiece: false, // TODO: Pass actual value after we add prop
      pip: anyViewNeedsPictureInPicture,
      backgroundPlayback: anyPlayerNeedsBackgroundPlayback,
      notificationControls: anyPlayerNeedsNotificationControls
    )
    
    let audioMixingMode = determineAudioMixingMode()
    
    switch audioMixingMode {
    case .mixwithothers:
      audioSessionCategoryOptions.insert(.mixWithOthers)
    case .donotmix:
      audioSessionCategoryOptions.remove(.mixWithOthers)
    case .duckothers:
      audioSessionCategoryOptions.insert(.duckOthers)
    case .auto:
      audioSessionCategoryOptions.remove(.mixWithOthers)
      audioSessionCategoryOptions.remove(.duckOthers)
    }
    
    do {
      try audioSession.setCategory(category, mode: .moviePlayback, options: audioSessionCategoryOptions)
    } catch {
      print("JustPlayer: Failed to set audio session category: \(error.localizedDescription)")
    }
  }
  
  private func determineAudioCategory(
    silentSwitchObey: Bool,
    silentSwitchIgnore: Bool,
    earpiece: Bool,
    pip: Bool,
    backgroundPlayback: Bool,
    notificationControls: Bool
  ) -> AVAudioSession.Category {
    // Handle conflicting settings
    if silentSwitchObey && silentSwitchIgnore {
      print(
        "Warning: Conflicting ignoreSilentSwitch settings found (obey vs ignore) - defaulting to ignore"
      )
      return .playback
    }
    
    // PiP, background playback, or notification controls require playback category
    if pip || backgroundPlayback || notificationControls || remoteControlEventsActive {
      if silentSwitchObey {
        print(
          "Warning: ignoreSilentSwitch=obey cannot be used with PiP, backgroundPlayback, or notification controls - using playback category"
        )
      }
      
      if earpiece {
        print(
          "Warning: audioOutput=earpiece cannot be used with PiP, backgroundPlayback, or notification controls - using playback category"
        )
      }
      
      // Set up background playback policy if needed
      if backgroundPlayback {
        players.allObjects.forEach { player in
          if player.playInBackground {
            player.player.audiovisualBackgroundPlaybackPolicy = .continuesIfPossible
          } else {
            player.player.audiovisualBackgroundPlaybackPolicy = .pauses
          }
        }
      }
      
      return .playback
    }
    
    // Earpiece requires playAndRecord
    if earpiece {
      if silentSwitchObey {
        print(
          "Warning: audioOutput=earpiece cannot be used with ignoreSilentSwitch=obey - using playAndRecord category"
        )
      }
      return .playAndRecord
    }
    
    // Honor silent switch if requested
    if silentSwitchObey {
      return .ambient
    }
    
    // Default to playback for most cases
    return .playback
  }
  
  func determineAudioMixingMode() -> MixAudioMode {
    let activePlayers = players.allObjects.filter { player in
      player.isPlaying && player.player.isMuted != true
    }
    
    if activePlayers.isEmpty {
      return .mixwithothers
    }
    
    let anyPlayerNeedsMixWithOthers = activePlayers.contains { player in
      player.mixAudioMode == .mixwithothers
    }
    
    let anyPlayerNeedsNotMixWithOthers = activePlayers.contains { player in
      player.mixAudioMode == .donotmix
    }
    
    let anyPlayerNeedsDucksOthers = activePlayers.contains { player in
      player.mixAudioMode == .duckothers
    }
    
    let anyPlayerHasAutoMixAudioMode = activePlayers.contains { player in
      player.mixAudioMode == .auto
    }
    
    if anyPlayerNeedsNotMixWithOthers {
      return .donotmix
    }
    
    if anyPlayerHasAutoMixAudioMode {
      return .auto
    }
    
    if anyPlayerNeedsDucksOthers {
      return .duckothers
    }
    
    return .mixwithothers
  }
  
  
  // MARK: - Notification Handlers
  
  @objc
  private func handleAudioSessionInterruption(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue)
    else {
      return
    }
    
    switch type {
    case .began:
      // Audio session interrupted, nothing to do as players will pause automatically
      break
      
    case .ended:
      // Interruption ended, check if we should resume audio session
      if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if options.contains(.shouldResume) {
          updateAudioSessionConfiguration()
        }
      }
      
    @unknown default:
      break
    }
  }
  
  @objc
  private func handleAudioRouteChange(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
    else {
      return
    }
    
    switch reason {
    case .categoryChange, .override, .wakeFromSleep, .newDeviceAvailable, .oldDeviceUnavailable:
      // Reconfigure audio session when route changes
      updateAudioSessionConfiguration()
    default:
      break
    }
  }
  
  @objc func applicationWillResignActive(notification: Notification) {
    // Pause all players when the app is about to become inactive
    for player in players.allObjects {
      if player.playInBackground || player.playWhenInactive || !player.isPlaying || player.player.isExternalPlaybackActive == true {
        continue
      }
      
      try? player.pause()
      player.wasAutoPaused = true
    }
  }
  
  @objc func applicationDidBecomeActive(notification: Notification) {
    // Reset auto-pause flag; play is managed by JS layer (mediaCoordinator)
    for player in players.allObjects {
      player.wasAutoPaused = false
    }
  }
  
  @objc func applicationDidEnterBackground(notification: Notification) {
    // Pause all players when the app enters background
    for player in players.allObjects {
      if player.playInBackground || player.player.isExternalPlaybackActive == true || !player.isPlaying {
        continue
      }
      
      try? player.pause()
      player.wasAutoPaused = true
    }
  }
  
  @objc func applicationWillEnterForeground(notification: Notification) {
    // Reset auto-pause flag; play is managed by JS layer (mediaCoordinator)
    for player in players.allObjects {
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
