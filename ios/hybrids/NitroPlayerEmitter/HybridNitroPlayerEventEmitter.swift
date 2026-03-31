import Foundation
import NitroModules

class HybridNitroPlayerEventEmitter: HybridNitroPlayerEventEmitterSpec {
  private let registry = ListenerRegistry()
  private var latestFirstFrame: onFirstFrameData?
  var onFirstFrameListenerAdded: (() -> Void)?

  func addOnBandwidthUpdateListener(listener: @escaping (BandwidthData) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onBandwidthUpdate", listener: listener)
  }

  func addOnErrorListener(listener: @escaping (PlaybackError) -> Void) throws -> ListenerSubscription {
    registry.add(event: "onError", listener: listener)
  }

  func addOnFirstFrameListener(listener: @escaping (onFirstFrameData) -> Void) throws -> ListenerSubscription {
    let subscription = registry.add(event: "onFirstFrame", listener: listener)
    if let latestFirstFrame {
      try? listener(latestFirstFrame)
    } else {
      onFirstFrameListenerAdded?()
    }
    return subscription
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

  func onError(_ error: PlaybackError) {
    registry.emit(event: "onError") { (cb: (PlaybackError) throws -> Void) in try cb(error) }
  }

  func onFirstFrame(_ data: onFirstFrameData) {
    latestFirstFrame = data
    registry.emit(event: "onFirstFrame") { (cb: (onFirstFrameData) throws -> Void) in try cb(data) }
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

  func resetStickyState() {
    latestFirstFrame = nil
  }

  func hasOnFirstFrameListeners() -> Bool {
    registry.hasListeners(event: "onFirstFrame")
  }
}
