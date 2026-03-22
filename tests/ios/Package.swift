// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "NitroPlayTests",
  platforms: [.macOS(.v12)],
  targets: [
    .target(
      name: "NitroPlayLogic",
      path: "Sources"
    ),
    .testTarget(
      name: "NitroPlayUnitTests",
      dependencies: ["NitroPlayLogic"],
      path: "Tests"
    )
  ]
)
