import AVFoundation
import CoreImage
import Foundation
import QuartzCore
import UIKit

struct VideoPreviewProfile: Sendable {
  let maxWidth: CGFloat
  let maxHeight: CGFloat
  let quality: CGFloat

  static func from(config: NitroSourcePreviewConfig?) -> VideoPreviewProfile {
    VideoPreviewProfile(
      maxWidth: CGFloat(max(config?.maxWidth ?? 480, 1)),
      maxHeight: CGFloat(max(config?.maxHeight ?? 480, 1)),
      quality: CGFloat(min(max(config?.quality ?? 70, 1), 100)) / 100
    )
  }
}

struct VideoPreviewResult: Sendable {
  let uri: String
  let fromCache: Bool
}

final class VideoPreviewRuntime {
  static let shared = VideoPreviewRuntime()

  // Total wall-clock budget for the AVPlayer-based HLS frame grab.
  private static let hlsGrabBudget: TimeInterval = 5
  private static let playerRequestIdlePollIntervalNs: UInt64 = 50_000_000
  private static let ciContext = CIContext()
  private static let proxyClientHeaderName = "X-Nitro-Play-Client"
  private static let proxyClientPreview = "preview"

  private let store = HlsCacheStore.shared
  private let requestCoordinator = PreviewRequestCoordinator<VideoPreviewResult>()
  private let hlsDecoder = HlsPreviewFrameDecoder()

  private init() {}

  func getFirstFrame(
    url: String,
    headers: [String: String]?,
    preview: NitroSourcePreviewConfig?
  ) async -> VideoPreviewResult? {
    guard let request = startFirstFrameRequest(url: url, headers: headers, preview: preview) else {
      return nil
    }
    defer { request.cancel() }
    return await request.value()
  }

  func startFirstFrameRequest(
    url: String,
    headers: [String: String]?,
    preview: NitroSourcePreviewConfig?
  ) -> PreviewRequest<VideoPreviewResult>? {
    let profile = VideoPreviewProfile.from(config: preview)
    let decodeKey = HlsIdentity.requestKey(url: url, headers: headers)
    let cacheKey = HlsIdentity.previewKey(url: url, headers: headers, profile: profile)

    if let cached = store.getThumbnailPath(url: cacheKey) {
      return requestCoordinator.cached(VideoPreviewResult(uri: cached.absoluteString, fromCache: true))
    }

    return requestCoordinator.acquire(key: decodeKey) {
      TaskPreviewJob(task: Task<VideoPreviewResult?, Never> {
        await self.generatePreview(
          cacheKey: cacheKey,
          url: url,
          headers: headers,
          profile: profile
        )
      })
    }
  }

  func peekFirstFrame(
    url: String,
    headers: [String: String]?,
    preview: NitroSourcePreviewConfig?
  ) -> VideoPreviewResult? {
    let profile = VideoPreviewProfile.from(config: preview)
    let cacheKey = HlsIdentity.previewKey(url: url, headers: headers, profile: profile)

    guard let cached = store.getThumbnailPath(url: cacheKey) else {
      return nil
    }

    return VideoPreviewResult(uri: cached.absoluteString, fromCache: true)
  }

  func clear() {
    requestCoordinator.cancelAll()
    store.clearThumbnails()
  }

