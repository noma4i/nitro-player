import Foundation

enum HlsKtvCacheStats {
  static func fileCount<T>(from cacheItems: [T]?) -> Int {
    cacheItems?.count ?? 0
  }
}
