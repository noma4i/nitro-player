import CryptoKit
import Foundation

enum HlsRequestIdentity {
  static func cacheNamespace(url: String, headers: [String: String]?) -> String {
    var hasher = SHA256()
    append(url, to: &hasher)

    for (name, value) in normalizedHeaders(headers) {
      append(name, to: &hasher)
      append(value, to: &hasher)
    }

    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  static func transportHeaders(url: String, headers: [String: String]?) -> [String: String] {
    let sourceHeaders = sourceHeaders(headers)
    let namespaceHeader = KTVHTTPCache.cacheNamespaceHeader()
    let forwardedHeaderNamesHeader = KTVHTTPCache.forwardedHeaderNamesHeader()
    var transportHeaders = sourceHeaders
    transportHeaders[namespaceHeader] = cacheNamespace(
      url: url,
      headers: sourceHeaders
    )
    if !sourceHeaders.isEmpty {
      transportHeaders[forwardedHeaderNamesHeader] = sourceHeaders.keys
        .map { $0.lowercased() }
        .sorted()
        .joined(separator: ",")
    }
    return transportHeaders
  }

  private static func normalizedHeaders(_ headers: [String: String]?) -> [(String, String)] {
    var normalized: [(String, String)] = []
    for (name, value) in sourceHeaders(headers) {
      guard !name.isEmpty,
            !value.isEmpty
      else {
        continue
      }
      normalized.append((name.lowercased(), value))
    }
    return normalized.sorted { lhs, rhs in
      lhs.0 == rhs.0 ? lhs.1 < rhs.1 : lhs.0 < rhs.0
    }
  }

  private static func sourceHeaders(_ headers: [String: String]?) -> [String: String] {
    let namespaceHeader = KTVHTTPCache.cacheNamespaceHeader()
    let forwardedHeaderNamesHeader = KTVHTTPCache.forwardedHeaderNamesHeader()
    return (headers ?? [:]).filter { name, _ in
      name.caseInsensitiveCompare(namespaceHeader) != .orderedSame &&
        name.caseInsensitiveCompare(forwardedHeaderNamesHeader) != .orderedSame
    }
  }

  private static func append(_ value: String, to hasher: inout SHA256) {
    let data = Data(value.utf8)
    var length = UInt64(data.count).bigEndian
    withUnsafeBytes(of: &length) { hasher.update(data: Data($0)) }
    hasher.update(data: data)
  }
}
