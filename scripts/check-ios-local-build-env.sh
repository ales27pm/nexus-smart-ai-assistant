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


required_eas_cli_version="18.18.0"
required_fastlane_version="2.222.0"
eas_runner=()

resolve_local_eas_binary() {
  if [[ -x "./node_modules/.bin/eas" ]]; then
    printf '%s\n' "./node_modules/.bin/eas"
    return 0
  fi

  local npm_bin
  npm_bin="$(npm bin 2>/dev/null || true)"
  if [[ -n "$npm_bin" && -x "$npm_bin/eas" ]]; then
    printf '%s\n' "$npm_bin/eas"
    return 0
  fi

  return 1
}

extract_semver() {
  local raw="$1"

  # Prefer the installed version line first when available.
  # Failure case seen in CI output:
  #   npm WARN deprecated ...
  #   eas-cli@18.19.1 is now available.
  #   eas-cli/18.18.0 darwin-x64 node-v20.16.0
  # If we grab the first semver globally, we can accidentally parse a warning
  # instead of the actual installed CLI version.
  local version
  version="$(printf '%s\n' "$raw" | sed -nE 's|.*eas-cli/([0-9]+\.[0-9]+\.[0-9]+).*|\1|p' | head -n1)"
  if [[ -n "$version" ]]; then
    printf '%s\n' "$version"
    return
  fi

  # Accept plain semver output too, e.g.:
  #   18.0.3
  version="$(printf '%s\n' "$raw" | sed -nE 's|^v?([0-9]+\.[0-9]+\.[0-9]+)$|\1|p' | head -n1)"
  if [[ -n "$version" ]]; then
    printf '%s\n' "$version"
    return
  fi

  # Fallback for mixed lines like:
  #   eas-cli@18.1.0 is now available.
  printf '%s\n' "$raw" | sed -nE 's#.*[^0-9]([0-9]+\.[0-9]+\.[0-9]+)([^0-9].*|$)#\1#p' | head -n1
}

version_ge() {
  local current="$1"
  local required="$2"
  [[ "$(printf '%s\n' "$required" "$current" | sort -V | tail -n1)" == "$current" ]]
}

print_version() {
  local label="$1"
  shift

  local command_output=""
  local command_status=0

  # Guard command execution so set -e does not terminate the script when
  # version probing fails for an installed tool.
  set +e
  command_output="$("$@" 2>&1)"
  command_status=$?
  set -e

  local version_output
  IFS=$'\n' read -r version_output _ <<<"${command_output}"

  if [ "${command_status}" -eq 0 ]; then
    echo "✅ ${label}: ${version_output}"
    return 0
  fi

  echo "❌ ${label}: failed to get version (${version_output})" >&2
  return 1
}

resolve_eas_runner() {
  local eas_raw_output=""
  local eas_version=""
  local local_eas_bin=""

  if command -v eas >/dev/null 2>&1; then
    eas_raw_output="$(eas --version 2>&1 || true)"
    eas_version="$(extract_semver "$eas_raw_output")"

    if [[ -n "$eas_version" ]] && version_ge "$eas_version" "$required_eas_cli_version"; then
      eas_runner=(eas)
      echo "✅ eas-cli: using global eas-cli ${eas_version}"
      return 0
    fi

    if [[ -n "$eas_version" ]]; then
      echo "⚠️  Global eas-cli ${eas_version} is below required ${required_eas_cli_version}; using pinned npx fallback."
    else
      echo "⚠️  Could not parse global eas-cli version; using pinned npx fallback."
    fi
  else
    echo "⚠️  Global eas-cli not found; using pinned npx fallback."
  fi

  if local_eas_bin="$(resolve_local_eas_binary)"; then
    eas_raw_output="$($local_eas_bin --version 2>&1 || true)"
    eas_version="$(extract_semver "$eas_raw_output")"

    if [[ -n "$eas_version" ]] && version_ge "$eas_version" "$required_eas_cli_version"; then
      eas_runner=("$local_eas_bin")
      echo "✅ eas-cli: using project-local eas-cli ${eas_version} (${local_eas_bin})"
      return 0
    fi

    if [[ -n "$eas_version" ]]; then
      echo "⚠️  Project-local eas-cli ${eas_version} is below required ${required_eas_cli_version}; using pinned npx fallback."
    else
      echo "⚠️  Could not parse project-local eas-cli version; using pinned npx fallback."
    fi
  fi

  eas_runner=(npx -y eas-cli@">=${required_eas_cli_version}")

  if "${eas_runner[@]}" --version >/dev/null 2>&1; then
    echo "✅ eas-cli: using fallback runner npx -y eas-cli@\">=${required_eas_cli_version}\""
    return 0
  fi

  echo "❌ eas-cli fallback is unavailable. Ensure npm/npx can execute packages from npm registry." >&2
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
  fastlane_version="$(fastlane --version 2>/dev/null | sed -E 's/.*fastlane ([0-9]+(\.[0-9]+){1,2}).*/\1/' | head -n1)"
  if [[ -n "$fastlane_version" ]] && ! version_ge "$fastlane_version" "$required_fastlane_version"; then
    echo "❌ fastlane ${fastlane_version} is too old. Require >= ${required_fastlane_version} for current Xcode export compatibility." >&2
    missing_tools+=("fastlane")
  fi
else
  missing_tools+=("fastlane")
fi

if ! resolve_eas_runner; then
  missing_tools+=("eas")
fi

if [ ${#missing_tools[@]} -gt 0 ]; then
  echo "❌ Missing required toolchain components: ${missing_tools[*]}"
  echo "Install missing tools and rerun the check:"

  for tool in "${missing_tools[@]}"; do
    case "$tool" in
      fastlane)
        echo "  - fastlane: gem install fastlane --user-install (minimum ${required_fastlane_version}) (or brew install fastlane)"
        ;;
      eas)
        echo "  - eas-cli: npm install -g eas-cli@latest (minimum ${required_eas_cli_version})"
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
