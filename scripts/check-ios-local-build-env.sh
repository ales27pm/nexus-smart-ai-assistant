#!/usr/bin/env bash
set -euo pipefail

if ! command -v fastlane >/dev/null 2>&1; then
  cat <<'MSG'
❌ fastlane is missing from PATH.
Install it with one of these options, then rerun the build:
  - gem install fastlane --user-install
  - brew install fastlane

Note: fastlane is a Ruby tool (not an npm package).
MSG
  exit 1
fi

echo "✅ fastlane found: $(command -v fastlane)"
