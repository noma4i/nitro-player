import Foundation
import NitroModules

class HybridNitroVideoPreview: HybridNitroVideoPreviewSpec {
  func getThumbnailUrl(url: String, headers: Dictionary<String, String>?) throws -> Promise<Variant_NullType_String> {
    return Promise.async {
      Self.nullableString(await HlsProxyRuntime.shared.getThumbnailUrl(url: url, headers: headers))
    }
  }

  func peekThumbnailUrl(url: String, headers: Dictionary<String, String>?) throws -> Promise<Variant_NullType_String> {
    return Promise.async {
      Self.nullableString(HlsProxyRuntime.shared.peekThumbnailUrl(url: url, headers: headers))
    }
  }

  func clearPreview() throws -> Promise<Bool> {
    return Promise.async {
      HlsProxyRuntime.shared.clearPreview()
      return true
    }
  }

  private static func nullableString(_ value: String?) -> Variant_NullType_String {
    guard let value else {
      return .first(.null)
    }
    return .second(value)
  }
}
