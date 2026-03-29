//
//  HybridNitroPlayerViewManager.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 23/09/2024.
//

import Foundation
import AVKit
import NitroModules
import OSLog

private let vmLogger = Logger(subsystem: "com.nitroplay.video", category: "ViewManager")

class HybridNitroPlayerViewManager: HybridNitroPlayerViewManagerSpec {
  weak var view: NitroPlayerComponentView?
  private let registry = ListenerRegistry()
  private var playerDefaults: NitroPlayerDefaults?

  let DEALOCATED_WARNING = "NitroPlay: NitroPlayerComponentView is no longer available. It is likely that the view was deallocated."

  init(nitroId: Double) throws {
    guard let view = NitroPlayerComponentView.globalViewsMap.object(forKey: NSNumber(value: nitroId)) else {
      throw NitroPlayerViewError.viewNotFound(nitroId: nitroId).error()
    }

    self.view = view
    super.init()
    view.delegate = NitroPlayerViewDelegate(viewManager: self)
  }

  // MARK: - Private helpers

  private func applyDefaults(to player: HybridNitroPlayer?) {
    guard let player, let defaults = playerDefaults else {
      return
    }

    if let loop = defaults.loop {
      player.loop = loop
    }
    if let muted = defaults.muted {
      player.muted = muted
    }
    if let volume = defaults.volume {
      player.volume = volume
    }
    if let rate = defaults.rate {
      player.rate = rate
    }
    if let mixAudioMode = defaults.mixAudioMode {
      player.mixAudioMode = mixAudioMode
    }
    if let ignoreSilentSwitchMode = defaults.ignoreSilentSwitchMode {
      player.ignoreSilentSwitchMode = ignoreSilentSwitchMode
    }
    if let playInBackground = defaults.playInBackground {
      player.playInBackground = playInBackground
    }
    if let playWhenInactive = defaults.playWhenInactive {
      player.playWhenInactive = playWhenInactive
    }
  }

  // MARK: - Properties

  weak var player: (any HybridNitroPlayerSpec)? {
    get {
      guard let view = view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return nil
      }
      return view.player
    }
    set {
      guard let view = view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return
      }
      view.player = newValue
      applyDefaults(to: newValue as? HybridNitroPlayer)
    }
  }

  var isAttached: Bool {
    get {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return false
      }

      return view.isEffectivelyAttached
    }
    set {
      // Read-only semantic in consumer code; setter exists only to satisfy the generated HybridObject protocol.
    }
  }

  var controls: Bool {
    get {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return false
      }

      return view.controls
    }
    set {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return
      }

      view.controls = newValue
    }
  }

  var resizeMode: ResizeMode {
    get {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return .none
      }

      return view.resizeMode
    }
    set {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return
      }

      view.resizeMode = newValue
    }
  }

  var keepScreenAwake: Bool {
    get {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return false
      }

      return view.keepScreenAwake
    }
    set {
      guard let view else {
        vmLogger.warning("\(self.DEALOCATED_WARNING)")
        return
      }

      view.keepScreenAwake = newValue
    }
  }

  // Android only - no-op on iOS
  var surfaceType: SurfaceType = .surface

  func setPlayerDefaults(defaults: NitroPlayerDefaults) throws {
    playerDefaults = defaults
    applyDefaults(to: player as? HybridNitroPlayer)
  }

  func clearPlayerDefaults() throws {
    playerDefaults = nil
  }

  func enterFullscreen() throws {
    guard let view else {
      throw NitroPlayerViewError.viewIsDeallocated.error()
    }

    try view.enterFullscreen()
  }

  func exitFullscreen() throws {
    guard let view else {
      throw NitroPlayerViewError.viewIsDeallocated.error()
    }

    try view.exitFullscreen()
  }

  // MARK: - Listener registration methods

  func addOnFullscreenChangeListener(listener: @escaping (Bool) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onFullscreenChange", listener: listener)
  }

  func addOnAttachedListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    registry.add(event: "onAttached", listener: listener)
  }

  func addOnDetachedListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    registry.add(event: "onDetached", listener: listener)
  }

  func addWillEnterFullscreenListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    registry.add(event: "willEnterFullscreen", listener: listener)
  }

  func addWillExitFullscreenListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    registry.add(event: "willExitFullscreen", listener: listener)
  }

  func clearAllListeners() throws {
    registry.clearAll()
  }

  // MARK: - Event emission methods

  func onFullscreenChange(_ isActive: Bool) {
    registry.emit(event: "onFullscreenChange") { (cb: (Bool) throws -> Void) in try cb(isActive) }
  }

  func onAttached() {
    registry.emit(event: "onAttached") { (cb: () throws -> Void) in try cb() }
  }

  func onDetached() {
    registry.emit(event: "onDetached") { (cb: () throws -> Void) in try cb() }
  }

  func willEnterFullscreen() {
    registry.emit(event: "willEnterFullscreen") { (cb: () throws -> Void) in try cb() }
  }

  func willExitFullscreen() {
    registry.emit(event: "willExitFullscreen") { (cb: () throws -> Void) in try cb() }
  }
}
