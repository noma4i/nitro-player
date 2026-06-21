import Foundation

struct HlsRuntimeStateSnapshot {
  let port: Int
  let didAutoStart: Bool
  let isExplicitlyStopped: Bool
}

final class HlsRuntimeState {
  private let defaultPort: Int
  private let queue = DispatchQueue(label: "com.nitroplay.hls.runtime-state-machine")

  private var port: Int
  private var didAutoStart = false
  private var isExplicitlyStopped = false

  init(defaultPort: Int = 0) {
    self.defaultPort = defaultPort
    self.port = defaultPort
  }

  func start(port requestedPort: Int?) -> Int {
    queue.sync {
      let resolvedPort = (requestedPort ?? defaultPort) > 0 ? (requestedPort ?? defaultPort) : defaultPort
      port = resolvedPort
      isExplicitlyStopped = false
      didAutoStart = true
      return resolvedPort
    }
  }

  func stop() {
    queue.sync {
      isExplicitlyStopped = true
      didAutoStart = false
    }
  }

  func shouldStartForImplicitUse() -> Int? {
    queue.sync {
      guard !isExplicitlyStopped else {
        return nil
      }
      if didAutoStart {
        return nil
      }
      didAutoStart = true
      return port
    }
  }

  func shouldRestartForPlaybackRecovery() -> Int? {
    queue.sync {
      guard !isExplicitlyStopped else {
        return nil
      }
      didAutoStart = true
      return port
    }
  }

  func snapshot() -> HlsRuntimeStateSnapshot {
    queue.sync {
      HlsRuntimeStateSnapshot(
        port: port,
        didAutoStart: didAutoStart,
        isExplicitlyStopped: isExplicitlyStopped
      )
    }
  }
}
