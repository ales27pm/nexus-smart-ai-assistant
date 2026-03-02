#!/usr/bin/env bash
set -euo pipefail

missing_tools=()

print_version() {
  local label="$1"
  shift
  local version_output
  version_output="$($@ 2>&1 | head -n 1)"
  echo "✅ ${label}: ${version_output}"
}

if command -v xcodebuild >/dev/null 2>&1; then
  print_version "xcodebuild" xcodebuild -version
else
  missing_tools+=("xcodebuild")
fi

if command -v node >/dev/null 2>&1; then
  print_version "node" node --version
else
  missing_tools+=("node")
fi

if command -v ruby >/dev/null 2>&1; then
  print_version "ruby" ruby --version
else
  missing_tools+=("ruby")
fi

if command -v fastlane >/dev/null 2>&1; then
  echo "✅ fastlane found: $(command -v fastlane)"
else
  missing_tools+=("fastlane")
fi

if [ ${#missing_tools[@]} -gt 0 ]; then
  echo "❌ Missing required toolchain components: ${missing_tools[*]}"
  cat <<'MSG'
Install missing tools and rerun the check:
  - fastlane: gem install fastlane --user-install (or brew install fastlane)
  - Xcode CLT: xcode-select --install
MSG
  exit 1
fi

if [ ! -f credentials.json ]; then
  cat <<'MSG'
❌ credentials.json is missing.
Docs: https://docs.expo.dev/app-signing/local-credentials/
MSG
  exit 1
fi

echo "✅ credentials.json found"

node ./scripts/validate-ios-local-credentials.mjs
