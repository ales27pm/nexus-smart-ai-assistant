#!/usr/bin/env bash
set -euo pipefail

PROFILE="production"
CLEAN_CACHE="0"
REPAIR_CREDENTIALS="0"
SKIP_AUTO_FINGERPRINT="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --clean-cache)
      CLEAN_CACHE="1"
      shift
      ;;
    --repair-credentials)
      REPAIR_CREDENTIALS="1"
      shift
      ;;
    --auto-fingerprint)
      SKIP_AUTO_FINGERPRINT="0"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ensure_compatible_cocoapods() {
  if ! command -v pod >/dev/null 2>&1; then
    echo "⚠️ pod not found on PATH. Continuing; EAS may install/use its own CocoaPods binary."
    return
  fi

  local pod_version ruby_version ruby_major
  pod_version="$(pod --version 2>/dev/null || true)"
  ruby_version="$(ruby -e 'print RUBY_VERSION' 2>/dev/null || true)"
  ruby_major="${ruby_version%%.*}"

  if [[ "$pod_version" == "1.16.2" && "$ruby_major" =~ ^[0-9]+$ && "$ruby_major" -ge 4 ]]; then
    echo "[i] Detected CocoaPods ${pod_version} with Ruby ${ruby_version}; installing CocoaPods 1.15.2 to avoid PBXFileReference#new_file crash."
    local user_gem_home
    user_gem_home="$(gem env user_gemhome)"
    gem install cocoapods -v 1.15.2 --user-install --no-document >/dev/null
    export PATH="${user_gem_home}/bin:${PATH}"
    local pinned_pod_version
    pinned_pod_version="$(pod --version 2>/dev/null || true)"
    if [[ "$pinned_pod_version" != "1.15.2" ]]; then
      echo "❌ Failed to activate CocoaPods 1.15.2 (current: ${pinned_pod_version:-unknown})." >&2
      exit 1
    fi
    echo "✅ Using CocoaPods ${pinned_pod_version} from ${user_gem_home}/bin/pod"
  fi
}

if [[ "$CLEAN_CACHE" == "1" ]]; then
  rm -rf .npm-cache
fi

if [[ "$REPAIR_CREDENTIALS" == "1" ]]; then
  npm cache verify --cache .npm-cache
  node ./scripts/repair-ios-local-credentials.mjs --repair
fi

echo "[i] ━━━ Preflight: iOS local build environment checks ━━━"
if ! ./scripts/check-ios-local-build-env.sh; then
  echo "❌ Preflight failed: iOS local build environment checks did not pass." >&2
  echo "[i] Remediation: run ./scripts/check-ios-local-build-env.sh directly for detailed output." >&2
  echo "[i] Verify required tools are available:" >&2
  echo "    xcodebuild -version" >&2
  echo "    fastlane --version" >&2
  echo "    node --version" >&2
  exit 1
fi

ensure_compatible_cocoapods

echo "[i] ━━━ Preflight: CoreML pipeline validation ━━━"
echo "[i] Validating CoreML pipeline assets before local EAS iOS build."
if ! npm run coreml:validate -- --strict; then
  echo "❌ Preflight failed: CoreML pipeline validation did not pass." >&2
  echo "[i] Remediation: run ./scripts/check-ios-local-build-env.sh directly before retrying." >&2
  echo "[i] Verify required tools are available:" >&2
  echo "    xcodebuild -version" >&2
  echo "    fastlane --version" >&2
  echo "    node --version" >&2
  exit 1
fi

echo "[i] ━━━ Build: EAS local iOS invocation ━━━"
if [[ "$SKIP_AUTO_FINGERPRINT" == "1" ]]; then
  echo "[i] Skipping EAS auto fingerprint to avoid known 'balanced is not a function' failures during local builds."
  echo "[i] Pass --auto-fingerprint to re-enable EAS automatic fingerprint computation."
  if ! env NODE_ENV=production NPM_CONFIG_CACHE=.npm-cache EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build --profile "$PROFILE" --platform ios --local; then
    echo "❌ Build failed: EAS local iOS invocation failed (auto fingerprint disabled)." >&2
    echo "[i] Remediation: run ./scripts/check-ios-local-build-env.sh directly, then retry this script." >&2
    echo "[i] Verify required tools are available:" >&2
    echo "    xcodebuild -version" >&2
    echo "    fastlane --version" >&2
    echo "    node --version" >&2
    exit 1
  fi
else
  if ! env NODE_ENV=production NPM_CONFIG_CACHE=.npm-cache npx eas build --profile "$PROFILE" --platform ios --local; then
    echo "❌ Build failed: EAS local iOS invocation failed." >&2
    echo "[i] Remediation: run ./scripts/check-ios-local-build-env.sh directly, then retry this script." >&2
    echo "[i] Verify required tools are available:" >&2
    echo "    xcodebuild -version" >&2
    echo "    fastlane --version" >&2
    echo "    node --version" >&2
    exit 1
  fi
fi
