import Foundation

final class PlayerMutationExecutor: @unchecked Sendable {
  private let queue: DispatchQueue

  init(label: String = "com.nitroplay.player.mutation") {
    self.queue = DispatchQueue(label: label, qos: .userInitiated)
  }

  func runAndWait(_ operation: @escaping () -> Void) async {
    await withCheckedContinuation { continuation in
      queue.async {
        operation()
        continuation.resume()
      }
    }
  }
}
