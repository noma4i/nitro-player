import Foundation

struct PlaybackStateFingerprint: Equatable, Sendable {
  let status: Int
  let currentTimeBits: UInt64
  let durationBits: UInt64
  let bufferDurationBits: UInt64
  let bufferedPositionBits: UInt64
  let rateBits: UInt64
  let isPlaying: Bool
  let isBuffering: Bool
  let isVisualReady: Bool
  let errorCode: Int?
  let errorMessageHash: UInt64?

  init(
    status: Int,
    currentTime: Double,
    duration: Double,
    bufferDuration: Double,
    bufferedPosition: Double,
    rate: Double,
    isPlaying: Bool,
    isBuffering: Bool,
    isVisualReady: Bool,
    errorCode: Int?,
    errorMessageHash: UInt64?
  ) {
    self.status = status
    self.currentTimeBits = Self.normalizedBits(currentTime)
    self.durationBits = Self.normalizedBits(duration)
    self.bufferDurationBits = Self.normalizedBits(bufferDuration)
    self.bufferedPositionBits = Self.normalizedBits(bufferedPosition)
    self.rateBits = Self.normalizedBits(rate)
    self.isPlaying = isPlaying
    self.isBuffering = isBuffering
    self.isVisualReady = isVisualReady
    self.errorCode = errorCode
    self.errorMessageHash = errorMessageHash
  }

  private static func normalizedBits(_ value: Double) -> UInt64 {
    if value.isNaN {
      return UInt64.max
    }
    return value.bitPattern
  }
}

final class PlaybackStateEmissionGate {
  private var lastFingerprint: PlaybackStateFingerprint?
  private let lock = NSLock()

  func shouldEmit(fingerprint: PlaybackStateFingerprint) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if fingerprint == lastFingerprint {
      return false
    }
    lastFingerprint = fingerprint
    return true
  }

  func reset() {
    lock.lock()
    lastFingerprint = nil
    lock.unlock()
  }
}
