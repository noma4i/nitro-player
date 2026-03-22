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

  func addOnBandwidthUpdateListener(listener: @escaping (BandwidthData) -> Void) throws -> ListenerSubscription {
    addListener(eventName: "onBandwidthUpdate", listener: listener)
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

  func onBandwidthUpdate(_ data: BandwidthData) {
    emitEvent(eventName: "onBandwidthUpdate") { (callback: (BandwidthData) throws -> Void) in try callback(data) }
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
