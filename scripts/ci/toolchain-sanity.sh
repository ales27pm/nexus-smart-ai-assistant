#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[toolchain-sanity] Missing required command: $cmd" >&2
    exit 1
  fi
}

get_major_version() {
  local version="$1"
  version="${version#v}"
  echo "${version%%.*}"
}

require_cmd xcodebuild
require_cmd node
require_cmd npm
require_cmd fastlane

echo "[toolchain-sanity] Xcode"
xcodebuild -version

echo "[toolchain-sanity] Node"
node_version="$(node -v)"
echo "$node_version"

node_major="$(get_major_version "$node_version")"
if [[ "$node_major" -lt 20 ]]; then
  echo "[toolchain-sanity] Node.js 20+ is required. Found: $node_version" >&2
  exit 1
fi

echo "[toolchain-sanity] npm"
npm -v

echo "[toolchain-sanity] Fastlane"
fastlane --version

if [[ -f "./credentials.json" ]]; then
  echo "[toolchain-sanity] Validating local iOS credential parity"
  node ./scripts/validate-ios-local-credentials.mjs
else
  echo "[toolchain-sanity] Skipping local iOS credential parity validation (credentials.json not present on this runner)"
fi

echo "[toolchain-sanity] Validating CoreML pipeline manifest"
npm run coreml:validate -- --strict

echo "[toolchain-sanity] All checks passed"
