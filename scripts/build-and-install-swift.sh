#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../packages/PortIO-Swift"
APP_NAME="Port Monitor"
SCHEME="PortIO"
CONFIG="Release"
DERIVED_DATA="$PROJECT_DIR/.build"
APP_PATH="$DERIVED_DATA/Build/Products/$CONFIG/$APP_NAME.app"
INSTALL_PATH="/Applications/$APP_NAME.app"

echo "==> Building $APP_NAME ($CONFIG)..."
cd "$PROJECT_DIR"
xcodebuild \
    -scheme "$SCHEME" \
    -configuration "$CONFIG" \
    -derivedDataPath "$DERIVED_DATA" \
    build \
    2>&1 | tail -20

if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: Build product not found at $APP_PATH"
    exit 1
fi

echo ""
echo "==> Stopping existing $APP_NAME if running..."
osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
sleep 1

echo "==> Installing to /Applications..."
rm -rf "$INSTALL_PATH"
cp -R "$APP_PATH" "$INSTALL_PATH"
echo "    Installed to $INSTALL_PATH"

echo ""
echo "==> Launching $APP_NAME..."
open "$INSTALL_PATH"

echo ""
echo "Done."
