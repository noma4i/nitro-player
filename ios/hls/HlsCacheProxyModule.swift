import Foundation
import React

@objc(HlsCacheProxy)
class HlsCacheProxy: NSObject, RCTBridgeModule {
  static func moduleName() -> String! { "HlsCacheProxy" }
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
  func getStreamCacheStats(_ url: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(HlsProxyRuntime.shared.getStreamCacheStats(url: url))
  }

  @objc
  func getThumbnailUrl(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    Task.detached {
      let result = await HlsProxyRuntime.shared.getThumbnailUrl(url: url, headers: headers as? [String: String])
      resolver(result)
    }
  }

  @objc
  func clearCache(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    HlsProxyRuntime.shared.clearCache()
    resolver(true)
  }
}
