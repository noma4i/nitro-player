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
        "PlaybackStateEmissionCoordinator.swift",
        "PeriodicTimeObserverLifecycle.swift"
      ]
    ),
    .target(
      name: "NitroPlaySupportCore",
      path: "Sources/NitroPlaySupportCore",
      sources: [
        "LifecycleGate.swift",
        "ListenerRegistryCore.swift",
        "SourceCommandCoordinator.swift"
      ]
    ),
    .target(
      name: "NitroPlaySourceCore",
      path: "Sources/NitroPlaySourceCore",
      sources: [
        "HlsTransportRoutePolicy.swift"
      ]
    ),
    .target(
      name: "NitroPlayStreamingCore",
      path: "Sources/NitroPlayStreamingCore",
      sources: [
        "HlsManifestParser.swift",
        "HlsPrefetchDeduper.swift",
        "HlsProxyRuntimeLifecycleState.swift"
      ]
    ),
    .target(
      name: "NitroPlayPreviewCore",
      path: "Sources/NitroPlayPreviewCore",
      sources: [
        "VideoPreviewDecodePlan.swift"
      ]
    ),
    .target(
      name: "NitroPlayKtvLedgerCore",
      path: "Sources/NitroPlayKtvLedgerCore",
      sources: [
        "KTVHCRequestLedger.m"
      ],
      publicHeadersPath: "."
    ),
    .testTarget(
      name: "NitroPlayFeedCoreTests",
      dependencies: ["NitroPlayFeedCore"],
      path: "Tests/NitroPlayFeedCoreTests"
    ),
    .testTarget(
      name: "NitroPlayBehaviorTests",
      dependencies: [
        "NitroPlayKtvLedgerCore",
        "NitroPlayPlayerCore",
        "NitroPlayPreviewCore",
        "NitroPlaySourceCore",
        "NitroPlayStreamingCore",
        "NitroPlaySupportCore"
      ],
      path: "Tests/Behavior"
    )
  ]
)
