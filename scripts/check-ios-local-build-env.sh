#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  cat <<'MSG'
❌ iOS local builds are only supported on macOS hosts.

This command runs `eas build --local --platform ios`, which requires Xcode/xcodebuild and cannot run on Linux/Windows.

Use one of these options instead:
  - Build iOS in the cloud: `npx eas build --platform ios --profile production`
  - Run Android local builds on this machine: `npm run build:prod:android:local:clean`
  - Run iOS local builds from a Mac with Xcode + Fastlane installed
MSG
  exit 1
fi

missing_tools=()

print_version() {
  local label="$1"
  shift

  local command_output
  local command_status

  if command_output="$("$@" 2>&1)"; then
    command_status=0
  else
    command_status=$?
  fi

  local version_output
  version_output="$(printf '%s\n' "${command_output}" | head -n 1)"

  if [ "${command_status}" -eq 0 ]; then
    echo "✅ ${label}: ${version_output}"
    return 0
  fi

  echo "❌ ${label}: failed to get version (${version_output})" >&2
  return 1
}

if command -v xcodebuild >/dev/null 2>&1 && print_version "xcodebuild" xcodebuild -version; then
  :
else
  missing_tools+=("xcodebuild")
fi

if command -v node >/dev/null 2>&1 && print_version "node" node --version; then
  :
else
  missing_tools+=("node")
fi

if command -v ruby >/dev/null 2>&1 && print_version "ruby" ruby --version; then
  :
else
  missing_tools+=("ruby")
fi

if command -v fastlane >/dev/null 2>&1 && print_version "fastlane" fastlane --version; then
  :
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