  private func generatePreview(
    cacheKey: String,
    url: String,
    headers: [String: String]?,
    profile: VideoPreviewProfile
  ) async -> VideoPreviewResult? {
    if Task.isCancelled { return nil }

    let isHls = HlsManifestUrl.matches(url)

    let plan = VideoPreviewDecodePlan.make(isHls: isHls)
    for stage in plan.stages {
      if Task.isCancelled { return nil }
      switch stage {
      case .directAssetGenerator:
        if let image = decodeDirect(url: url, headers: headers, profile: profile) {
          return persistThumbnail(image, cacheKey: cacheKey, profile: profile)
        }
      case .hlsManifestGenerator:
        guard await waitForPlayerRequestsToDrain(isHls: isHls, url: url, headers: headers) else {
          return nil
        }
        let route = resolveHlsPreviewRoute(url: url, headers: headers)
        if let image = await hlsDecoder.decodeManifestWithGenerator(
          profile: profile,
          route: route
        ) {
          return persistThumbnail(image, cacheKey: cacheKey, profile: profile)
        }
      case .hlsPlayer:
        guard await waitForPlayerRequestsToDrain(isHls: isHls, url: url, headers: headers) else {
          return nil
        }
        let route = resolveHlsPreviewRoute(url: url, headers: headers)
        if let image = await hlsDecoder.decodeWithPlayer(
          profile: profile,
          route: route
        ) {
          return persistThumbnail(image, cacheKey: cacheKey, profile: profile)
        }
      }
    }

    return nil
  }

  private func decodeDirect(
    url: String,
    headers: [String: String]?,
    profile: VideoPreviewProfile
  ) -> CGImage? {
    guard let assetUrl = URL(string: url) else { return nil }
    var options: [String: Any] = [:]
    if let headers, !headers.isEmpty {
      options["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }
    let asset = AVURLAsset(url: assetUrl, options: options)
    return representativeImage(asset: asset, profile: profile)
  }

  private func resolveHlsPreviewRoute(url: String, headers: [String: String]?) -> HlsPreviewRoute {
    let route = HlsManifestUrl.matches(url)
      ? HlsProxyRuntime.shared.resolvePlaybackRoute(url: url, headers: headers)
      : HlsProxyRouteResolution(url: url, isProxying: false)
    return HlsPreviewRoute(
      url: route.url,
      headers: route.isProxying ? taggedHeaders(headers) : headers
    )
  }

  private func taggedHeaders(_ headers: [String: String]?) -> [String: String] {
    var tagged = headers ?? [:]
    tagged[Self.proxyClientHeaderName] = Self.proxyClientPreview
    return tagged
  }

  private func waitForPlayerRequestsToDrain(isHls: Bool, url: String, headers: [String: String]?) async -> Bool {
    guard isHls else {
      return true
    }

    let deadline = Date().addingTimeInterval(Self.hlsGrabBudget)
    while Date() < deadline {
      if Task.isCancelled {
        return false
      }
      if !HlsProxyRuntime.shared.hasOpenPlayerNetworkRequests(url: url, headers: headers) {
        return true
      }
      try? await Task.sleep(nanoseconds: Self.playerRequestIdlePollIntervalNs)
    }
    return false
  }

  private func representativeImage(asset: AVURLAsset, profile: VideoPreviewProfile) -> CGImage? {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: profile.maxWidth, height: profile.maxHeight)
    generator.requestedTimeToleranceBefore = .positiveInfinity
    generator.requestedTimeToleranceAfter = .positiveInfinity

    var fallback: CGImage?
    for offset in PreviewFrameHeuristics.frameSampleOffsets {
      if Task.isCancelled { break }
      let time = CMTime(seconds: offset, preferredTimescale: 600)
      guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { continue }
      if !PreviewFrameHeuristics.isMostlyBlack(image) {
        return image
      }
      if fallback == nil {
        fallback = image
      }
    }
    return fallback
  }

  private func persistThumbnail(
    _ image: CGImage,
    cacheKey: String,
    profile: VideoPreviewProfile
  ) -> VideoPreviewResult? {
    let uiImage = UIImage(cgImage: image)
    guard let jpegData = uiImage.jpegData(compressionQuality: profile.quality) else {
      return nil
    }
    guard let stored = store.putThumbnail(url: cacheKey, data: jpegData) else {
      return nil
    }
    return VideoPreviewResult(uri: stored.absoluteString, fromCache: false)
  }
}

struct HlsPreviewRoute: Sendable {
  let url: String
  let headers: [String: String]?
}

private actor HlsPreviewFrameDecoder {
  // A peak below every variant forces AVFoundation to pick the lowest one; a single-frame grab never needs more.
  private static let previewPeakBitRate: Double = 1
  // AVPlayer decode poll tuning. Tied to decoder timing, not a cross-platform parity knob.
  private static let hlsGrabBudget: TimeInterval = 5
  private static let readinessPollIntervalNs: UInt64 = 50_000_000
  private static let pausedFramePollTimeout: TimeInterval = 0.3
  private static let playingFramePollTimeout: TimeInterval = 1.5
  private static let ciContext = CIContext()
  private let executionPolicy = HlsPreviewGrabExecutionPolicy.thumbnail

  func decodeManifestWithGenerator(
    profile: VideoPreviewProfile,
    route: HlsPreviewRoute
  ) async -> CGImage? {
    guard #available(iOS 16.0, tvOS 16.0, *) else {
      return nil
    }
    guard let asset = makeAsset(url: route.url, headers: route.headers) else {
      return nil
    }
    return await representativeImageAsync(
      asset: asset,
      profile: profile,
      offsets: PreviewFrameHeuristics.hlsLeadingCacheFrameSampleOffsets
    )
  }

