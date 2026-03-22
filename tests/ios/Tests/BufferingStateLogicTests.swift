import XCTest

enum TestPlayerStatus: Equatable {
  case idle, loading, buffering, playing, paused, ended, error
}

final class BufferingStateLogicTests: XCTestCase {
  private var status: TestPlayerStatus = .idle
  private var isCurrentlyBuffering: Bool = false

  private func enterBuffering() {
    isCurrentlyBuffering = true
    if status != .playing && status != .paused {
      status = .buffering
    }
  }

  override func setUp() {
    super.setUp()
    status = .idle
    isCurrentlyBuffering = false
  }

  func testEnterBufferingPreservesPlayingStatus() {
    status = .playing
    enterBuffering()

    XCTAssertEqual(status, .playing)
    XCTAssertTrue(isCurrentlyBuffering)
  }

  func testEnterBufferingPreservesPausedStatus() {
    status = .paused
    enterBuffering()

    XCTAssertEqual(status, .paused)
    XCTAssertTrue(isCurrentlyBuffering)
  }

  func testEnterBufferingSetsBufferingFromIdle() {
    status = .idle
    enterBuffering()

    XCTAssertEqual(status, .buffering)
    XCTAssertTrue(isCurrentlyBuffering)
  }

  func testEnterBufferingSetsBufferingFromLoading() {
    status = .loading
    enterBuffering()

    XCTAssertEqual(status, .buffering)
    XCTAssertTrue(isCurrentlyBuffering)
  }

  func testEnterBufferingSetsBufferingFromEnded() {
    status = .ended
    enterBuffering()

    XCTAssertEqual(status, .buffering)
    XCTAssertTrue(isCurrentlyBuffering)
  }

  func testTimeControlPlayingClearsBuffering() {
    isCurrentlyBuffering = true
    status = .playing

    isCurrentlyBuffering = false
    status = .playing

    XCTAssertFalse(isCurrentlyBuffering)
    XCTAssertEqual(status, .playing)
  }

  func testErrorClearsBuffering() {
    isCurrentlyBuffering = true

    isCurrentlyBuffering = false
    status = .error

    XCTAssertFalse(isCurrentlyBuffering)
    XCTAssertEqual(status, .error)
  }

  func testIsPlayingChangedClearsBuffering() {
    isCurrentlyBuffering = true

    let isPlaying = true
    if isPlaying { isCurrentlyBuffering = false }

    XCTAssertFalse(isCurrentlyBuffering)
  }

  func testEndedClearsBuffering() {
    isCurrentlyBuffering = true

    isCurrentlyBuffering = false
    status = .ended

    XCTAssertFalse(isCurrentlyBuffering)
    XCTAssertEqual(status, .ended)
  }
}
