import XCTest
@testable import NitroPlayLogic

final class HlsManifestRewriterTests: XCTestCase {
  let rewriter = HlsManifestRewriter()

  let masterManifest = """
    #EXTM3U
    #EXT-X-STREAM-INF:BANDWIDTH=1280000
    low/index.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=2560000
    mid/index.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=7680000
    high/index.m3u8
    """

  let mediaManifest = """
    #EXTM3U
    #EXT-X-TARGETDURATION:10
    #EXT-X-MAP:URI="init.mp4"
    #EXTINF:10.0,
    segment0.ts
    #EXTINF:10.0,
    segment1.ts
    #EXT-X-ENDLIST
    """

  func testIsMasterPlaylist_true() {
    XCTAssertTrue(rewriter.isMasterPlaylist(masterManifest))
  }

  func testIsMasterPlaylist_false() {
    XCTAssertFalse(rewriter.isMasterPlaylist(mediaManifest))
  }

  func testExtractVariantUrls_fromMaster() {
    let urls = rewriter.extractVariantUrls(masterManifest)
    XCTAssertEqual(urls, ["low/index.m3u8", "mid/index.m3u8", "high/index.m3u8"])
  }

  func testExtractVariantUrls_emptyForMedia() {
    let urls = rewriter.extractVariantUrls(mediaManifest)
    XCTAssertTrue(urls.isEmpty)
  }

  func testExtractInitAndFirstSegment_returnsInit() {
    let (initSeg, firstSeg) = rewriter.extractInitAndFirstSegment(mediaManifest)
    XCTAssertEqual(initSeg, "init.mp4")
    XCTAssertEqual(firstSeg, "segment0.ts")
  }

  func testExtractInitAndFirstSegment_nilForEmpty() {
    let (initSeg, firstSeg) = rewriter.extractInitAndFirstSegment("#EXTM3U\n#EXT-X-ENDLIST")
    XCTAssertNil(initSeg)
    XCTAssertNil(firstSeg)
  }

  func testExtractInitAndFirstSegment_noMap() {
    let manifest = "#EXTM3U\n#EXTINF:10.0,\nsegment0.ts"
    let (initSeg, firstSeg) = rewriter.extractInitAndFirstSegment(manifest)
    XCTAssertNil(initSeg)
    XCTAssertEqual(firstSeg, "segment0.ts")
  }

  func testRewriteManifest_dispatchesMaster() {
    let result = rewriter.rewriteManifest(
      manifest: masterManifest,
      baseUrl: "https://cdn.example.com/",
      headers: nil,
      port: 18181,
      streamKey: "s1"
    )
    XCTAssertTrue(result.contains("http://127.0.0.1:18181/hls/manifest"))
  }

  func testRewriteManifest_dispatchesMedia() {
    let result = rewriter.rewriteManifest(
      manifest: mediaManifest,
      baseUrl: "https://cdn.example.com/",
      headers: nil,
      port: 18181,
      streamKey: "s1"
    )
    XCTAssertTrue(result.contains("http://127.0.0.1:18181/hls/segment"))
  }

  func testGuessContentType_m3u8() {
    XCTAssertEqual(rewriter.guessContentType(url: "index.m3u8"), "application/vnd.apple.mpegurl")
  }

  func testGuessContentType_m4s() {
    XCTAssertEqual(rewriter.guessContentType(url: "init.m4s"), "video/iso.segment")
  }

  func testGuessContentType_mp4() {
    XCTAssertEqual(rewriter.guessContentType(url: "video.mp4"), "video/mp4")
  }

  func testGuessContentType_ts() {
    XCTAssertEqual(rewriter.guessContentType(url: "segment.ts"), "video/MP2T")
  }

  func testResolveUrl_relative() {
    let result = rewriter.resolveUrl(base: "https://cdn.example.com/live/master.m3u8", relative: "low/index.m3u8")
    XCTAssertEqual(result, "https://cdn.example.com/live/low/index.m3u8")
  }

  func testResolveUrl_absolute() {
    let result = rewriter.resolveUrl(base: "https://cdn.example.com/", relative: "https://other.cdn.com/seg.ts")
    XCTAssertEqual(result, "https://other.cdn.com/seg.ts")
  }

  func testDecodeHeaders_roundTrip() {
    let headers = ["Authorization": "Bearer token", "X-Client": "nitro"]
    let data = try! JSONSerialization.data(withJSONObject: headers)
    let encoded = data.base64EncodedString()
    let decoded = rewriter.decodeHeaders(encoded)
    XCTAssertEqual(decoded, headers)
  }

  func testDecodeHeaders_nilForInvalid() {
    XCTAssertNil(rewriter.decodeHeaders("not-base64"))
  }

  func testDecodeHeaders_nilForNil() {
    XCTAssertNil(rewriter.decodeHeaders(nil))
  }
}
