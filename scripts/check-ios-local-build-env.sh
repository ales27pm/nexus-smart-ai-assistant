#!/usr/bin/env bash
set -euo pipefail

missing_tools=()

print_version() {
  local label="$1"
  shift
  local version_output
  version_output="$("$@" 2>&1 | head -n 1)"
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
  print_version "fastlane" fastlane --version
else
  missing_tools+=("fastlane")
fi

if [ ${#missing_tools[@]} -gt 0 ]; then
  echo "❌ Missing required toolchain components: ${missing_tools[*]}"
  echo "Install missing tools and rerun the check:"

  for tool in "${missing_tools[@]}"; do
    case "$tool" in
      fastlane)
        echo "  - fastlane: gem install fastlane --user-install (or brew install fastlane)"
        ;;
      node)
        echo "  - node: install from https://nodejs.org/en/download/ (or brew install node)"
        ;;
      ruby)
        echo "  - ruby: install via your package manager or a version manager (rbenv/rvm/asdf)"
        ;;
      xcodebuild)
        echo "  - xcodebuild (Xcode Command Line Tools): xcode-select --install"
        ;;
      *)
        echo "  - ${tool}: install and ensure it is available on PATH"
        ;;
    esac
  done

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
