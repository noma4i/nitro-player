@testable import NitroPlayRuntimeCore
import XCTest

final class NativeAudioSessionPolicyTests: XCTestCase {
  private func resolve(_ mix: NativeAudioMixPolicy, _ silent: NativeAudioSilentPolicy) -> NativePlaybackAudioConfiguration {
    NativeAudioSessionPolicy.resolvePlayback([NativePlaybackAudioPolicy(mix: mix, silent: silent)])
  }

  func testMixPolicyResolvesMixBehavior() {
    XCTAssertEqual(resolve(.auto, .obey).mixBehavior, .exclusive)
    XCTAssertEqual(resolve(.doNotMix, .obey).mixBehavior, .exclusive)
    XCTAssertEqual(resolve(.duckOthers, .obey).mixBehavior, .duckOthers)
    XCTAssertEqual(resolve(.mixWithOthers, .obey).mixBehavior, .mixWithOthers)
  }

  func testSilentPolicyResolvesCategory() {
    XCTAssertEqual(resolve(.mixWithOthers, .auto).category, .playback)
    XCTAssertEqual(resolve(.mixWithOthers, .ignore).category, .playback)
    XCTAssertEqual(resolve(.mixWithOthers, .obey).category, .ambient)
    XCTAssertEqual(resolve(.doNotMix, .obey).category, .soloAmbient)
  }

  func testEmptyPolicyListUsesAutomaticPolicy() {
    XCTAssertEqual(
      NativeAudioSessionPolicy.resolvePlayback([]),
      NativePlaybackAudioConfiguration(category: .playback, mixBehavior: .exclusive)
    )
  }

  func testExclusivePolicyWinsOverMixingPolicies() {
    let config = NativeAudioSessionPolicy.resolvePlayback([
      NativePlaybackAudioPolicy(mix: .mixWithOthers, silent: .obey),
      NativePlaybackAudioPolicy(mix: .doNotMix, silent: .obey)
    ])
    XCTAssertEqual(config.mixBehavior, .exclusive)
    XCTAssertEqual(config.category, .soloAmbient)
  }
}
