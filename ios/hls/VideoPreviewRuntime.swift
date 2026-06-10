import AVFoundation
import CoreImage
import Foundation
import QuartzCore
import UIKit

struct VideoPreviewProfile {
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

struct VideoPreviewResult {
  let uri: String
  let fromCache: Bool
}

final class VideoPreviewRuntime {
  static let shared = VideoPreviewRuntime()

  // Total wall-clock budget for the AVPlayer-based HLS frame grab.
  private static let hlsGrabBudget: TimeInterval = 5
  private static let ciContext = CIContext()

  private let store = HlsCacheStore()
  private let stateQueue = DispatchQueue(label: "com.nitroplay.preview.runtime")
  private var inflight: [String: Task<VideoPreviewResult?, Never>] = [:]

  private init() {}

  func getFirstFrame(
    url: String,
    headers: [String: String]?,
    preview: NitroSourcePreviewConfig?
  ) async -> VideoPreviewResult? {
    let profile = VideoPreviewProfile.from(config: preview)
    let cacheKey = HlsIdentity.previewKey(url: url, headers: headers, profile: profile)

    if let cached = store.getThumbnailPath(url: cacheKey) {
      return VideoPreviewResult(uri: cached.absoluteString, fromCache: true)
    }

    let task = stateQueue.sync { () -> Task<VideoPreviewResult?, Never> in
      if let existing = inflight[cacheKey] {
        return existing
      }

      let created = Task<VideoPreviewResult?, Never> {
        await self.generatePreview(
          cacheKey: cacheKey,
          url: url,
          headers: headers,
          profile: profile
        )
      }
      inflight[cacheKey] = created
      return created
    }

    let result = await task.value
    stateQueue.sync {
      inflight.removeValue(forKey: cacheKey)
    }
    return result
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
    store.clearThumbnails()
  }

  private func generatePreview(
    cacheKey: String,
    url: String,
    headers: [String: String]?,
    profile: VideoPreviewProfile
  ) async -> VideoPreviewResult? {
    if Task.isCancelled { return nil }

    // 1) Direct decode: progressive containers (mp4/mov) open straight from the URL.
    if let image = decodeDirect(url: url, headers: headers, profile: profile) {
      return persistThumbnail(image, cacheKey: cacheKey, profile: profile)
    }

    // 2) HLS: AVAssetImageGenerator cannot open an HLS .m3u8 manifest, and iOS has
    //    no standalone MPEG-TS file importer, so decoding a downloaded bare .ts
    //    segment fails with AVError -11828 (FileFormatNotRecognized). Grab a frame
    //    through AVPlayer's HLS pipeline instead, which handles both .ts and fMP4.
    if let image = await decodeHlsViaPlayer(url: url, headers: headers, profile: profile) {
      return persistThumbnail(image, cacheKey: cacheKey, profile: profile)
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

  // Grabs the first non-black frame from an HLS stream through AVPlayer +
  // AVPlayerItemVideoOutput. Runs on the main actor (no AVPlayerLayer is attached,
  // so nothing renders on screen); the sampling loops yield via Task.sleep.
  @MainActor
  private func decodeHlsViaPlayer(
    url: String,
    headers: [String: String]?,
    profile: VideoPreviewProfile
  ) async -> CGImage? {
    guard let assetUrl = URL(string: url) else { return nil }
    var options: [String: Any] = [:]
    if let headers, !headers.isEmpty {
      options["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }

    let asset = AVURLAsset(url: assetUrl, options: options)
    let item = AVPlayerItem(asset: asset)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:]
    ])
    item.add(output)

    let player = AVPlayer(playerItem: item)
    player.isMuted = true
    player.automaticallyWaitsToMinimizeStalling = false

    defer {
      player.pause()
      player.replaceCurrentItem(with: nil)
    }

    let deadline = Date().addingTimeInterval(Self.hlsGrabBudget)
    guard await waitUntilReady(item: item, deadline: deadline) else {
      return nil
    }

    let isLive = item.duration.isIndefinite
    var fallback: CGImage?
    for offset in PreviewFrameHeuristics.frameSampleOffsets {
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
        return image
      }
      if fallback == nil {
        fallback = image
      }
    }
    return fallback
  }

  @MainActor
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
      try? await Task.sleep(nanoseconds: 50_000_000)
    }
    return false
  }

  @MainActor
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
    if let buffer = await pollPixelBuffer(output: output, timeout: 0.3) {
      return convert(buffer, profile: profile)
    }

    player.play()
    let buffer = await pollPixelBuffer(
      output: output,
      timeout: min(1.5, max(0, deadline.timeIntervalSinceNow))
    )
    player.pause()

    guard let buffer else { return nil }
    return convert(buffer, profile: profile)
  }

  @MainActor
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
      try? await Task.sleep(nanoseconds: 16_000_000)
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
