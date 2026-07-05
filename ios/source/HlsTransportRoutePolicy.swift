enum HlsTransportRouteMode {
  case auto
  case direct
  case proxy
}

struct HlsTransportRoutePolicy {
  static func shouldUseProxyForPlayback(
    mode: HlsTransportRouteMode?,
    isHls: Bool,
    feedPoolEligible: Bool,
    hasCachedStream: Bool = false
  ) -> Bool {
    guard isHls else { return false }

    switch mode ?? .auto {
    case .direct:
      return false
    case .proxy:
      return true
    case .auto:
      return feedPoolEligible || hasCachedStream
    }
  }

  static func supportsStartupRecovery(isHls: Bool, isProxyRouteActive: Bool) -> Bool {
    isHls && isProxyRouteActive
  }
}
