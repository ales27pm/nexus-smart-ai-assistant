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

if [ ! -f credentials.json ]; then
  cat <<'MSG'
❌ credentials.json is missing.
This project now uses EAS local iOS credentials (eas.json -> ios.credentialsSource=local)
to avoid remote certificate import failures.

Create credentials.json in the project root with your iOS distribution certificate,
provisioning profile, and certificate password before running local iOS builds.
Docs: https://docs.expo.dev/app-signing/local-credentials/
MSG
  exit 1
fi

echo "✅ fastlane found: $(command -v fastlane)"
echo "✅ credentials.json found"
node ./scripts/validate-ios-local-credentials.mjs
