import Foundation

/// Readiness of the local playback transport.
///
/// An accepted TCP connection is not proof of service: the listening socket can outlive the
/// process suspension while the server no longer answers. Readiness is therefore established by
/// an application-level probe, never by an in-process flag.
enum HlsTransportReadiness {
  /// The transport is not supposed to run.
  case stopped
  /// The transport answered a probe.
  case ready
  /// The transport should run but did not answer a probe.
  case unhealthy
}
