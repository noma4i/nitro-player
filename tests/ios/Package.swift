// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "NitroPlayFeedTests",
  platforms: [
    .iOS(.v13),
    .macOS(.v13)
  ],
  products: [],
  targets: [
    .target(
      name: "NitroPlayFeedCore",
      path: "Sources/NitroPlayFeedCore"
    ),
    .target(
      name: "NitroPlayPlayerCore",
      path: "Sources/NitroPlayPlayerCore",
      sources: [
        "PlayerRetentionCoordinator.swift",
        "PlaybackStateEmissionGate.swift",
        "PlaybackWatchdogPolicy.swift",
        "PlayerAppStatePolicy.swift"
      ]
    ),
    .target(
      name: "NitroPlaySupportCore",
      path: "Sources/NitroPlaySupportCore",
      sources: [
        "LifecycleGate.swift",
        "SingleOwnerResourceSlot.swift"
      ]
    ),
    .target(
      name: "NitroPlayStreamingCore",
      path: "Sources/NitroPlayStreamingCore",
      sources: [
        "HlsTransportReadiness.swift",
        "HlsLeadingSegments.swift"
      ]
    ),
    .target(
      name: "NitroPlayRuntimeCore",
      path: "Sources/NitroPlayRuntimeCore",
      sources: [
        "NativeAudioSessionPolicy.swift",
        "NativeAudioSessionCoordinator.swift",
        "PlaybackAudioSessionBinding.swift",
        "PlaybackSuspensionRegistry.swift",
        "PlaybackSessionBinding.swift",
        "PlaybackSessionCoordinator.swift"
      ]
    ),
    .target(
      name: "NitroPlayViewCore",
      path: "Sources/NitroPlayViewCore",
      sources: [
        "PlayerViewBindingPolicy.swift"
      ]
    ),
    .testTarget(
      name: "NitroPlayFeedCoreTests",
      dependencies: ["NitroPlayFeedCore"],
      path: "Tests/NitroPlayFeedCoreTests"
    ),
    .testTarget(
      name: "NitroPlayBehaviorTests",
      dependencies: [
        "NitroPlayPlayerCore",
        "NitroPlayRuntimeCore",
        "NitroPlayStreamingCore",
        "NitroPlaySupportCore",
        "NitroPlayViewCore"
      ],
      path: "Tests/Behavior"
    )
  ]
)
