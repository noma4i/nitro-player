import Foundation

struct HlsIdentity {
  static func requestKey(url: String, headers: [String: String]?) -> String {
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

  static func previewKey(url: String, headers: [String: String]?, profile: VideoPreviewProfile) -> String {
    "\(requestKey(url: url, headers: headers))\npreview:\(profile.maxWidth)x\(profile.maxHeight)@\(profile.quality)"
  }
}
