import CoreGraphics
import Foundation

// Pure frame-selection heuristics for preview thumbnails, isolated from the
// AVFoundation/UIKit runtime so they can be unit-tested host-side.
enum PreviewFrameHeuristics {
  // Sample a few timestamps and keep the first non-black frame, so an intro fade
  // does not yield a black thumbnail. Mirrors the Android FRAME_SAMPLE_OFFSETS_US.
  static let frameSampleOffsets: [Double] = [0, 0.5, 1, 2, 3]

  // Downsamples the frame to an 8x8 grid and treats it as black when the peak luma
  // stays below a small threshold. Mirrors the Android isMostlyBlack heuristic.
  static func isMostlyBlack(_ image: CGImage) -> Bool {
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

  // Picks a temp-file extension so AVURLAsset can infer the container of a
  // downloaded HLS segment. fMP4 (CMAF): init (ftyp+moov) + media (moof+mdat)
  // concatenate into a valid fragmented MP4, so a .mp4 extension is used.
  static func tempExtension(segmentUrl: String, hasInit: Bool) -> String {
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
}
