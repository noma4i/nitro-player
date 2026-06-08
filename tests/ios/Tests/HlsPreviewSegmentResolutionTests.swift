import XCTest
@testable import NitroPlayLogic

// NP-PREVIEW-01 (iOS parity): HLS first-frame preview decodes the first media
// segment, because AVAssetImageGenerator cannot open an .m3u8 manifest (it fails
// fast with -11800/-12782). These pin the manifest -> first-segment URL resolution
// chain that VideoPreviewRuntime.decodeFirstHlsSegment relies on. The network fetch
// + AVAssetImageGenerator decode itself is device/simulator-only. Mirrors the
// Android AuditPhase3FixesTest fixtures.
final class HlsPreviewSegmentResolutionTests: XCTestCase {
  let parser = HlsManifestRewriter()

  let masterManifest = """
    #EXTM3U
    #EXT-X-STREAM-INF:BANDWIDTH=1280000
    low/index.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=2560000
    high/index.m3u8
    """

  let fmp4MediaManifest = """
    #EXTM3U
    #EXT-X-MAP:URI="init.mp4"
    #EXTINF:6.0,
    segment0.m4s
    #EXT-X-ENDLIST
    """

  let tsMediaManifest = """
    #EXTM3U
    #EXTINF:6.0,
    segment0.ts
    #EXT-X-ENDLIST
    """

  func testMasterPlaylist_resolvesFirstVariantToAbsoluteUrl() {
    XCTAssertTrue(parser.isMasterPlaylist(masterManifest))
    let variant = parser.extractVariantUrls(masterManifest).first
    XCTAssertEqual(variant, "low/index.m3u8")
    let mediaUrl = parser.resolveUrl(base: "https://cdn.example.com/live/master.m3u8", relative: variant!)
    XCTAssertEqual(mediaUrl, "https://cdn.example.com/live/low/index.m3u8")
  }

  func testFmp4MediaPlaylist_resolvesInitAndFirstSegment() {
    let (initRef, firstRef) = parser.extractInitAndFirstSegment(fmp4MediaManifest)
    let base = "https://cdn.example.com/live/low/index.m3u8"
    XCTAssertEqual(parser.resolveUrl(base: base, relative: initRef!), "https://cdn.example.com/live/low/init.mp4")
    XCTAssertEqual(parser.resolveUrl(base: base, relative: firstRef!), "https://cdn.example.com/live/low/segment0.m4s")
  }

  func testTsMediaPlaylist_hasNoInitSegment() {
    let (initRef, firstRef) = parser.extractInitAndFirstSegment(tsMediaManifest)
    XCTAssertNil(initRef)
    XCTAssertEqual(firstRef, "segment0.ts")
  }

  // The two-hop chain master -> media -> first .ts segment yields the absolute
  // segment URL that decodeFirstHlsSegment downloads (mux x36xhzz topology).
  func testTwoHopChain_resolvesAbsoluteTsSegmentUrl() {
    let master = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
    let masterBody = """
      #EXTM3U
      #EXT-X-STREAM-INF:BANDWIDTH=2149280
      url_0/media.m3u8
      """
    let variant = parser.extractVariantUrls(masterBody).first!
    let mediaUrl = parser.resolveUrl(base: master, relative: variant)
    XCTAssertEqual(mediaUrl, "https://test-streams.mux.dev/x36xhzz/url_0/media.m3u8")

    let mediaBody = """
      #EXTM3U
      #EXTINF:10.0,
      url_462/seg.ts
      """
    let (_, firstRef) = parser.extractInitAndFirstSegment(mediaBody)
    let segUrl = parser.resolveUrl(base: mediaUrl, relative: firstRef!)
    XCTAssertEqual(segUrl, "https://test-streams.mux.dev/x36xhzz/url_0/url_462/seg.ts")
  }
}
