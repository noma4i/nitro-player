//
//  HybridNitroPlayerEventEmitter.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 02/05/2025.
//

import Foundation
import NitroModules

struct ListenerPair {
  let id: UUID
  let eventName: String
  let callback: Any
}

class HybridNitroPlayerEventEmitter: HybridNitroPlayerEventEmitterSpec {
  var listeners: [ListenerPair] = []

  // MARK: - Private helpers

  private func addListener<T>(eventName: String, listener: T) -> ListenerSubscription {
    let id = UUID()
    listeners.append(ListenerPair(id: id, eventName: eventName, callback: listener))
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
          print("[NitroPlay] Error calling \(eventName) listener: \(error)")
        }
      } else {
        print("[NitroPlay] Invalid callback type for \(eventName)")
      }
    }
  }

  // MARK: - Listener registration methods

  func addOnAudioBecomingNoisyListener(listener: @escaping () -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onAudioBecomingNoisy", listener: listener)
  }

  func addOnAudioFocusChangeListener(listener: @escaping (Bool) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onAudioFocusChange", listener: listener)
  }

  func addOnBandwidthUpdateListener(listener: @escaping (BandwidthData) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onBandwidthUpdate", listener: listener)
  }

  func addOnControlsVisibleChangeListener(listener: @escaping (Bool) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onControlsVisibleChange", listener: listener)
  }

  func addOnExternalPlaybackChangeListener(listener: @escaping (Bool) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onExternalPlaybackChange", listener: listener)
  }

  func addOnLoadListener(listener: @escaping (onLoadData) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onLoad", listener: listener)
  }

  func addOnLoadStartListener(listener: @escaping (onLoadStartData) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onLoadStart", listener: listener)
  }

  func addOnPlaybackStateListener(listener: @escaping (PlaybackState) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onPlaybackState", listener: listener)
  }

  func addOnVolumeChangeListener(listener: @escaping (onVolumeChangeData) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onVolumeChange", listener: listener)
  }

  func clearAllListeners() throws {
    listeners.removeAll()
  }

  // MARK: - Event emission methods

  func onAudioBecomingNoisy() {
    emitEvent(eventName: "onAudioBecomingNoisy") { (callback: () throws -> Void) in try callback() }
  }

  func onAudioFocusChange(_ hasFocus: Bool) {
    emitEvent(eventName: "onAudioFocusChange") { (callback: (Bool) throws -> Void) in try callback(hasFocus) }
  }

  func onBandwidthUpdate(_ data: BandwidthData) {
    emitEvent(eventName: "onBandwidthUpdate") { (callback: (BandwidthData) throws -> Void) in try callback(data) }
  }

  func onControlsVisibleChange(_ isVisible: Bool) {
    emitEvent(eventName: "onControlsVisibleChange") { (callback: (Bool) throws -> Void) in try callback(isVisible) }
  }

  func onExternalPlaybackChange(_ isExternalPlaybackActive: Bool) {
    emitEvent(eventName: "onExternalPlaybackChange") { (callback: (Bool) throws -> Void) in try callback(isExternalPlaybackActive) }
  }

  func onLoad(_ data: onLoadData) {
    emitEvent(eventName: "onLoad") { (callback: (onLoadData) throws -> Void) in try callback(data) }
  }

  func onLoadStart(_ data: onLoadStartData) {
    emitEvent(eventName: "onLoadStart") { (callback: (onLoadStartData) throws -> Void) in try callback(data) }
  }

  func onPlaybackState(_ state: PlaybackState) {
    emitEvent(eventName: "onPlaybackState") { (callback: (PlaybackState) throws -> Void) in try callback(state) }
  }

  func onVolumeChange(_ data: onVolumeChangeData) {
    emitEvent(eventName: "onVolumeChange") { (callback: (onVolumeChangeData) throws -> Void) in try callback(data) }
  }
}
