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

struct ViewListenerPair {
  let id: UUID
  let eventName: String
  let callback: Any
}

private let vmLogger = Logger(subsystem: "com.nitroplay.video", category: "ViewManager")

class HybridNitroPlayerViewManager: HybridNitroPlayerViewManagerSpec {
  weak var view: NitroPlayerComponentView?
  var listeners: [ViewListenerPair] = []

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

  private func addListener<T>(eventName: String, listener: T) -> ListenerSubscription {
    let id = UUID()
    listeners.append(ViewListenerPair(id: id, eventName: eventName, callback: listener))
    return ListenerSubscription(remove: { [weak self] in
      self?.listeners.removeAll { $0.id == id }
    })
  }

  private func emitEvent<T>(eventName: String, invoke: (T) throws -> Void) {
    for pair in listeners where pair.eventName == eventName {
      if let callback = pair.callback as? T {
        do {
          try invoke(callback)
        } catch {
          vmLogger.error("[NitroPlay] Error calling \(eventName) listener: \(error)")
        }
      } else {
        vmLogger.error("[NitroPlay] Invalid callback type for \(eventName)")
      }
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
    }
  }

  var isAttached: Bool {
    guard let view else {
      vmLogger.warning("\(self.DEALOCATED_WARNING)")
      return false
    }

    return view.isEffectivelyAttached
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
    addListener(eventName: "onFullscreenChange", listener: listener)
  }

  func addOnAttachedListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onAttached", listener: listener)
  }

  func addOnDetachedListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onDetached", listener: listener)
  }

  func addWillEnterFullscreenListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    addListener(eventName: "willEnterFullscreen", listener: listener)
  }

  func addWillExitFullscreenListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    addListener(eventName: "willExitFullscreen", listener: listener)
  }

  func clearAllListeners() throws {
    listeners.removeAll()
  }

  // MARK: - Event emission methods

  func onFullscreenChange(_ isActive: Bool) {
    emitEvent(eventName: "onFullscreenChange") { (callback: (Bool) throws -> Void) in try callback(isActive) }
  }

  func onAttached() {
    emitEvent(eventName: "onAttached") { (callback: () throws -> Void) in try callback() }
  }

  func onDetached() {
    emitEvent(eventName: "onDetached") { (callback: () throws -> Void) in try callback() }
  }

  func willEnterFullscreen() {
    emitEvent(eventName: "willEnterFullscreen") { (callback: () throws -> Void) in try callback() }
  }

  func willExitFullscreen() {
    emitEvent(eventName: "willExitFullscreen") { (callback: () throws -> Void) in try callback() }
  }
}
