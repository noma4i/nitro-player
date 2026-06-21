import Foundation

struct HlsIdentity {
  static func sourceKey(url: String, headers: [String: String]?) -> String {
    stableRequestKey(url: url, headers: headers)
  }

  static func resourceKey(url: String, headers: [String: String]?) -> String {
    stableRequestKey(url: url, headers: headers)
  }

  static func previewKey(url: String, headers: [String: String]?, profile: VideoPreviewProfile) -> String {
    "\(stableRequestKey(url: url, headers: headers))\npreview:\(profile.maxWidth)x\(profile.maxHeight)@\(profile.quality)"
  }

  private static func stableRequestKey(url: String, headers: [String: String]?) -> String {
    guard let headers, !headers.isEmpty else {
      return url
    }

    let stableHeaders = headers
      .keys
      .sorted()
      .map { "\($0)=\(headers[$0] ?? "")" }
      .joined(separator: "&")

    return "\(url)\n\(stableHeaders)"
  }
}
