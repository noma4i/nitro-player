import Foundation

class HybridNitroFeedRingPlayerFactory: HybridNitroFeedRingPlayerFactorySpec {
  private let mainThreadExecutor = MainThreadResourceExecutor()

  func createRingPlayer() throws -> any HybridNitroFeedRingPlayerSpec {
    mainThreadExecutor.run {
      HybridNitroFeedRingPlayer()
    }
  }
}
