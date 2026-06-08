import AVFoundation
import Foundation
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

  private static let httpTimeout: TimeInterval = 8
  // Sample a few timestamps and keep the first non-black frame, so an intro fade
  // does not yield a black thumbnail. Mirrors the Android FRAME_SAMPLE_OFFSETS_US.
  private static let frameSampleOffsets: [Double] = [0, 0.5, 1, 2, 3]

  private let store = HlsCacheStore()
  private let manifestParser = HlsManifestRewriter()
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

    // 2) AVAssetImageGenerator cannot open an HLS .m3u8 manifest (it fails fast with
    //    -11800/-12782), so download the first media segment and decode it from a
    //    local temp file. Mirrors Android VideoPreviewRuntime.decodeFirstHlsSegment.
    if let image = await decodeFirstHlsSegment(url: url, headers: headers, profile: profile) {
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

  private struct HlsFirstSegment {
    let initUrl: String?
    let segmentUrl: String
  }

  private func decodeFirstHlsSegment(
    url: String,
    headers: [String: String]?,
    profile: VideoPreviewProfile
  ) async -> CGImage? {
    guard let segment = await resolveFirstSegment(manifestUrl: url, headers: headers),
          let segmentBytes = await httpGet(segment.segmentUrl, headers: headers) else {
      return nil
    }

    // Fragmented MP4 segments need the init segment (ftyp+moov) prepended.
    var initBytes: Data?
    if let initUrl = segment.initUrl {
      initBytes = await httpGet(initUrl, headers: headers)
    }
    if Task.isCancelled { return nil }

    return decodeLocalSegment(
      initBytes: initBytes,
      segmentBytes: segmentBytes,
      fileExtension: tempExtension(segmentUrl: segment.segmentUrl, hasInit: segment.initUrl != nil),
      profile: profile
    )
  }

  // Resolves the master -> media -> first-segment chain into absolute URLs. The
  // playlist fetch is required to read nested manifests; the parsing primitives it
  // relies on are covered by HlsManifestRewriterTests / HlsPreviewSegmentResolutionTests.
  private func resolveFirstSegment(manifestUrl: String, headers: [String: String]?) async -> HlsFirstSegment? {
    guard let manifest = await httpGetString(manifestUrl, headers: headers) else { return nil }

    var mediaUrl = manifestUrl
    var mediaManifest = manifest
    if manifestParser.isMasterPlaylist(manifest) {
      guard let variant = manifestParser.extractVariantUrls(manifest).first else { return nil }
      mediaUrl = manifestParser.resolveUrl(base: manifestUrl, relative: variant)
      guard let media = await httpGetString(mediaUrl, headers: headers) else { return nil }
      mediaManifest = media
    }

    let (initRef, firstRef) = manifestParser.extractInitAndFirstSegment(mediaManifest)
    guard let firstRef else { return nil }
    return HlsFirstSegment(
      initUrl: initRef.map { manifestParser.resolveUrl(base: mediaUrl, relative: $0) },
      segmentUrl: manifestParser.resolveUrl(base: mediaUrl, relative: firstRef)
    )
  }

  // Writes init+segment into a temp file with a container-appropriate extension so
  // AVURLAsset can infer the type, then decodes a representative frame from it.
  private func decodeLocalSegment(
    initBytes: Data?,
    segmentBytes: Data,
    fileExtension: String,
    profile: VideoPreviewProfile
  ) -> CGImage? {
    let tempUrl = FileManager.default.temporaryDirectory
      .appendingPathComponent("nitroplay-preview-\(UUID().uuidString)")
      .appendingPathExtension(fileExtension)
    defer { try? FileManager.default.removeItem(at: tempUrl) }

    var blob = Data()
    if let initBytes {
      blob.append(initBytes)
    }
    blob.append(segmentBytes)
    guard (try? blob.write(to: tempUrl)) != nil else { return nil }

    return representativeImage(asset: AVURLAsset(url: tempUrl), profile: profile)
  }

  // Builds the image generator and returns the first non-black sampled frame
  // (falling back to the earliest decoded frame). Generous time tolerance is used
  // because MPEG-TS segments often start at a non-zero PTS, where an exact request
  // at time 0 would fail; nearest-keyframe is ideal for a thumbnail anyway.
  private func representativeImage(asset: AVURLAsset, profile: VideoPreviewProfile) -> CGImage? {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: profile.maxWidth, height: profile.maxHeight)
    generator.requestedTimeToleranceBefore = .positiveInfinity
    generator.requestedTimeToleranceAfter = .positiveInfinity

    var fallback: CGImage?
    for offset in Self.frameSampleOffsets {
      if Task.isCancelled { break }
      let time = CMTime(seconds: offset, preferredTimescale: 600)
      guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { continue }
      if !isMostlyBlack(image) {
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

  // Downsamples the frame to an 8x8 grid and treats it as black when the peak luma
  // stays below a small threshold. Mirrors the Android isMostlyBlack heuristic.
  private func isMostlyBlack(_ image: CGImage) -> Bool {
    let side = 8
    var pixels = [UInt8](repeating: 0, count: side * side * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
      data: &pixels,
      width: side,
      height: side,
      bitsPerComponent: 8,
      bytesPerRow: side * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return false
    }

    context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))

    var maxLuma = 0
    var index = 0
    while index < pixels.count {
      let r = Int(pixels[index])
      let g = Int(pixels[index + 1])
      let b = Int(pixels[index + 2])
      let luma = (r * 30 + g * 59 + b * 11) / 100
      if luma > maxLuma {
        maxLuma = luma
      }
      index += 4
    }
    return maxLuma < 18
  }

  private func tempExtension(segmentUrl: String, hasInit: Bool) -> String {
    // fMP4 (CMAF): init (ftyp+moov) + media (moof+mdat) concatenate into a valid
    // fragmented MP4, so a .mp4 extension lets AVURLAsset infer the container.
    if hasInit {
      return "mp4"
    }
    let ext = (URL(string: segmentUrl)?.pathExtension ?? "").lowercased()
    switch ext {
    case "m4s", "cmfv", "mp4", "m4v":
      return "mp4"
    case "":
      return "ts"
    default:
      return ext
    }
  }

  private func httpGet(_ urlString: String, headers: [String: String]?) async -> Data? {
    guard let url = URL(string: urlString) else { return nil }
    var request = URLRequest(url: url, timeoutInterval: Self.httpTimeout)
    headers?.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
        return nil
      }
      return data
    } catch {
      return nil
    }
  }

  private func httpGetString(_ urlString: String, headers: [String: String]?) async -> String? {
    guard let data = await httpGet(urlString, headers: headers) else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
