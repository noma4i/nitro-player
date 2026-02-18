#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
WORKSPACE="$IOS_DIR/JustPlayerExample.xcworkspace"
SCHEME="JustPlayerExample"
CONFIGURATION="Debug"
DEVICE_NAME="${IOS_DEVICE_NAME:-TimTam}"
XCODE_DEVICE_UDID="${IOS_DEVICE_UDID:-}"
BUNDLE_ID="com.noma4i.justplayer.example"
APP_PATH="$HOME/Library/Developer/Xcode/DerivedData/JustPlayerExample-ckthjrerxttszxgrffwfbjzvfcmb/Build/Products/${CONFIGURATION}-iphoneos/JustPlayerExample.app"

if [ ! -d "$WORKSPACE" ]; then
  echo "Workspace not found: $WORKSPACE" >&2
  exit 1
fi

if [ -z "$XCODE_DEVICE_UDID" ]; then
  XCODE_DEVICE_UDID="$(xcrun xctrace list devices | awk -v name="$DEVICE_NAME" '$1 == name { gsub(/[()]/, "", $NF); print $NF; exit }')"
fi

if [ -z "$XCODE_DEVICE_UDID" ]; then
  echo "Unable to resolve a connected iOS device. Set IOS_DEVICE_NAME or IOS_DEVICE_UDID." >&2
  exit 1
fi

cd "$ROOT_DIR"

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "id=$XCODE_DEVICE_UDID" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build

if [ ! -d "$APP_PATH" ]; then
  echo "Built app not found: $APP_PATH" >&2
  exit 1
fi

xcrun devicectl device install app --device "$DEVICE_NAME" "$APP_PATH"
xcrun devicectl device process launch --device "$DEVICE_NAME" "$BUNDLE_ID"
