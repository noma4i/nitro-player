import XCTest
import CoreGraphics
@testable import NitroPlayLogic

// NP-PREVIEW-01 (iOS): pure frame-selection heuristics extracted from
// VideoPreviewRuntime so they can be unit-tested host-side (the AVFoundation
// decode itself is device-only). Mirrors the Android isMostlyBlack heuristic.
final class PreviewFrameHeuristicsTests: XCTestCase {
  private func solidImage(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> CGImage {
    let side = 4
    var pixels = [UInt8](repeating: 0, count: side * side * 4)
    var i = 0
    while i < pixels.count {
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
      pixels[i + 3] = 255
      i += 4
    }
    let context = CGContext(
      data: &pixels,
      width: side,
      height: side,
      bitsPerComponent: 8,
      bytesPerRow: side * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    return context.makeImage()!
  }

  func testIsMostlyBlack_trueForBlackFrame() {
    XCTAssertTrue(PreviewFrameHeuristics.isMostlyBlack(solidImage(0, 0, 0)))
  }

  func testIsMostlyBlack_trueForNearBlackBelowThreshold() {
    // luma(15,15,15) = 15 < 18 -> treated as black
    XCTAssertTrue(PreviewFrameHeuristics.isMostlyBlack(solidImage(15, 15, 15)))
  }

  func testIsMostlyBlack_falseForMidGray() {
    XCTAssertFalse(PreviewFrameHeuristics.isMostlyBlack(solidImage(80, 80, 80)))
  }

  func testIsMostlyBlack_falseForWhiteFrame() {
    XCTAssertFalse(PreviewFrameHeuristics.isMostlyBlack(solidImage(255, 255, 255)))
  }

  func testTempExtension_fmp4WhenHasInit() {
    XCTAssertEqual(PreviewFrameHeuristics.tempExtension(segmentUrl: "https://x/seg.m4s", hasInit: true), "mp4")
  }

  func testTempExtension_tsSegment() {
    XCTAssertEqual(PreviewFrameHeuristics.tempExtension(segmentUrl: "https://x/seg.ts", hasInit: false), "ts")
  }

  func testTempExtension_m4sMapsToMp4() {
    XCTAssertEqual(PreviewFrameHeuristics.tempExtension(segmentUrl: "https://x/seg.m4s", hasInit: false), "mp4")
  }

  func testTempExtension_noExtensionDefaultsToTs() {
    XCTAssertEqual(PreviewFrameHeuristics.tempExtension(segmentUrl: "https://x/segmentdata", hasInit: false), "ts")
  }
}
