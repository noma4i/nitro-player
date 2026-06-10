import Foundation

// B4 (iOS): a fatal HTTP error on the initial HLS load (e.g. 401) is reported
// through AVPlayerItem's error log without ever flipping AVPlayerItem.status to
// .failed, so the status-based failure handlers never fire and the error stays
// silent. This pure policy decides whether such an error-log entry should fail
// playback, isolated from AVFoundation so it can be unit-tested host-side.
enum HlsStartupErrorPolicy {
  // A 4xx/5xx HTTP status from an error-log entry before the source has loaded
  // once is a hard startup failure. After the first successful load, error-log
  // entries are transient (rebuffer / mid-stream blips) and must not tear down a
  // playing stream. errorStatusCode is 0 for entries without an HTTP status.
  static func isFatalStartupHttpError(statusCode: Int, hasLoaded: Bool) -> Bool {
    return statusCode >= 400 && !hasLoaded
  }

  static func describe(statusCode: Int, comment: String?) -> String {
    if let comment, !comment.isEmpty {
      return "HLS load failed: HTTP \(statusCode) - \(comment)"
    }
    return "HLS load failed: HTTP \(statusCode)"
  }
}
