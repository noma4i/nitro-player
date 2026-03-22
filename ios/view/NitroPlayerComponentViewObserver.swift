//
//  NitroPlayerComponentViewObserver.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 06/05/2025.
//

import Foundation
import AVKit
import AVFoundation

protocol NitroPlayerComponentViewDelegate: AnyObject {
  func onFullscreenChange(_ isActive: Bool)
  func willEnterFullscreen()
  func willExitFullscreen()
  func onReadyToDisplay()
}

// Map delegate methods to view manager methods
final class NitroPlayerViewDelegate: NSObject, NitroPlayerComponentViewDelegate {
  weak var viewManager: HybridNitroPlayerViewManager?

  init(viewManager: HybridNitroPlayerViewManager) {
    self.viewManager = viewManager
  }

  func onFullscreenChange(_ isActive: Bool) {
    viewManager?.onFullscreenChange(isActive)
  }

  func willEnterFullscreen() {
    viewManager?.willEnterFullscreen()
  }

  func willExitFullscreen() {
    viewManager?.willExitFullscreen()
  }

  func onReadyToDisplay() {
    if let player = viewManager?.player as? HybridNitroPlayer {
      player.markReadyToDisplay()
    }
  }
}

class NitroPlayerComponentViewObserver: NSObject, AVPlayerViewControllerDelegate {
  private weak var view: NitroPlayerComponentView?

  var delegate: NitroPlayerViewDelegate? {
    get {
      return view?.delegate
    }
  }

  var playerViewController: AVPlayerViewController? {
    return view?.playerViewController
  }

  // playerViewController observers
  var onReadyToDisplayObserver: NSKeyValueObservation?

  init(view: NitroPlayerComponentView) {
    self.view = view
    super.init()
  }

  func initializePlayerViewControllerObservers() {
    guard let playerViewController = playerViewController else {
      return
    }

    onReadyToDisplayObserver = playerViewController.observe(\.isReadyForDisplay, options: [.new]) { [weak self] _, change in
      guard let self = self else { return }
      if change.newValue == true {
        self.delegate?.onReadyToDisplay()
      }
    }
  }

  func removePlayerViewControllerObservers() {
    onReadyToDisplayObserver?.invalidate()
    onReadyToDisplayObserver = nil
  }

  func updatePlayerViewControllerObservers() {
    removePlayerViewControllerObservers()
    initializePlayerViewControllerObservers()
  }

  func playerViewController(
    _: AVPlayerViewController,
    willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
  ) {
    delegate?.willExitFullscreen()

    coordinator.animate(alongsideTransition: nil) { [weak self] context in
      guard let self = self else { return }

      if context.isCancelled {
        self.delegate?.willEnterFullscreen()

        return
      }

      self.delegate?.onFullscreenChange(false)
    }
  }

  func playerViewController(
    _: AVPlayerViewController,
    willBeginFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
  ) {
    delegate?.willEnterFullscreen()

    coordinator.animate(alongsideTransition: nil) { [weak self] context in
      guard let self = self else { return }

      if context.isCancelled {
        self.delegate?.willExitFullscreen()

        return
      }

      self.delegate?.onFullscreenChange(true)
    }
  }
}
