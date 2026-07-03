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
    .testTarget(
      name: "NitroPlayFeedCoreTests",
      dependencies: ["NitroPlayFeedCore"],
      path: "Tests/NitroPlayFeedCoreTests"
    )
  ]
)
