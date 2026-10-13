//
//  NitroPlayerComponentView.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 30/09/2024.
//

import AVFoundation
import AVKit
import Foundation
import UIKit

@objc public class NitroPlayerComponentView: UIView {
  public weak var player: HybridNitroPlayerSpec? = nil {
    didSet {
      let previousPlayer = oldValue as? HybridNitroPlayer
      guard let player = player as? HybridNitroPlayer else {
        if previousPlayer != nil {
          // PATCH(yupi): surface-preserving reattach
          pendingTeardownGeneration &+= 1
          hardTeardownPlayerViewController()
        }
        invalidatePendingConfiguration()
        refreshAttachmentStateIfNeeded()
        return
      }

      if previousPlayer !== player {
        // PATCH(yupi): surface-preserving reattach
        pendingTeardownGeneration &+= 1
        invalidatePendingConfiguration()
        hardTeardownPlayerViewController()
      }

      configureAVPlayerViewController(with: player.player)
      refreshAttachmentStateIfNeeded()
    }
  }

  var delegate: NitroPlayerViewDelegate?
  private var playerView: UIView? = nil
  private var pendingPlayer: AVPlayer? = nil
  private var pendingPlayerId: ObjectIdentifier? = nil
  private var configurationGeneration: UInt = 0
  private var pendingTeardownGeneration: UInt = 0
  private var pendingAttachmentRefreshGeneration: UInt = 0
  private weak var reportedAttachedPlayer: HybridNitroPlayer? = nil
  private weak var presentationSuspendedPlayer: AVPlayer?
  private var isDelegateAttached = false

  private var observer: NitroPlayerComponentViewObserver? {
    didSet {
      playerViewController?.delegate = observer
      observer?.updatePlayerViewControllerObservers()
    }
  }

  private var _keepScreenAwake: Bool = false
  var keepScreenAwake: Bool {
    get {
      guard let player = player as? HybridNitroPlayer else { return false }
      return player.player.preventsDisplaySleepDuringVideoPlayback
    }
    set {
      guard let player = player as? HybridNitroPlayer else { return }
      player.player.preventsDisplaySleepDuringVideoPlayback = newValue
      _keepScreenAwake = newValue
    }
  }

  var playerViewController: AVPlayerViewController? {
    didSet {
      guard let observer, let playerViewController else { return }
      playerViewController.delegate = observer
      observer.updatePlayerViewControllerObservers()
    }
  }

