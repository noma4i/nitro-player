import Foundation

/// Single source of truth for "is this URL an HLS manifest" detection, shared by the
/// proxy runtime, source factory and source so the `.m3u8` rule lives in one place.
enum HlsManifestUrl {
  static func matches(_ url: String) -> Bool {
    let withoutFragment = url.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? url
    let withoutQuery = withoutFragment.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? withoutFragment
    return withoutQuery.lowercased().hasSuffix(".m3u8")
  }
}
