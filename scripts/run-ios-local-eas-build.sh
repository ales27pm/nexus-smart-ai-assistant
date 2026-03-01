#!/usr/bin/env bash
set -euo pipefail

PROFILE="production"
CLEAN_CACHE="0"
REPAIR_CREDENTIALS="0"

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

./scripts/check-ios-local-build-env.sh
ensure_compatible_cocoapods
echo "[i] Validating CoreML pipeline assets before local EAS iOS build."
npm run coreml:validate -- --strict

env NODE_ENV=production NPM_CONFIG_CACHE=.npm-cache npx eas build --profile "$PROFILE" --platform ios --local