  public var controls: Bool = false {
    didSet {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, let playerViewController = self.playerViewController else { return }
        playerViewController.showsPlaybackControls = self.controls
      }
    }
  }

  public var resizeMode: ResizeMode = .none {
    didSet {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, let playerViewController = self.playerViewController else { return }
        playerViewController.videoGravity = resizeMode.toVideoGravity()
      }
    }
  }

  @objc public var nitroId: NSNumber = -1 {
    didSet {
      NitroPlayerComponentView.globalViewsMap.setObject(self, forKey: nitroId)
      HybridNitroPlayerViewManager.notifyViewRegistered(nitroId: nitroId)
    }
  }

  @objc public static var globalViewsMap: NSMapTable<NSNumber, NitroPlayerComponentView> =
    .strongToWeakObjects()

  @objc public override init(frame: CGRect) {
    super.init(frame: frame)
    NitroPlayerManager.shared.register(view: self)
    setupPlayerView()
    observer = NitroPlayerComponentViewObserver(view: self)
  }

  deinit {
    pendingTeardownGeneration &+= 1
    hardTeardownPlayerViewController()
    refreshAttachmentStateIfNeeded(overrideViewAttached: false)
    NitroPlayerManager.shared.unregister(view: self)
  }

  @objc public required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupPlayerView()
  }

  func setNitroId(nitroId: NSNumber) {
    self.nitroId = nitroId
  }

  private func setupPlayerView() {
    // Create a UIView to hold the video player layer
    playerView = UIView(frame: self.bounds)
    playerView?.translatesAutoresizingMaskIntoConstraints = false
    if let playerView = playerView {
      addSubview(playerView)
      NSLayoutConstraint.activate([
        playerView.leadingAnchor.constraint(equalTo: self.leadingAnchor),
        playerView.trailingAnchor.constraint(equalTo: self.trailingAnchor),
        playerView.topAnchor.constraint(equalTo: self.topAnchor),
        playerView.bottomAnchor.constraint(equalTo: self.bottomAnchor),
      ])
    }
  }

  private func invalidatePendingConfiguration() {
    configurationGeneration &+= 1
    pendingPlayer = nil
    pendingPlayerId = nil
  }

  private func isReadyForControllerAttachment() -> Bool {
    guard superview != nil, window != nil, let playerView = playerView, playerView.window != nil else {
      return false
    }

    return findViewController() != nil
  }

  var isEffectivelyAttached: Bool {
    return player != nil && superview != nil && window != nil
  }

  private func shouldCommitConfiguration(
    scheduledGeneration: UInt,
    scheduledPlayerId: ObjectIdentifier
  ) -> Bool {
    PlayerViewBindingPolicy.shouldCommitConfiguration(
      scheduledGeneration: scheduledGeneration,
      currentGeneration: configurationGeneration,
      scheduledPlayerId: scheduledPlayerId,
      pendingPlayerId: pendingPlayerId,
      isReadyForAttachment: isReadyForControllerAttachment()
    )
  }

  private func refreshAttachmentStateIfNeeded(overrideViewAttached: Bool? = nil) {
    let currentPlayer = player as? HybridNitroPlayer
    let currentPlayerId = currentPlayer.flatMap { ObjectIdentifier($0) }
    let nextAttached = currentPlayer != nil && (overrideViewAttached ?? isEffectivelyAttached)
    let transition = PlayerViewBindingPolicy.attachmentTransition(
      state: PlayerViewAttachmentState(
        reportedPlayerId: reportedAttachedPlayer.flatMap { ObjectIdentifier($0) },
        delegateAttached: isDelegateAttached
      ),
      currentPlayerId: currentPlayerId,
      viewAttached: nextAttached
    )

    let decision = transition.decision

    if decision.detachReportedPlayer {
      reportedAttachedPlayer?.notifyViewDetached(view: self)
    }

    if decision.attachCurrentPlayer {
      currentPlayer?.notifyViewAttached(view: self)
    }

    if decision.notifyDelegateAttached {
      delegate?.onAttached()
      isDelegateAttached = true
    }

    if decision.notifyDelegateDetached {
      delegate?.onDetached()
      isDelegateAttached = false
    }

    isDelegateAttached = transition.nextState.delegateAttached

    if transition.nextState.reportedPlayerId != nil {
      reportedAttachedPlayer = currentPlayer
    } else {
      reportedAttachedPlayer = nil
    }
  }

  // PATCH(yupi): coalesce lifecycle attachment refresh to settled state
  private func scheduleAttachmentRefresh() {
    pendingAttachmentRefreshGeneration &+= 1
    let generation = pendingAttachmentRefreshGeneration
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard PlayerViewBindingPolicy.shouldRunCoalescedAttachmentRefresh(
        tokenIsCurrent: generation == self.pendingAttachmentRefreshGeneration
      ) else { return }
      self.refreshAttachmentStateIfNeeded()
    }
  }

  private func clearPendingConfigurationState() {
    pendingPlayer = nil
    pendingPlayerId = nil
  }

  private func hardTeardownPlayerViewController() {
    guard let playerViewController else {
      return
    }

    playerViewController.player = nil
    playerViewController.willMove(toParent: nil)
    playerViewController.view.removeFromSuperview()
    playerViewController.removeFromParent()
    self.playerViewController = nil
  }

  private func flushPendingPlayerConfigurationIfNeeded() {
    guard let pendingPlayer, isReadyForControllerAttachment() else {
      return
    }

    configureAVPlayerViewController(with: pendingPlayer)
  }

  public func configureAVPlayerViewController(with player: AVPlayer) {
    configurationGeneration &+= 1
    let scheduledGeneration = configurationGeneration
    let scheduledPlayerId = ObjectIdentifier(player)

    pendingPlayer = player
    pendingPlayerId = scheduledPlayerId

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      guard self.shouldCommitConfiguration(
        scheduledGeneration: scheduledGeneration,
        scheduledPlayerId: scheduledPlayerId
      ) else {
        return
      }

      guard let pendingPlayer = self.pendingPlayer,
        pendingPlayer === player,
        let parentVC = self.findViewController() else {
        return
      }

      guard self.isReadyForControllerAttachment() else {
        return
      }

      if let existingController = self.playerViewController,
        existingController.player === player
      {
        guard let playerView = self.playerView else {
          return
        }

        if existingController.parent !== parentVC {
          // PATCH(yupi): surface-preserving reattach
          existingController.willMove(toParent: nil)
          existingController.view.removeFromSuperview()
          existingController.removeFromParent()
          parentVC.addChild(existingController)
          playerView.insertSubview(existingController.view, at: 0)
          existingController.didMove(toParent: parentVC)
        } else {
          playerView.insertSubview(existingController.view, at: 0)
        }
        self.clearPendingConfigurationState()
        return
      }

      guard self.shouldCommitConfiguration(
        scheduledGeneration: scheduledGeneration,
        scheduledPlayerId: scheduledPlayerId
      ) else {
        return
      }

      self.hardTeardownPlayerViewController()

      guard self.shouldCommitConfiguration(
        scheduledGeneration: scheduledGeneration,
        scheduledPlayerId: scheduledPlayerId
      ) else {
        return
      }

      guard let playerView = self.playerView,
        let pendingPlayer = self.pendingPlayer,
        pendingPlayer === player else {
        return
      }

      guard self.isReadyForControllerAttachment() else {
        return
      }

      let controller = AVPlayerViewController()
      controller.player = player
      player.allowsExternalPlayback = false
      if #available(iOS 10.0, *) {
        player.usesExternalPlaybackWhileExternalScreenIsActive = false
      }
      controller.showsPlaybackControls = controls
      controller.videoGravity = self.resizeMode.toVideoGravity()
      controller.view.frame = playerView.bounds
      controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      controller.view.backgroundColor = .clear

      controller.updatesNowPlayingInfoCenter = false

      if #available(iOS 16.0, *) {
        if let initialSpeed = controller.speeds.first(where: { $0.rate == player.rate }) {
          controller.selectSpeed(initialSpeed)
        }
      }
      // Disable video frame analysis to prevent visual lookup.
      if #available(iOS 16.0, macCatalyst 18.0, *) {
        controller.allowsVideoFrameAnalysis = false
      }

      guard self.shouldCommitConfiguration(
        scheduledGeneration: scheduledGeneration,
        scheduledPlayerId: scheduledPlayerId
      ) else {
        return
      }

      guard let pendingPlayer = self.pendingPlayer,
        pendingPlayer === player else {
        return
      }

      parentVC.addChild(controller)
      playerView.insertSubview(controller.view, at: 0)
      controller.didMove(toParent: parentVC)
      self.playerViewController = controller
      self.clearPendingConfigurationState()
    }
  }

  /// The system tears down the AVPlayerViewController display layer while the app is suspended,
  /// which leaves players advancing with no frames presented. Detaching on background and
  /// re-attaching the very same player on foreground re-creates that layer.
  public func suspendPlayerPresentationForBackground() {
    guard let playerViewController, let attachedPlayer = playerViewController.player else {
      return
    }
    presentationSuspendedPlayer = attachedPlayer
    playerViewController.player = nil
  }

  /// Restores exactly the player that was detached. If a rebind attached a different player while
  /// the app was in the background, that newer binding wins and nothing is restored.
  public func resumePlayerPresentationForForeground() {
    guard let playerViewController, let suspendedPlayer = presentationSuspendedPlayer else {
      return
    }
    presentationSuspendedPlayer = nil
    guard playerViewController.player == nil else {
      return
    }
    playerViewController.player = suspendedPlayer
  }

  // Helper to find nearest UIViewController
  private func findViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let r = responder {
      if let vc = r as? UIViewController {
        return vc
      }
      responder = r.next
    }
    return nil
  }

  public override func willMove(toSuperview newSuperview: UIView?) {
    if newSuperview == nil {
      // PATCH(yupi): surface-preserving reattach
      pendingTeardownGeneration &+= 1
      let capturedTeardownGeneration = pendingTeardownGeneration
      let capturedPlayerIdentity = (player as? HybridNitroPlayer).map { ObjectIdentifier($0) }
      let capturedControllerIdentity = playerViewController.map { ObjectIdentifier($0) }
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }

        let samePlayerIdentity = capturedPlayerIdentity == (self.player as? HybridNitroPlayer).map { ObjectIdentifier($0) }
        let sameControllerIdentity = capturedControllerIdentity == self.playerViewController.map { ObjectIdentifier($0) }
        guard PlayerViewBindingPolicy.shouldExecuteDeferredTeardown(
          tokenIsCurrent: capturedTeardownGeneration == self.pendingTeardownGeneration,
          hasSuperview: self.superview != nil,
          samePlayerIdentity: samePlayerIdentity,
          sameControllerIdentity: sameControllerIdentity
        ) else {
          return
        }

        self.hardTeardownPlayerViewController()
        if self.keepScreenAwake {
          self.keepScreenAwake = false
        }
        self.refreshAttachmentStateIfNeeded(overrideViewAttached: false)
      }
    } else {
      // PATCH(yupi): surface-preserving reattach
      pendingTeardownGeneration &+= 1
      // We want to restore keepScreenAwake after component remount
      if _keepScreenAwake {
        keepScreenAwake = true
      }
      if let player = player as? HybridNitroPlayer {
        configureAVPlayerViewController(with: player.player)
      }
      // PATCH(yupi): coalesce lifecycle attachment refresh
      scheduleAttachmentRefresh()
    }

    super.willMove(toSuperview: newSuperview)
  }

  public override func didMoveToSuperview() {
    super.didMoveToSuperview()

    // PATCH(yupi): cancel deferred teardown only on genuine reattach
    if PlayerViewBindingPolicy.shouldCancelPendingTeardownOnReattach(isAttachedAfterTransition: superview != nil) {
      pendingTeardownGeneration &+= 1
    }
    // PATCH(yupi): coalesce lifecycle attachment refresh
    scheduleAttachmentRefresh()
    flushPendingPlayerConfigurationIfNeeded()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()

    // PATCH(yupi): cancel deferred teardown only on genuine reattach
    if PlayerViewBindingPolicy.shouldCancelPendingTeardownOnReattach(isAttachedAfterTransition: window != nil) {
      pendingTeardownGeneration &+= 1
    }
    // PATCH(yupi): coalesce lifecycle attachment refresh
    scheduleAttachmentRefresh()
    flushPendingPlayerConfigurationIfNeeded()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()

    // Update the frame of the playerViewController's view when the view's layout changes
    playerViewController?.view.frame = playerView?.bounds ?? .zero
    playerViewController?.contentOverlayView?.frame = playerView?.bounds ?? .zero
    for subview in playerViewController?.contentOverlayView?.subviews ?? [] {
      subview.frame = playerView?.bounds ?? .zero
    }
  }

  public override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    guard controls else {
      return false
    }

    return super.point(inside: point, with: event)
  }

  @objc public func acceptsTouchEvents() -> Bool {
    return controls
  }

  public func enterFullscreen() throws {
    guard let playerViewController else {
      throw NitroPlayerViewError.viewIsDeallocated.error()
    }

    DispatchQueue.main.async {
      let selector = NSSelectorFromString("enterFullScreenAnimated:completionHandler:")
      if playerViewController.responds(to: selector) {
        playerViewController.perform(selector, with: NSNumber(value: true), with: nil)
      }
    }
  }

  public func exitFullscreen() throws {
    guard let playerViewController else {
      throw NitroPlayerViewError.viewIsDeallocated.error()
    }

    DispatchQueue.main.async {
      let selector = NSSelectorFromString("exitFullScreenAnimated:completionHandler:")
      if playerViewController.responds(to: selector) {
        playerViewController.perform(selector, with: NSNumber(value: true), with: nil)
      }
    }
  }

}
