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
  private let mainThreadExecutor = MainThreadResourceExecutor()
  weak var view: NitroPlayerComponentView?
  private let registry = ListenerRegistry()
  private var playerDefaults: NitroPlayerDefaults?
  private let nitroId: NSNumber
  private weak var assignedPlayer: (any HybridNitroPlayerSpec)?
  private lazy var viewDelegate = NitroPlayerViewDelegate(viewManager: self)

  let DEALOCATED_WARNING = "NitroPlay: NitroPlayerComponentView is no longer available. It is likely that the view was deallocated."

  static let managersByNitroId: NSMapTable<NSNumber, HybridNitroPlayerViewManager> = .strongToWeakObjects()

  init(nitroId: Double) throws {
    let nitroIdNumber = NSNumber(value: nitroId)
    self.nitroId = nitroIdNumber
    super.init()

    let view = mainThreadExecutor.run {
      let registeredView = NitroPlayerComponentView.globalViewsMap.object(forKey: nitroIdNumber)
      self.view = registeredView
      registeredView?.delegate = self.viewDelegate
      HybridNitroPlayerViewManager.managersByNitroId.setObject(self, forKey: nitroIdNumber)
      return registeredView
    }
    guard view != nil else {
      throw NitroPlayerViewError.viewNotFound(nitroId: nitroId).error()
    }
  }

  static func notifyViewRegistered(nitroId: NSNumber) {
    managersByNitroId.object(forKey: nitroId)?.healBindingToLatestView()
  }

  func healBindingToLatestView() {
    _ = currentView()
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

  private func currentView() -> NitroPlayerComponentView? {
    mainThreadExecutor.run {
      currentViewOnMain()
    }
  }

  private func currentViewOnMain() -> NitroPlayerComponentView? {
    if let latestView = NitroPlayerComponentView.globalViewsMap.object(forKey: nitroId), latestView !== view {
      view?.delegate = nil
      view = latestView
      latestView.delegate = viewDelegate
    }

    guard let view else {
      vmLogger.warning("\(self.DEALOCATED_WARNING)")
      return nil
    }

    view.delegate = viewDelegate
    if let assignedPlayer, (view.player as AnyObject?) !== (assignedPlayer as AnyObject?) {
      view.player = assignedPlayer
      applyDefaults(to: assignedPlayer as? HybridNitroPlayer)
    }
    return view
  }

  // MARK: - Properties

  weak var player: (any HybridNitroPlayerSpec)? {
    get {
      return mainThreadExecutor.run {
        currentViewOnMain()?.player
      }
    }
    set {
      assignedPlayer = newValue
      mainThreadExecutor.run {
        guard let view = currentViewOnMain() else { return }
        view.player = newValue
        applyDefaults(to: newValue as? HybridNitroPlayer)
      }
    }
  }

  var isAttached: Bool {
    get {
      return mainThreadExecutor.run {
        currentViewOnMain()?.isEffectivelyAttached == true
      }
    }
    set {
      // Read-only semantic in consumer code; setter exists only to satisfy the generated HybridObject protocol.
    }
  }

  var controls: Bool {
    get {
      return mainThreadExecutor.run {
        currentViewOnMain()?.controls == true
      }
    }
    set {
      mainThreadExecutor.run {
        currentViewOnMain()?.controls = newValue
      }
    }
  }

  var resizeMode: ResizeMode {
    get {
      return mainThreadExecutor.run {
        currentViewOnMain()?.resizeMode ?? .none
      }
    }
    set {
      mainThreadExecutor.run {
        currentViewOnMain()?.resizeMode = newValue
      }
    }
  }

  var keepScreenAwake: Bool {
    get {
      return mainThreadExecutor.run {
        currentViewOnMain()?.keepScreenAwake == true
      }
    }
    set {
      mainThreadExecutor.run {
        currentViewOnMain()?.keepScreenAwake = newValue
      }
    }
  }

  // Android only - no-op on iOS
  var surfaceType: SurfaceType = .surface

  func setPlayerDefaults(defaults: NitroPlayerDefaults) throws {
    playerDefaults = defaults
    mainThreadExecutor.run {
      applyDefaults(to: currentViewOnMain()?.player as? HybridNitroPlayer)
    }
  }

  func clearPlayerDefaults() throws {
    playerDefaults = nil
  }

  func enterFullscreen() throws {
    let result: Result<Void, Error> = mainThreadExecutor.run {
      guard let view = currentViewOnMain() else {
        return .failure(NitroPlayerViewError.viewIsDeallocated.error())
      }

      do {
        try view.enterFullscreen()
        return .success(())
      } catch {
        return .failure(error)
      }
    }
    try result.get()
  }

  func exitFullscreen() throws {
    let result: Result<Void, Error> = mainThreadExecutor.run {
      guard let view = currentViewOnMain() else {
        return .failure(NitroPlayerViewError.viewIsDeallocated.error())
      }

      do {
        try view.exitFullscreen()
        return .success(())
      } catch {
        return .failure(error)
      }
    }
    try result.get()
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
