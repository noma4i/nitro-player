import Foundation
import React

@objc(HlsCacheProxy)
class HlsCacheProxy: NSObject, RCTBridgeModule {
  static func moduleName() -> String! { "HlsCacheProxy" }
  static func requiresMainQueueSetup() -> Bool { false }

  private let controller = HlsProxyServerController()

  @objc
  func start(_ port: NSNumber?) {
    performOnMainThread {
      self.controller.start(port: port?.intValue)
    }
  }

  @objc
  func stop() {
    performOnMainThread {
      self.controller.stop()
    }
  }

  @objc(getProxiedUrl:headers:)
  func getProxiedUrl(_ url: String, headers: NSDictionary?) -> String {
    let headerMap = headers as? [String: String]
    var proxiedUrl: String?
    performOnMainThread(waitUntilDone: true) {
      proxiedUrl = self.controller.proxiedManifestUrl(for: url, headers: headerMap)
    }
    return proxiedUrl ?? url
  }

  @objc
  func prefetchFirstSegment(_ url: String, headers: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    let headerMap = headers as? [String: String]
    Task.detached { [controller] in
      do {
        try await controller.prefetchFirstSegment(url: url, headers: headerMap)
        resolver(true)
      } catch {
        rejecter("prefetch_error", error.localizedDescription, error)
      }
    }
  }

  @objc
  func getCacheStats(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(controller.getCacheStats())
  }

  @objc
  func clearCache(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    controller.clearCache()
    resolver(true)
  }

  private func performOnMainThread(waitUntilDone: Bool = false, _ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
      return
    }

    if waitUntilDone {
      DispatchQueue.main.sync(execute: work)
      return
    }

    DispatchQueue.main.async(execute: work)
  }
}