  // Grabs the first non-black frame from an HLS stream through an off-screen
  // AVPlayer + AVPlayerItemVideoOutput owned by this actor.
  func decodeWithPlayer(
    profile: VideoPreviewProfile,
    route: HlsPreviewRoute
  ) async -> CGImage? {
    guard let asset = makeAsset(url: route.url, headers: route.headers) else { return nil }
    let item = AVPlayerItem(asset: asset)
    item.preferredPeakBitRate = Self.previewPeakBitRate
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ])
    item.add(output)

    let player = AVPlayer(playerItem: item)
    player.isMuted = true
    await configurePlayerForPreview(player)

    let deadline = Date().addingTimeInterval(Self.hlsGrabBudget)
    guard await waitUntilReady(item: item, deadline: deadline) else {
      await cleanupPlayer(player)
      return nil
    }

    let isLive = item.duration.isIndefinite
    var fallback: CGImage?
    var selected: CGImage?
    for offset in PreviewFrameHeuristics.hlsLeadingCacheFrameSampleOffsets {
      if Task.isCancelled || Date() >= deadline { break }
      guard let image = await grabFrame(
        player: player,
        output: output,
        offset: offset,
        isLive: isLive,
        deadline: deadline,
        profile: profile
      ) else {
        continue
      }
      if !PreviewFrameHeuristics.isMostlyBlack(image) {
        selected = image
        break
      }
      if fallback == nil {
        fallback = image
      }
    }
    await cleanupPlayer(player)
    return selected ?? fallback
  }

  private func makeAsset(url: String, headers: [String: String]?) -> AVURLAsset? {
    guard let assetUrl = URL(string: url) else { return nil }
    var options: [String: Any] = [:]
    if let headers, !headers.isEmpty {
      options["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }
    return AVURLAsset(url: assetUrl, options: options)
  }

  private func waitUntilReady(item: AVPlayerItem, deadline: Date) async -> Bool {
    while Date() < deadline {
      if Task.isCancelled { return false }
      switch item.status {
      case .readyToPlay:
        return true
      case .failed:
        return false
      default:
        break
      }
      try? await Task.sleep(nanoseconds: Self.readinessPollIntervalNs)
    }
    return false
  }

  private func grabFrame(
    player: AVPlayer,
    output: AVPlayerItemVideoOutput,
    offset: Double,
    isLive: Bool,
    deadline: Date,
    profile: VideoPreviewProfile
  ) async -> CGImage? {
    if !isLive {
      let target = CMTime(seconds: offset, preferredTimescale: 600)
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        player.seek(to: target, toleranceBefore: .positiveInfinity, toleranceAfter: .positiveInfinity) { _ in
          continuation.resume()
        }
      }
    }

    // A paused player rarely yields a buffer, so try a cheap copy first and then
    // briefly play (muted, off-screen) to force the decoder to emit a frame.
    if let buffer = await pollPixelBuffer(output: output, timeout: Self.pausedFramePollTimeout) {
      return convert(buffer, profile: profile)
    }

    await play(player)
    let buffer = await pollPixelBuffer(
      output: output,
      timeout: min(Self.playingFramePollTimeout, max(0, deadline.timeIntervalSinceNow))
    )
    await pause(player)

    guard let buffer else { return nil }
    return convert(buffer, profile: profile)
  }

  @MainActor
  private func configurePlayerForPreview(_ player: AVPlayer) {
    player.automaticallyWaitsToMinimizeStalling = false
  }

  @MainActor
  private func play(_ player: AVPlayer) {
    player.play()
  }

  @MainActor
  private func pause(_ player: AVPlayer) {
    player.pause()
  }

  @MainActor
  private func cleanupPlayer(_ player: AVPlayer) {
    player.pause()
    player.replaceCurrentItem(with: nil)
  }

  private func pollPixelBuffer(
    output: AVPlayerItemVideoOutput,
    timeout: TimeInterval
  ) async -> CVPixelBuffer? {
    let end = Date().addingTimeInterval(max(0, timeout))
    while Date() < end {
      if Task.isCancelled { return nil }
      let itemTime = output.itemTime(forHostTime: CACurrentMediaTime())
      if output.hasNewPixelBuffer(forItemTime: itemTime),
         let buffer = output.copyPixelBuffer(forItemTime: itemTime, itemTimeForDisplay: nil) {
        return buffer
      }
      try? await Task.sleep(nanoseconds: executionPolicy.pixelBufferPollIntervalNs)
    }
    return nil
  }

  private func convert(_ pixelBuffer: CVPixelBuffer, profile: VideoPreviewProfile) -> CGImage? {
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let extent = ciImage.extent
    guard extent.width > 0, extent.height > 0 else { return nil }

    let scale = min(profile.maxWidth / extent.width, profile.maxHeight / extent.height, 1.0)
    let scaled = scale < 1.0
      ? ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      : ciImage
    return Self.ciContext.createCGImage(scaled, from: scaled.extent)
  }

  @available(iOS 16.0, tvOS 16.0, *)
  private func representativeImageAsync(
    asset: AVURLAsset,
    profile: VideoPreviewProfile,
    offsets: [Double]
  ) async -> CGImage? {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: profile.maxWidth, height: profile.maxHeight)
    generator.requestedTimeToleranceBefore = .positiveInfinity
    generator.requestedTimeToleranceAfter = .positiveInfinity

    var fallback: CGImage?
    for offset in offsets {
      if Task.isCancelled { break }
      let time = CMTime(seconds: offset, preferredTimescale: 600)
      guard let image = try? await generator.image(at: time).image else { continue }
      if !PreviewFrameHeuristics.isMostlyBlack(image) {
        return image
      }
      if fallback == nil {
        fallback = image
      }
    }
    return fallback
  }

  // Builds the image generator and returns the first non-black sampled frame
  // (falling back to the earliest decoded frame). Generous time tolerance is used
  // because progressive containers may start at a non-zero PTS, where an exact
  // request at time 0 would fail; nearest-keyframe is ideal for a thumbnail anyway.
  private func representativeImage(asset: AVURLAsset, profile: VideoPreviewProfile) -> CGImage? {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: profile.maxWidth, height: profile.maxHeight)
    generator.requestedTimeToleranceBefore = .positiveInfinity
    generator.requestedTimeToleranceAfter = .positiveInfinity

    var fallback: CGImage?
    for offset in PreviewFrameHeuristics.frameSampleOffsets {
      if Task.isCancelled { break }
      let time = CMTime(seconds: offset, preferredTimescale: 600)
      guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { continue }
      if !PreviewFrameHeuristics.isMostlyBlack(image) {
        return image
      }
      if fallback == nil {
        fallback = image
      }
    }
    return fallback
  }
}
