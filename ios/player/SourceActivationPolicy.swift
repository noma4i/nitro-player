enum SourceActivationAction: Equatable {
  case idle
  case metadata
  case buffered
  case play
}

enum SourceActivationPolicy {
  static func resolve(
    startup: NitroSourceStartup,
    preload: PreloadLevel,
    shouldAutoPlay: Bool
  ) -> SourceActivationAction {
    if shouldAutoPlay {
      return .play
    }

    guard startup == .eager else {
      return .idle
    }

    switch preload {
    case .none:
      return .idle
    case .metadata:
      return .metadata
    case .buffered:
      return .buffered
    }
  }
}
