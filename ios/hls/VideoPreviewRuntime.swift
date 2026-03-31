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

  func clear() {
    store.clearThumbnails()
  }

  private func generatePreview(
    cacheKey: String,
    url: String,
    headers: [String: String]?,
    profile: VideoPreviewProfile
  ) async -> VideoPreviewResult? {
    guard let assetUrl = URL(string: url) else { return nil }

    var options: [String: Any] = [:]
    if let headers, !headers.isEmpty {
      options["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }

    let asset = AVURLAsset(url: assetUrl, options: options)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: profile.maxWidth, height: profile.maxHeight)
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero

    do {
      let cgImage = try generator.copyCGImage(at: .zero, actualTime: nil)
      let uiImage = UIImage(cgImage: cgImage)
      guard let jpegData = uiImage.jpegData(compressionQuality: profile.quality) else {
        return nil
      }
      guard let stored = store.putThumbnail(url: cacheKey, data: jpegData) else {
        return nil
      }
      return VideoPreviewResult(uri: stored.absoluteString, fromCache: false)
    } catch {
      return nil
    }
  }
}
