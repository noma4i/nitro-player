import Foundation

enum NativeAudioMixPolicy: Equatable {
  case auto
  case mixWithOthers
  case doNotMix
  case duckOthers
}

enum NativeAudioSilentPolicy: Equatable {
  case auto
  case ignore
  case obey
}

struct NativePlaybackAudioPolicy: Equatable {
  let mix: NativeAudioMixPolicy
  let silent: NativeAudioSilentPolicy

  static let automatic = NativePlaybackAudioPolicy(mix: .auto, silent: .auto)
}

enum NativePlaybackAudioCategoryPolicy: Equatable {
  case playback
  case ambient
  case soloAmbient
}

enum NativePlaybackAudioMixBehavior: Equatable {
  case exclusive
  case mixWithOthers
  case duckOthers
}

struct NativePlaybackAudioConfiguration: Equatable {
  let category: NativePlaybackAudioCategoryPolicy
  let mixBehavior: NativePlaybackAudioMixBehavior
}

enum NativeAudioSessionPolicy {
  static func resolvePlayback(_ policies: [NativePlaybackAudioPolicy]) -> NativePlaybackAudioConfiguration {
    let effectivePolicies = policies.isEmpty ? [NativePlaybackAudioPolicy.automatic] : policies

    let mixBehavior: NativePlaybackAudioMixBehavior =
      if effectivePolicies.contains(where: { $0.mix == .doNotMix || $0.mix == .auto }) {
        .exclusive
      } else if effectivePolicies.contains(where: { $0.mix == .duckOthers }) {
        .duckOthers
      } else {
        .mixWithOthers
      }

    let ignoreSilent = effectivePolicies.contains(where: { $0.silent == .auto || $0.silent == .ignore })

    let category: NativePlaybackAudioCategoryPolicy
    if ignoreSilent {
      category = .playback
    } else if mixBehavior == .exclusive {
      category = .soloAmbient
    } else {
      category = .ambient
    }

    return NativePlaybackAudioConfiguration(category: category, mixBehavior: mixBehavior)
  }
}
