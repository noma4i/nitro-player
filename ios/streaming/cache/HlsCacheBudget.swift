import Foundation

enum HlsCacheBudget {
  static let defaultMaxBytes = 4 * 1_024 * 1_024 * 1_024
  static let minimumMaxBytes = 64 * 1_024 * 1_024

  static func normalize(_ bytes: Int) -> Int {
    max(minimumMaxBytes, bytes)
  }

  static func evictionTarget(for maxBytes: Int) -> Int {
    max(minimumMaxBytes, maxBytes * 90 / 100)
  }
}
