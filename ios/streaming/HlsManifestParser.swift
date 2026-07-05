import Foundation

final class HlsManifestParser {
  func isMasterPlaylist(_ manifest: String) -> Bool {
    manifest.contains("#EXT-X-STREAM-INF")
  }

  // In Swift "\r\n" is a single grapheme-cluster Character, so splitting on the
  // "\n" Character leaves a CRLF manifest as one unbroken line. Splitting on any
  // Unicode newline (isNewline matches "\n", "\r" and the "\r\n" cluster) restores
  // parity with Android's line-based processing.
  private func splitLines(_ manifest: String, keepEmpty: Bool) -> [Substring] {
    manifest.split(omittingEmptySubsequences: !keepEmpty, whereSeparator: { $0.isNewline })
  }

  func extractVariantUrls(_ manifest: String) -> [String] {
    extractStreamVariants(manifest: manifest, baseUrl: nil).compactMap { $0["uri"] as? String }
  }

  func extractStreamVariants(manifest: String, baseUrl: String?) -> [[String: Any]] {
    let lines = splitLines(manifest, keepEmpty: false)
    var variants: [[String: Any]] = []
    var index = 0
    while index < lines.count {
      let line = String(lines[index]).trimmingCharacters(in: .whitespacesAndNewlines)
      if line.hasPrefix("#EXT-X-STREAM-INF") && index + 1 < lines.count {
        let next = String(lines[index + 1]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !next.hasPrefix("#") && !next.isEmpty {
          let attributes = parseAttributeList(from: line)
          let resolution = parseResolution(attributes["RESOLUTION"])
          variants.append([
            "bandwidth": parseInt(attributes["BANDWIDTH"]) ?? 0,
            "averageBandwidth": nullable(parseInt(attributes["AVERAGE-BANDWIDTH"])),
            "width": nullable(resolution?.width),
            "height": nullable(resolution?.height),
            "codecs": nullable(attributes["CODECS"]),
            "uri": baseUrl.map { resolveUrl(base: $0, relative: next) } ?? next
          ])
        }
        index += 1
      }
      index += 1
    }
    return variants
  }

  func extractLeadingSegments(_ manifest: String, count: Int) -> (initSegment: String?, segments: [String]) {
    let lines = splitLines(manifest, keepEmpty: false)
    let targetCount = max(0, count)
    var initSegment: String?
    var segments: [String] = []

    for raw in lines {
      let line = String(raw).trimmingCharacters(in: .whitespacesAndNewlines)
      if line.hasPrefix("#EXT-X-MAP"), let uri = extractUri(from: line) {
        initSegment = uri
      }
      if !line.hasPrefix("#") && !line.isEmpty {
        if segments.count < targetCount {
          segments.append(line)
        }
        if segments.count >= targetCount {
          break
        }
      }
    }

    return (initSegment, segments)
  }

  func resolveUrl(base: String, relative: String) -> String {
    if let url = URL(string: relative, relativeTo: URL(string: base)) {
      return url.absoluteString
    }
    return relative
  }

  private static let uriPattern = try! NSRegularExpression(pattern: "URI=\"([^\"]+)\"", options: [])

  private func parseAttributeList(from streamInfoLine: String) -> [String: String] {
    guard let colon = streamInfoLine.firstIndex(of: ":") else {
      return [:]
    }

    var attributes: [String: String] = [:]
    var key = ""
    var value = ""
    var readingKey = true
    var insideQuotes = false

    for character in streamInfoLine[streamInfoLine.index(after: colon)...] {
      if character == "\"" {
        insideQuotes.toggle()
        continue
      }
      if readingKey && character == "=" {
        readingKey = false
        continue
      }
      if !insideQuotes && character == "," {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedKey.isEmpty {
          attributes[normalizedKey] = value.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        key = ""
        value = ""
        readingKey = true
        continue
      }
      if readingKey {
        key.append(character)
      } else {
        value.append(character)
      }
    }

    let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
    if !normalizedKey.isEmpty {
      attributes[normalizedKey] = value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return attributes
  }

  private func parseInt(_ value: String?) -> Int? {
    guard let value else {
      return nil
    }
    return Int(value.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  private func parseResolution(_ value: String?) -> (width: Int, height: Int)? {
    guard let value else {
      return nil
    }
    let parts = value.lowercased().split(separator: "x", maxSplits: 1).compactMap { Int($0) }
    guard parts.count == 2 else {
      return nil
    }
    return (parts[0], parts[1])
  }

  private func nullable(_ value: Any?) -> Any {
    value ?? NSNull()
  }

  private func extractUri(from tagLine: String) -> String? {
    guard let match = Self.uriPattern.firstMatch(in: tagLine, options: [], range: NSRange(location: 0, length: tagLine.count)) else { return nil }
    guard let range = Range(match.range(at: 1), in: tagLine) else { return nil }
    return String(tagLine[range])
  }
}
