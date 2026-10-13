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
  func onAttached()
  func onDetached()
  func onFullscreenChange(_ isActive: Bool)
  func willEnterFullscreen()
  func willExitFullscreen()
  func onReadyToDisplay(player: AVPlayer, playerItem: AVPlayerItem)
  func onNotReadyToDisplay(player: AVPlayer, playerItem: AVPlayerItem)
}

// Map delegate methods to view manager methods
final class NitroPlayerViewDelegate: NSObject, NitroPlayerComponentViewDelegate {
  weak var viewManager: HybridNitroPlayerViewManager?

  init(viewManager: HybridNitroPlayerViewManager) {
    self.viewManager = viewManager
  }

  func onAttached() {
    viewManager?.onAttached()
  }

  func onDetached() {
    viewManager?.onDetached()
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

  // lifecycle-audit:ignore(guarded-by-markReadyToDisplay)
  func onReadyToDisplay(player: AVPlayer, playerItem: AVPlayerItem) {
    if let hybridPlayer = viewManager?.player as? HybridNitroPlayer {
      hybridPlayer.markReadyToDisplay(
        expectedPlayer: player,
        expectedPlayerItem: playerItem
      )
    }
  }

  func onNotReadyToDisplay(player: AVPlayer, playerItem: AVPlayerItem) {
    if let hybridPlayer = viewManager?.player as? HybridNitroPlayer {
      hybridPlayer.markNotReadyToDisplay(
        expectedPlayer: player,
        expectedPlayerItem: playerItem
      )
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
    let observedPlayer = playerViewController.player

    onReadyToDisplayObserver = playerViewController.observe(\.isReadyForDisplay, options: [.new]) { [weak self, weak playerViewController, weak observedPlayer] _, change in
      guard
        let self,
        let view = self.view,
        let playerViewController,
        let observedPlayer,
        let observedPlayerItem = observedPlayer.currentItem,
        view.playerViewController === playerViewController,
        playerViewController.player === observedPlayer,
        let currentPlayer = view.player as? HybridNitroPlayer,
        currentPlayer.player === observedPlayer,
        currentPlayer.playerItem === observedPlayerItem,
        observedPlayer.currentItem === observedPlayerItem
      else {
        return
      }

      if change.newValue == true {
        self.delegate?.onReadyToDisplay(player: observedPlayer, playerItem: observedPlayerItem)
      } else if change.newValue == false {
        self.delegate?.onNotReadyToDisplay(player: observedPlayer, playerItem: observedPlayerItem)
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
