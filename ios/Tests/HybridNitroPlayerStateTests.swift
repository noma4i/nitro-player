import AVFoundation
import XCTest
@testable import NitroPlay

final class HybridNitroPlayerStateTests: XCTestCase {
  private func makePlayer() throws -> HybridNitroPlayer {
    let source = try HybridNitroPlayerSource(
      config: NativeNitroPlayerConfig(
        uri: "https://cdn.example.com/video.mp4",
        memoryConfig: nil,
        headers: nil,
        bufferConfig: nil,
        metadata: nil,
        initializeOnCreation: false,
        useHlsProxy: nil
      )
    )
    return try HybridNitroPlayer(source: source)
  }

  func testPlaySetsStatusPlaying() throws {
    let player = try makePlayer()
    defer { player.release() }

    try player.play()
    XCTAssertEqual(player.status, .playing)
  }

  func testPauseSetsStatusPaused() throws {
    let player = try makePlayer()
    defer { player.release() }

    try player.play()
    try player.pause()
    XCTAssertEqual(player.status, .paused)
  }

  func testBufferingPreservesPlayingIntent() throws {
    let player = try makePlayer()
    defer { player.release() }

    player.status = .playing
    player.onPlaybackBufferEmpty()

    XCTAssertEqual(player.status, .playing)
    XCTAssertTrue(player.isBuffering)
  }

  func testBufferingPreservesPausedIntent() throws {
    let player = try makePlayer()
    defer { player.release() }

    player.status = .paused
    player.onPlaybackBufferEmpty()

    XCTAssertEqual(player.status, .paused)
    XCTAssertTrue(player.isBuffering)
  }

  func testBufferingFromIdleSetsBufferingStatus() throws {
    let player = try makePlayer()
    defer { player.release() }

    player.status = .idle
    player.onPlaybackBufferEmpty()

    XCTAssertEqual(player.status, .buffering)
    XCTAssertTrue(player.isBuffering)
  }

  func testTimeControlWaitingPreservesPlaying() throws {
    let player = try makePlayer()
    defer { player.release() }

    player.status = .playing
    player.onTimeControlStatusChanged(status: .waitingToPlayAtSpecifiedRate)

    XCTAssertEqual(player.status, .playing)
    XCTAssertTrue(player.isBuffering)
  }

  func testTimeControlPlayingClearsBuffering() throws {
    let player = try makePlayer()
    defer { player.release() }

    player.isCurrentlyBuffering = true
    player.onTimeControlStatusChanged(status: .playing)

    XCTAssertFalse(player.isBuffering)
    XCTAssertEqual(player.status, .playing)
  }

  func testErrorClearsBuffering() throws {
    let player = try makePlayer()
    defer { player.release() }

    player.isCurrentlyBuffering = true
    player.status = .error
    player.isCurrentlyBuffering = false

    XCTAssertFalse(player.isBuffering)
  }
}
