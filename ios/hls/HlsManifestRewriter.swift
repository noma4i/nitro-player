import Foundation

final class HlsManifestRewriter {
  func manifestProxyUrl(url: String, headers: [String: String]?, port: Int) -> String? {
    buildProxyUrl(path: "/hls/manifest", url: url, headers: headers, port: port, flags: nil)
  }

  func segmentProxyUrl(url: String, headers: [String: String]?, port: Int, flags: [String: String]?) -> String? {
    buildProxyUrl(path: "/hls/segment", url: url, headers: headers, port: port, flags: flags)
  }

  func rewriteManifest(manifest: String, baseUrl: String, headers: [String: String]?, port: Int) -> String {
    if isMasterPlaylist(manifest) {
      return rewriteMaster(manifest: manifest, baseUrl: baseUrl, headers: headers, port: port)
    }
    return rewriteMedia(manifest: manifest, baseUrl: baseUrl, headers: headers, port: port)
  }

  func guessContentType(url: String) -> String {
    if url.hasSuffix(".m3u8") { return "application/vnd.apple.mpegurl" }
    if url.hasSuffix(".m4s") { return "video/iso.segment" }
    if url.hasSuffix(".mp4") { return "video/mp4" }
    return "video/MP2T"
  }

  func isMasterPlaylist(_ manifest: String) -> Bool {
    manifest.contains("#EXT-X-STREAM-INF")
  }

  func extractVariantUrls(_ manifest: String) -> [String] {
    let lines = manifest.split(separator: "\n")
    var urls: [String] = []
    var index = 0
    while index < lines.count {
      let line = String(lines[index]).trimmingCharacters(in: .whitespacesAndNewlines)
      if line.hasPrefix("#EXT-X-STREAM-INF") && index + 1 < lines.count {
        let next = String(lines[index + 1]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !next.hasPrefix("#") && !next.isEmpty {
          urls.append(next)
        }
        index += 1
      }
      index += 1
    }
    return urls
  }

  func extractInitAndFirstSegment(_ manifest: String) -> (String?, String?) {
    let lines = manifest.split(separator: "\n")
    var initSegment: String?
    var firstSegment: String?

    for raw in lines {
      let line = String(raw).trimmingCharacters(in: .whitespacesAndNewlines)
      if line.hasPrefix("#EXT-X-MAP"), let uri = extractUri(from: line) {
        initSegment = uri
      }
      if !line.hasPrefix("#") && !line.isEmpty {
        firstSegment = line
        break
      }
    }

    return (initSegment, firstSegment)
  }

  func resolveUrl(base: String, relative: String) -> String {
    if let url = URL(string: relative, relativeTo: URL(string: base)) {
      return url.absoluteString
    }
    return relative
  }

  func decodeHeaders(_ encoded: String?) -> [String: String]? {
    guard let encoded,
          let data = Data(base64Encoded: encoded),
          let json = try? JSONSerialization.jsonObject(with: data, options: []),
          let map = json as? [String: String] else {
      return nil
    }
    return map
  }

  private func rewriteMaster(manifest: String, baseUrl: String, headers: [String: String]?, port: Int) -> String {
    var output: [String] = []
    let lines = manifest.split(separator: "\n", omittingEmptySubsequences: false)
    var index = 0
    while index < lines.count {
      let line = String(lines[index])
      output.append(line)
      if line.hasPrefix("#EXT-X-STREAM-INF") && index + 1 < lines.count {
        let next = String(lines[index + 1])
        if !next.hasPrefix("#") && !next.isEmpty {
          let resolved = resolveUrl(base: baseUrl, relative: next)
          output.append(manifestProxyUrl(url: resolved, headers: headers, port: port) ?? resolved)
          index += 1
        }
      }
      index += 1
    }
    return output.joined(separator: "\n")
  }

  private func rewriteMedia(manifest: String, baseUrl: String, headers: [String: String]?, port: Int) -> String {
    var output: [String] = []
    let lines = manifest.split(separator: "\n", omittingEmptySubsequences: false)

    for raw in lines {
      let line = String(raw)
      if line.hasPrefix("#EXT-X-MAP"), let uri = extractUri(from: line) {
        let resolved = resolveUrl(base: baseUrl, relative: uri)
        let proxy = segmentProxyUrl(url: resolved, headers: headers, port: port, flags: nil) ?? resolved
        output.append(line.replacingOccurrences(of: uri, with: proxy))
        continue
      }
      if line.hasPrefix("#EXT-X-KEY"), let uri = extractUri(from: line) {
        let resolved = resolveUrl(base: baseUrl, relative: uri)
        let proxy = segmentProxyUrl(url: resolved, headers: headers, port: port, flags: nil) ?? resolved
        output.append(line.replacingOccurrences(of: uri, with: proxy))
        continue
      }
      if line.hasPrefix("#") || line.isEmpty {
        output.append(line)
        continue
      }
      let resolved = resolveUrl(base: baseUrl, relative: line)
      output.append(segmentProxyUrl(url: resolved, headers: headers, port: port, flags: nil) ?? resolved)
    }

    return output.joined(separator: "\n")
  }

  private func buildProxyUrl(path: String, url: String, headers: [String: String]?, port: Int, flags: [String: String]?) -> String? {
    var components = URLComponents()
    components.scheme = "http"
    components.host = "127.0.0.1"
    components.port = port
    components.path = path
    var items = [URLQueryItem(name: "url", value: url)]
    if let headers, let encoded = encodeHeaders(headers) {
      items.append(URLQueryItem(name: "headers", value: encoded))
    }
    flags?.forEach { items.append(URLQueryItem(name: $0.key, value: $0.value)) }
    components.queryItems = items
    return components.url?.absoluteString
  }

  private static let uriPattern = try! NSRegularExpression(pattern: "URI=\"([^\"]+)\"", options: [])

  private func extractUri(from tagLine: String) -> String? {
    guard let match = Self.uriPattern.firstMatch(in: tagLine, options: [], range: NSRange(location: 0, length: tagLine.count)) else { return nil }
    guard let range = Range(match.range(at: 1), in: tagLine) else { return nil }
    return String(tagLine[range])
  }

  private func encodeHeaders(_ headers: [String: String]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: headers, options: []) else { return nil }
    return data.base64EncodedString()
  }
}
