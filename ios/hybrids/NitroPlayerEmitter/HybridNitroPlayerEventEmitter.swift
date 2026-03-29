import Foundation
import NitroModules

class HybridNitroPlayerEventEmitter: HybridNitroPlayerEventEmitterSpec {
  private let registry = ListenerRegistry()

  func addOnBandwidthUpdateListener(listener: @escaping (BandwidthData) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onBandwidthUpdate", listener: listener)
  }

  func addOnLoadListener(listener: @escaping (onLoadData) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onLoad", listener: listener)
  }

  func addOnLoadStartListener(listener: @escaping (onLoadStartData) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onLoadStart", listener: listener)
  }

  func addOnPlaybackStateListener(listener: @escaping (PlaybackState) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onPlaybackState", listener: listener)
  }

  func addOnVolumeChangeListener(listener: @escaping (onVolumeChangeData) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onVolumeChange", listener: listener)
  }

  func clearAllListeners() throws {
    registry.clearAll()
  }

  func onBandwidthUpdate(_ data: BandwidthData) {
    registry.emit(event: "onBandwidthUpdate") { (cb: (BandwidthData) throws -> Void) in try cb(data) }
  }

  func onLoad(_ data: onLoadData) {
    registry.emit(event: "onLoad") { (cb: (onLoadData) throws -> Void) in try cb(data) }
  }

  func onLoadStart(_ data: onLoadStartData) {
    registry.emit(event: "onLoadStart") { (cb: (onLoadStartData) throws -> Void) in try cb(data) }
  }

  func onPlaybackState(_ state: PlaybackState) {
    registry.emit(event: "onPlaybackState") { (cb: (PlaybackState) throws -> Void) in try cb(state) }
  }

  func onVolumeChange(_ data: onVolumeChangeData) {
    registry.emit(event: "onVolumeChange") { (cb: (onVolumeChangeData) throws -> Void) in try cb(data) }
  }
}
