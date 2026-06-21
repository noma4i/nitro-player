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
  func prefetchFirstSegment(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    Task.detached {
      do {
        try await HlsProxyRuntime.shared.prefetchFirstSegment(url: url, headers: headers as? [String: String])
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
  func configureCache(_ options: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    let maxBytes = options?["maxBytes"] as? NSNumber
    HlsProxyRuntime.shared.configureCache(maxBytes: Int(maxBytes?.int64Value ?? Int64(HlsCacheBudget.defaultMaxBytes)))
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
}
