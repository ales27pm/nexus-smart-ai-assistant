#!/usr/bin/env bash
set -euo pipefail

if [ ! -d ios ]; then
  npx expo prebuild --platform ios --non-interactive --no-install
fi

cd ios
if [ ! -f Podfile.lock ]; then
  pod install --repo-update
fi

WORKSPACE="$(find . -maxdepth 1 -name '*.xcworkspace' -type d | head -n 1)"
SCHEME="$(xcodebuild -list -json -workspace "$WORKSPACE" | ruby -e 'require "json"; puts((JSON.parse(STDIN.read).dig("workspace","schemes") || []).first)')"

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build

APP_PATH="$(find build/Build/Products/Debug-iphonesimulator -maxdepth 1 -name "*.app" -type d | head -n 1)"
rm -rf build/DetoxApp.app
cp -R "$APP_PATH" build/DetoxApp.app
