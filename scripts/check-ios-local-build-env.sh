#!/usr/bin/env bash
set -euo pipefail

if ! command -v fastlane >/dev/null 2>&1; then
  cat <<'MSG'
❌ fastlane is missing from PATH.
Install it with one of these options, then rerun the build:
  - gem install fastlane --user-install
  - brew install fastlane
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

echo "✅ fastlane found: $(command -v fastlane)"
echo "✅ credentials.json found"

node ./scripts/validate-ios-local-credentials.mjs
