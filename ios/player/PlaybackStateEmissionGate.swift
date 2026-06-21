import Foundation

final class PlaybackStateEmissionGate {
  private var lastSignature: String?

  func shouldEmit(signature: String) -> Bool {
    if signature == lastSignature {
      return false
    }
    lastSignature = signature
    return true
  }

  func reset() {
    lastSignature = nil
  }
}
