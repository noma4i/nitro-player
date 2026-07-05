import Foundation

enum VideoPreviewDecodeStage: Equatable, Sendable {
  case directAssetGenerator
  case hlsManifestGenerator
  case hlsPlayer
}

struct VideoPreviewDecodePlan: Equatable, Sendable {
  let stages: [VideoPreviewDecodeStage]

  static func make(isHls: Bool) -> VideoPreviewDecodePlan {
    if isHls {
      return VideoPreviewDecodePlan(stages: [.hlsManifestGenerator, .hlsPlayer])
    }
    return VideoPreviewDecodePlan(stages: [.directAssetGenerator])
  }
}

struct HlsPreviewGrabExecutionPolicy: Equatable, Sendable {
  let requiresMainThread: Bool
  let pixelBufferPollIntervalNs: UInt64

  static let thumbnail = HlsPreviewGrabExecutionPolicy(
    requiresMainThread: false,
    pixelBufferPollIntervalNs: 50_000_000
  )
}
