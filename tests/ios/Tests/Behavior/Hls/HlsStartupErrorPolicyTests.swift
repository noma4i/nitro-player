import XCTest
@testable import NitroPlayLogic

// B4 (iOS): a fatal HTTP error on the initial HLS load (e.g. 401) surfaces via
// the AVPlayerItem error log without ever setting AVPlayerItem.status == .failed.
// This pure policy decides whether such an error-log entry should fail playback,
// so the decision is unit-testable host-side (the AVFoundation observer is device-only).
final class HlsStartupErrorPolicyTests: XCTestCase {
  func testFatalForHttp4xxDuringStartup() {
    XCTAssertTrue(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 401, hasLoaded: false))
    XCTAssertTrue(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 403, hasLoaded: false))
    XCTAssertTrue(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 404, hasLoaded: false))
  }

  func testFatalForHttp5xxDuringStartup() {
    XCTAssertTrue(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 500, hasLoaded: false))
  }

  func testNotFatalForSuccessStatus() {
    XCTAssertFalse(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 200, hasLoaded: false))
    XCTAssertFalse(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 206, hasLoaded: false))
  }

  func testNotFatalForNonHttpEntry() {
    // errorStatusCode is 0 when the log entry carries no HTTP status.
    XCTAssertFalse(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 0, hasLoaded: false))
  }

  func testNotFatalAfterFirstLoad() {
    // After the source has loaded once, error-log entries are transient (rebuffer)
    // and must not tear down a playing stream.
    XCTAssertFalse(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 401, hasLoaded: true))
    XCTAssertFalse(HlsStartupErrorPolicy.isFatalStartupHttpError(statusCode: 500, hasLoaded: true))
  }

  func testDescribeIncludesStatusCode() {
    let message = HlsStartupErrorPolicy.describe(statusCode: 401, comment: "Unauthorized")
    XCTAssertTrue(message.contains("401"))
    XCTAssertTrue(message.contains("Unauthorized"))
  }

  func testDescribeWithoutComment() {
    let message = HlsStartupErrorPolicy.describe(statusCode: 403, comment: nil)
    XCTAssertTrue(message.contains("403"))
    XCTAssertFalse(message.isEmpty)
  }
}
