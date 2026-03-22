// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "NitroPlayTests",
  targets: [
    .testTarget(
      name: "NitroPlayUnitTests",
      path: "Tests"
    )
  ]
)
