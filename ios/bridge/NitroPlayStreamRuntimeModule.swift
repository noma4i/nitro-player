import AVFoundation
import Foundation
import React

@objc(NitroPlayStreamRuntime)
class NitroPlayStreamRuntime: NSObject, RCTBridgeModule {
  static func moduleName() -> String! { "NitroPlayStreamRuntime" }
  static func requiresMainQueueSetup() -> Bool { true }

  override init() {
    super.init()
  }

  @objc
  func start(_ port: NSNumber?) {
    HlsProxyRuntime.shared.start(port: port?.intValue)
  }

  @objc
  func stop() {
    HlsProxyRuntime.shared.stop()
  }

  @objc(getProxiedUrl:headers:)
  func getProxiedUrl(_ url: String, headers: NSDictionary?) -> String {
    HlsProxyRuntime.shared.getProxiedUrl(url: url, headers: headers as? [String: String])
  }

  @objc
  func prefetchLeadingSegments(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    Task.detached {
      do {
        try await HlsProxyRuntime.shared.prefetchLeadingSegments(url: url, headers: headers as? [String: String])
        resolver(true)
      } catch {
        rejecter("prefetch_error", error.localizedDescription, error)
      }
    }
  }

  @objc
  func getCacheStats(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(HlsProxyRuntime.shared.getCacheStats())
  }

  @objc
  func getStreamCacheStats(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(HlsProxyRuntime.shared.getStreamCacheStats(url: url, headers: headers as? [String: String]))
  }

  @objc
  func getStreamVariants(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    Task.detached {
      do {
        let variants = try await HlsProxyRuntime.shared.getStreamVariants(url: url, headers: headers as? [String: String])
        resolver(variants)
      } catch {
        rejecter("variants_error", error.localizedDescription, error)
      }
    }
  }

  @objc
  func getPlayersDiagnostics(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      resolver([
        "capturedAt": Date().timeIntervalSince1970 * 1000,
        "players": NitroPlayerManager.shared.registeredPlayers().map(Self.playerDiagnostics),
        "proxyLedger": HlsProxyRuntime.shared.requestLedgerSnapshot()
      ])
    }
  }

  @objc
  func getNetworkThroughputEstimate(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(HlsProxyRuntime.shared.getNetworkThroughputEstimate())
  }

  @objc
  func configureCache(_ options: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    let maxBytes = options?["maxBytes"] as? NSNumber
    let prefetchSegments = options?["prefetchSegments"] as? NSNumber
    HlsProxyRuntime.shared.configureCache(
      maxBytes: maxBytes.map { Int($0.int64Value) },
      prefetchSegments: prefetchSegments.map { Int($0.intValue) }
    )
    resolver(true)
  }

  @objc
  func getThumbnailUrl(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    Task.detached {
      do {
        let result = await HlsProxyRuntime.shared.getThumbnailUrl(url: url, headers: headers as? [String: String])
        resolver(result)
      } catch {
        rejecter("thumbnail_error", error.localizedDescription, error)
      }
    }
  }

  @objc
  func peekThumbnailUrl(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(HlsProxyRuntime.shared.peekThumbnailUrl(url: url, headers: headers as? [String: String]))
  }

  @objc
  func clearCache(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    HlsProxyRuntime.shared.clearCache()
    resolver(true)
  }

  @objc
  func clearPreview(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    HlsProxyRuntime.shared.clearPreview()
    resolver(true)
  }

  private static func playerDiagnostics(_ player: HybridNitroPlayer) -> [String: Any] {
    [
      "automaticallyWaitsToMinimizeStalling": player.player.automaticallyWaitsToMinimizeStalling,
      "playbackWatchdogAttempts": player.playbackWatchdogAttemptCount,
      "cachedTimeControlStatus": timeControlStatusName(player.cachedTimeControlStatus),
      "sourceUri": player.currentHybridSource()?.originalConfig.uri ?? NSNull(),
      "currentItemUrl": currentItemUrl(player.playerItem) ?? NSNull(),
      "preferredPeakBitRate": player.playerItem?.preferredPeakBitRate ?? NSNull(),
      "timeControlStatus": player.player.timeControlStatus.rawValue,
      "rate": player.player.rate,
      "accessLog": accessLogDiagnostics(player.playerItem?.accessLog()?.events.last) ?? NSNull()
    ]
  }

  private static func currentItemUrl(_ item: AVPlayerItem?) -> String? {
    (item?.asset as? AVURLAsset)?.url.absoluteString
  }

  private static func accessLogDiagnostics(_ event: AVPlayerItemAccessLogEvent?) -> [String: Any]? {
    guard let event else {
      return nil
    }

    return [
      "numberOfStalls": event.numberOfStalls,
      "indicatedBitrate": event.indicatedBitrate,
      "observedBitrate": event.observedBitrate,
      "switchBitrate": event.switchBitrate,
      "startupTime": event.startupTime,
      "durationWatched": event.durationWatched,
      "downloadOverdue": event.downloadOverdue,
      "numberOfBytesTransferred": event.numberOfBytesTransferred,
      "uri": event.uri ?? NSNull()
    ]
  }

  private static func timeControlStatusName(_ status: AVPlayer.TimeControlStatus) -> String {
    switch status {
    case .paused:
      return "paused"
    case .waitingToPlayAtSpecifiedRate:
      return "waitingToPlayAtSpecifiedRate"
    case .playing:
      return "playing"
    @unknown default:
      return "unknown"
    }
  }
}
