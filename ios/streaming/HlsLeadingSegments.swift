import Foundation

enum HlsLeadingSegments {
  private static let streamInf = "#EXT-X-STREAM-INF"
  private static let mapTag = "#EXT-X-MAP"
  private static let extinfTag = "#EXTINF"

  static func isMaster(_ manifest: String) -> Bool {
    manifest.contains(streamInf)
  }

  static func extractVariants(_ manifest: String) -> [String] {
    let lines = manifest.components(separatedBy: "\n")
    var variants: [String] = []
    var index = 0
    while index < lines.count {
      let line = lines[index].trimmingCharacters(in: .whitespacesAndNewlines)
      if line.hasPrefix(streamInf), index + 1 < lines.count {
        let next = lines[index + 1].trimmingCharacters(in: .whitespacesAndNewlines)
        if !next.hasPrefix("#"), !next.isEmpty {
          variants.append(next)
        }
        index += 1
      }
      index += 1
    }
    return variants
  }

  static func extractLeadingSegments(
    _ manifest: String,
    minDurationSeconds: Double
  ) -> (initSegment: String?, segments: [String]) {
    let lines = manifest.components(separatedBy: "\n")
    var initSegment: String?
    var pendingDurationSeconds: Double?
    var candidates: [(segment: String, durationSeconds: Double?)] = []

    for raw in lines {
      let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if line.hasPrefix(mapTag), let uri = extractUri(line) {
        initSegment = uri
      }
      if line.hasPrefix(extinfTag) {
        let durationValue = line
          .split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
          .last?
          .split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
          .first?
          .trimmingCharacters(in: .whitespacesAndNewlines)
        if let durationValue,
           let duration = Double(durationValue),
           duration.isFinite,
           duration >= 0 {
          pendingDurationSeconds = duration
        } else {
          pendingDurationSeconds = nil
        }
        continue
      }
      if !line.hasPrefix("#"), !line.isEmpty {
        candidates.append((line, pendingDurationSeconds))
        pendingDurationSeconds = nil
      }
    }

    let maxSegments = candidates.contains { $0.durationSeconds == nil }
      ? 2
      : candidates.count
    var segments: [String] = []
    var accumulatedDurationSeconds = 0.0
    for candidate in candidates.prefix(maxSegments) {
      segments.append(candidate.segment)
      accumulatedDurationSeconds += candidate.durationSeconds ?? 0
      if accumulatedDurationSeconds >= minDurationSeconds {
        break
      }
    }
    return (initSegment, segments)
  }

  static func resolveUrl(base: String, relative: String) -> String {
    guard let baseUrl = URL(string: base),
          let resolvedUrl = URL(string: relative, relativeTo: baseUrl)?.absoluteURL
    else {
      return relative
    }
    return resolvedUrl.absoluteString
  }

  private static func extractUri(_ line: String) -> String? {
    guard let prefixRange = line.range(of: "URI=\"") else {
      return nil
    }
    let remainder = line[prefixRange.upperBound...]
    guard let closingQuote = remainder.firstIndex(of: "\"") else {
      return nil
    }
    return String(remainder[..<closingQuote])
  }
}
