import Foundation

class HybridNitroFeedRingPlayerFactory: HybridNitroFeedRingPlayerFactorySpec {
  func createRingPlayer() throws -> any HybridNitroFeedRingPlayerSpec {
    HybridNitroFeedRingPlayer()
  }
}
