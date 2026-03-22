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
      guard let player = player as? HybridNitroPlayer else { return }
      configureAVPlayerViewController(with: player.player)
      if superview != nil, window != nil {
        player.notifyViewAttached()
      }
    }
  }

  var delegate: NitroPlayerViewDelegate?
  private var playerView: UIView? = nil
  private var pendingPlayer: AVPlayer? = nil
  private var configurationGeneration: UInt = 0

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

  public var allowsPictureInPicturePlayback: Bool = false {
    didSet {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, let playerViewController = self.playerViewController else { return }

        playerViewController.allowsPictureInPicturePlayback = self.allowsPictureInPicturePlayback
      }
    }
  }

  public var autoEnterPictureInPicture: Bool = false {
    didSet {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, let playerViewController = self.playerViewController else { return }

        playerViewController.canStartPictureInPictureAutomaticallyFromInline =
          self.autoEnterPictureInPicture
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
  }

  private func isReadyForControllerAttachment() -> Bool {
    guard superview != nil, window != nil, let playerView = playerView, playerView.window != nil else {
      return false
    }

    return findViewController() != nil
  }

  private func detachPlayerViewController() {
    guard let playerViewController else {
      return
    }

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
    pendingPlayer = player
    let generation = configurationGeneration

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      guard generation == self.configurationGeneration else { return }
      guard self.pendingPlayer === player else { return }
      guard let playerView = self.playerView, self.isReadyForControllerAttachment(), let parentVC = self.findViewController() else { return }

      // Skip reconfiguration if player hasn't changed and controller already exists
      if let existingController = self.playerViewController,
        existingController.player === player
      {
        self.pendingPlayer = nil
        return
      }

      // Remove previous controller if any
      self.detachPlayerViewController()
      guard generation == self.configurationGeneration else { return }
      guard self.pendingPlayer === player else { return }
      guard self.isReadyForControllerAttachment() else { return }

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
       // Disable video frame analysis to prevent visual lookup
      if #available(iOS 16.0, iPadOS 16.0, macCatalyst 18.0, *) {
        controller.allowsVideoFrameAnalysis = false
      }

      guard generation == self.configurationGeneration else { return }
      guard self.pendingPlayer === player else { return }
      guard self.isReadyForControllerAttachment() else { return }

      parentVC.addChild(controller)
      playerView.addSubview(controller.view)
      controller.didMove(toParent: parentVC)
      self.playerViewController = controller
      self.pendingPlayer = nil
    }
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
    super.willMove(toSuperview: newSuperview)

    if newSuperview == nil {
      (player as? HybridNitroPlayer)?.notifyViewDetached()
      invalidatePendingConfiguration()
      pendingPlayer = nil
      detachPlayerViewController()
      // We want to disable this when view is about to unmount
      if keepScreenAwake {
        keepScreenAwake = false
      }
    } else {
      // We want to restore keepScreenAwake after component remount
      if _keepScreenAwake {
        keepScreenAwake = true
      }
    }
  }

  public override func didMoveToSuperview() {
    super.didMoveToSuperview()

    if superview != nil {
      (player as? HybridNitroPlayer)?.notifyViewAttached()
    }
    flushPendingPlayerConfigurationIfNeeded()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()

    if window != nil {
      (player as? HybridNitroPlayer)?.notifyViewAttached()
    }
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

  public func startPictureInPicture() throws {
    guard let playerViewController else {
      throw NitroPlayerViewError.viewIsDeallocated.error()
    }

    guard AVPictureInPictureController.isPictureInPictureSupported() else {
      throw NitroPlayerViewError.pictureInPictureNotSupported.error()
    }

    DispatchQueue.main.async {
      // Here we skip error handling for simplicity
      // We do check for PiP support earlier in the code
      try? playerViewController.startPictureInPicture()
    }
  }

  public func stopPictureInPicture() throws {
    guard let playerViewController else {
      throw NitroPlayerViewError.viewIsDeallocated.error()
    }

    DispatchQueue.main.async {
      // Here we skip error handling for simplicity
      // We do check for PiP support earlier in the code
      playerViewController.stopPictureInPicture()
    }
  }
}
