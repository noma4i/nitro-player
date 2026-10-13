//
//  NitroPlayerManager.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 27/04/2025.
//

import Foundation
import AVFoundation
import NitroModules

class NitroPlayerManager {
  // MARK: - Singleton
  static let shared = NitroPlayerManager()

  private var players = NSHashTable<HybridNitroPlayer>.weakObjects()
  private var videoView = NSHashTable<NitroPlayerComponentView>.weakObjects()
  private var notificationObservers: [NSObjectProtocol] = []
  private let interruptedUnboundPlayers = NSHashTable<HybridNitroPlayer>.weakObjects()
  private let outputDeviceLostListeners = ListenerRegistry()
  private let foregroundListeners = ListenerRegistry()
  private weak var currentFeedRing: HybridNitroFeedRingPlayer?
  private var foregroundEpoch: UInt64 = 0
  private lazy var foregroundRecovery = PlaybackForegroundRecovery.makeDefault { [weak self] in
    self?.players.allObjects ?? []
  }
  private lazy var systemAudioEventEngine = NativeSystemAudioEventEngine(
    setInterruptionSuspended: { value in
      PlaybackSessionRuntime.shared.setSuspended("system-audio-interruption", suspended: value)
    },
    invalidateAudioSession: {
      NativeAudioSessionRuntime.shared.invalidateAppliedMode()
    },
    stopAll: {
      PlaybackSessionRuntime.shared.stopAll()
    },
    stopManual: {
      PlaybackSessionRuntime.shared.stopManual()
    },
    pauseUnboundTransient: { [weak self] in
      self?.pauseUnboundTransient()
    },
    resumeUnboundTransient: { [weak self] in
      self?.resumeUnboundTransient()
    },
    stopUnbound: { [weak self] in
      self?.stopUnbound()
    },
    muteOutput: { [weak self] in
      self?.muteOutput()
    },
    notifyOutputDeviceLost: { [weak self] in
      self?.notifyOutputDeviceLost()
    },
    recoverAfterMediaServicesReset: { [weak self] in
      NativeAudioSessionRuntime.shared.handleMediaServicesReset()
      self?.recoverAfterMediaServicesReset()
    }
  )

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
      },
      center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] notification in
        self?.handleAudioSessionInterruption(notification)
      },
      center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] notification in
        self?.handleAudioSessionRouteChange(notification)
      },
      center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
        self?.systemAudioEventEngine.mediaServicesWereReset()
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
    }
  }

  func unregister(player: HybridNitroPlayer) {
    if Thread.isMainThread {
      players.remove(player)
      return
    }

    DispatchQueue.main.async { [weak player] in
      if let player {
        self.players.remove(player)
      }
    }
  }

  func register(view: NitroPlayerComponentView) {
    onMainThread {
      self.videoView.add(view)
    }
  }

  func unregister(view: NitroPlayerComponentView) {
    onMainThread {
      self.videoView.remove(view)
    }
  }

  func rebindViews(for player: HybridNitroPlayer) {
    onMainThread {
      for view in self.videoView.allObjects {
        guard let viewPlayer = view.player as? HybridNitroPlayer, viewPlayer === player else {
          continue
        }
        view.configureAVPlayerViewController(with: player.player)
      }
    }
  }

  func registeredPlayers() -> [HybridNitroPlayer] {
    if Thread.isMainThread {
      return players.allObjects
    }

    return DispatchQueue.main.sync {
      players.allObjects
    }
  }

  func debugPlayerSnapshots(
    coordinatorSnapshot: PlaybackSessionCoordinatorSnapshot
  ) -> [[String: Any]] {
    precondition(Thread.isMainThread)
    return players.allObjects.map { player in
      player.diagnosticsSnapshot(coordinatorSnapshot: coordinatorSnapshot)
    }
  }

  func addOnOutputDeviceLostListener(listener: @escaping () -> Void) -> ListenerSubscription {
    precondition(Thread.isMainThread)
    return outputDeviceLostListeners.add(event: "onOutputDeviceLost", listener: listener)
  }

  func addOnForegroundListener(listener: @escaping () -> Void) -> ListenerSubscription {
    precondition(Thread.isMainThread)
    return foregroundListeners.add(event: "onForeground", listener: listener)
  }

  /// Clears a system interruption that was never closed by the system.
  func resolveStaleSystemInterruption() {
    systemAudioEventEngine.resolveInterruptionIfStillActive()
  }

  /// True when a system audio interruption is still open. Recovery observes this directly instead
  /// of observing the global suspension it raises: overlays, modals and chat audio legitimately
  /// raise a global suspension too, and a step must observe exactly the state it repairs.
  var hasUnresolvedSystemInterruption: Bool {
    systemAudioEventEngine.hasActiveInterruption
  }

  /// True when the feed ring either does not exist or has already accepted a projection issued
  /// after the process returned to the foreground.
  ///
  /// The catalog lives in JS, so native cannot project the ring itself - it can only report that
  /// the process is in the foreground again and observe whether a fresh projection arrived.
  var isFeedRingProjectionFresh: Bool {
    guard let ring = currentFeedRing else {
      return true
    }
    return ring.hasAcceptedProjection(after: foregroundEpoch)
  }

  var currentForegroundEpoch: UInt64 {
    foregroundEpoch
  }

  func register(feedRing: HybridNitroFeedRingPlayer) {
    precondition(Thread.isMainThread)
    currentFeedRing = feedRing
  }

  func unregister(feedRing: HybridNitroFeedRingPlayer) {
    precondition(Thread.isMainThread)
    guard currentFeedRing === feedRing else {
      return
    }
    currentFeedRing = nil
  }

  func notifyForegroundListeners() {
    precondition(Thread.isMainThread)
    foregroundListeners.emit(event: "onForeground") { (listener: () -> Void) in
      listener()
    }
  }

  // MARK: - App Lifecycle

  func applicationWillResignActive() {
    HlsProxyRuntime.shared.markTransportNeedsHealthCheck()
    PlaybackSessionRuntime.shared.setForeground(false)
    for player in players.allObjects {
      if player.hasPlaybackBinding {
        continue
      }
      if !PlayerAppStatePolicy.shouldAutoPauseWhenInactive(player.appStateSnapshot()) {
        continue
      }

      player.lifecyclePause()
      player.wasAutoPaused = true
    }
  }

  func applicationDidBecomeActive() {
    PlaybackSessionRuntime.shared.setForeground(true)
    // Resume handled in willEnterForeground; clear any remaining flags
    for player in players.allObjects {
      if player.hasPlaybackBinding {
        continue
      }
      if PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(player.appStateSnapshot()) {
        player.wasAutoPaused = false
      }
    }
  }

  func applicationDidEnterBackground() {
    HlsProxyRuntime.shared.markTransportNeedsHealthCheck()
    NativeAudioSessionRuntime.shared.setForeground(false)
    PlaybackSessionRuntime.shared.setForeground(false)
    for player in players.allObjects {
      if player.hasPlaybackBinding {
        continue
      }
      if !PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(player.appStateSnapshot()) {
        continue
      }

      player.lifecyclePause()
      player.wasAutoPaused = true
    }
    for view in videoView.allObjects {
      view.suspendPlayerPresentationForBackground()
    }
    foregroundRecovery.cancel()
  }

  func applicationWillEnterForeground() {
    for player in players.allObjects {
      player.resetRecoveryBudgetsForNewLifecycleEpoch()
    }
    foregroundEpoch &+= 1
    foregroundRecovery.start()
    for view in videoView.allObjects {
      view.resumePlayerPresentationForForeground()
    }
    NativeAudioSessionRuntime.shared.reassertAfterProcessResumption()
    PlaybackSessionRuntime.shared.setForeground(true)
    for player in players.allObjects {
      if player.hasPlaybackBinding {
        continue
      }
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
  }

  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber,
      let type = AVAudioSession.InterruptionType(rawValue: typeValue.uintValue) else {
      return
    }

    switch type {
    case .began:
      systemAudioEventEngine.interruptionBegan()
    case .ended:
      let optionsValue = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? NSNumber
      let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue?.uintValue ?? 0)
      systemAudioEventEngine.interruptionEnded(shouldResume: options.contains(.shouldResume))
    @unknown default:
      return
    }
  }

  private func handleAudioSessionRouteChange(_ notification: Notification) {
    guard let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber,
      let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue.uintValue),
      reason == .oldDeviceUnavailable else {
      return
    }

    systemAudioEventEngine.oldOutputDeviceBecameUnavailable()
  }

  private func pauseUnboundTransient() {
    precondition(Thread.isMainThread)

    interruptedUnboundPlayers.removeAllObjects()
    for player in players.allObjects {
      guard !player.hasPlaybackBinding,
        !player.isReleased,
        player.hasActiveSource,
        player.wantsToPlay,
        player.isPlaybackAudioAudible else {
        continue
      }

      interruptedUnboundPlayers.add(player)
      player.lifecyclePause()
    }
  }

  private func resumeUnboundTransient() {
    precondition(Thread.isMainThread)

    let transientPlayers = interruptedUnboundPlayers.allObjects
    interruptedUnboundPlayers.removeAllObjects()
    let registeredPlayerIds = Set(players.allObjects.map(ObjectIdentifier.init))

    for player in transientPlayers {
      guard registeredPlayerIds.contains(ObjectIdentifier(player)),
        !player.isReleased,
        player.hasActiveSource,
        player.wantsToPlay,
        player.isPlaybackAudioAudible else {
        continue
      }

      do {
        try player.play()
      } catch {
        player.failPlayback(message: error.localizedDescription)
      }
    }
  }

  private func stopUnbound() {
    precondition(Thread.isMainThread)

    let registeredPlayers = players.allObjects
    let registeredPlayerIds = Set(registeredPlayers.map(ObjectIdentifier.init))
    let transientPlayers = interruptedUnboundPlayers.allObjects
    interruptedUnboundPlayers.removeAllObjects()

    var playerIds = Set<ObjectIdentifier>()
    var playersToStop: [HybridNitroPlayer] = []
    for player in transientPlayers where registeredPlayerIds.contains(ObjectIdentifier(player)) {
      if playerIds.insert(ObjectIdentifier(player)).inserted {
        playersToStop.append(player)
      }
    }
    for player in registeredPlayers where !player.hasPlaybackBinding && player.wantsToPlay {
      if playerIds.insert(ObjectIdentifier(player)).inserted {
        playersToStop.append(player)
      }
    }

    for player in playersToStop {
      do {
        try player.pause()
      } catch {
        player.failPlayback(message: error.localizedDescription)
      }
    }
  }

  private func muteOutput() {
    precondition(Thread.isMainThread)

    for player in players.allObjects where !player.isReleased {
      player.muted = true
    }
  }

  private func notifyOutputDeviceLost() {
    precondition(Thread.isMainThread)
    outputDeviceLostListeners.emit(event: "onOutputDeviceLost") { (listener: () -> Void) in
      listener()
    }
  }

  private func recoverAfterMediaServicesReset() {
    precondition(Thread.isMainThread)

    for player in players.allObjects where !player.isReleased {
      player.recoverAfterMediaServicesReset()
    }
  }

}
