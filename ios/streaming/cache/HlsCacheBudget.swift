enum HlsCacheBudget {
  static let defaultMaxBytes: Int64 = 4 * 1_024 * 1_024 * 1_024
  static let minimumMaxBytes: Int64 = 64 * 1_024 * 1_024

  static func isValid(_ bytes: Int64) -> Bool {
    bytes >= minimumMaxBytes
  }
}
