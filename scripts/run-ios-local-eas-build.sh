#!/usr/bin/env bash
set -euo pipefail

PROFILE="production"
CLEAN_CACHE="0"
REPAIR_CREDENTIALS="0"
SKIP_AUTO_FINGERPRINT="1"
REQUIRED_EAS_CLI_VERSION="18.18.0"
EAS_RUNNER=()

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

version_ge() {
  local current="$1"
  local required="$2"
  [[ "$(printf '%s\n' "$required" "$current" | sort -V | tail -n1)" == "$current" ]]
}

extract_semver() {
  local raw="$1"

  # Prefer installed CLI version lines like:
  #   eas-cli/18.1.0 darwin-x64 node-v24.13.1
  local version
  version="$(printf '%s\n' "$raw" | sed -nE 's|.*eas-cli/([0-9]+\.[0-9]+\.[0-9]+).*|\1|p' | head -n1)"
  if [[ -n "$version" ]]; then
    printf '%s\n' "$version"
    return
  fi

  # Fallback for update notices like:
  #   ★ eas-cli@18.1.0 is now available.
  printf '%s\n' "$raw" | sed -nE 's#.*[^0-9]([0-9]+\.[0-9]+\.[0-9]+)([^0-9].*|$)#\1#p' | head -n1
}

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

print_phase() {
  echo "[i] ━━━ $1 ━━━"
}

print_failure_hints() {
  echo "[i] Remediation: run ./scripts/check-ios-local-build-env.sh directly for detailed output." >&2
  echo "[i] Verify required tools are available:" >&2
  echo "    xcodebuild -version" >&2
  echo "    fastlane --version" >&2
  echo "    node --version" >&2
}

resolve_eas_runner() {
  local eas_raw_output eas_version local_eas_bin

  if command -v eas >/dev/null 2>&1; then
    eas_raw_output="$(eas --version 2>&1 || true)"
    eas_version="$(extract_semver "$eas_raw_output")"

    if [[ -n "$eas_version" ]] && version_ge "$eas_version" "$REQUIRED_EAS_CLI_VERSION"; then
      EAS_RUNNER=(eas)
      echo "[i] Using global eas-cli ${eas_version}."
      return 0
    fi

    if [[ -n "$eas_version" ]]; then
      echo "[i] Global eas-cli ${eas_version} is below required ${REQUIRED_EAS_CLI_VERSION}; using pinned npx fallback."
    else
      echo "[i] Could not parse global eas-cli version; using pinned npx fallback."
    fi
  else
    echo "[i] Global eas-cli not found; using pinned npx fallback."
  fi

  if local_eas_bin="$(resolve_local_eas_binary)"; then
    eas_raw_output="$($local_eas_bin --version 2>&1 || true)"
    eas_version="$(extract_semver "$eas_raw_output")"

    if [[ -n "$eas_version" ]] && version_ge "$eas_version" "$REQUIRED_EAS_CLI_VERSION"; then
      EAS_RUNNER=("$local_eas_bin")
      echo "[i] Using project-local eas-cli ${eas_version} (${local_eas_bin})."
      return 0
    fi

    if [[ -n "$eas_version" ]]; then
      echo "[i] Project-local eas-cli ${eas_version} is below required ${REQUIRED_EAS_CLI_VERSION}; using pinned npx fallback."
    else
      echo "[i] Could not parse project-local eas-cli version; using pinned npx fallback."
    fi
  fi

  EAS_RUNNER=(npx -y eas-cli@">=${REQUIRED_EAS_CLI_VERSION}")
}

print_build_failure_diagnostics() {
  local latest_bundle=""

  echo "[i] Collecting local export diagnostics..." >&2
  echo "[i] Free disk space:" >&2
  df -h >&2 || true

  local gym_tmp_dir="${TMPDIR:-/var/folders}"
  local gym_tmp_mount="${gym_tmp_dir%/}"
  while [[ "$gym_tmp_mount" != "/" && ! -d "$gym_tmp_mount" ]]; do
    gym_tmp_mount="$(dirname "$gym_tmp_mount")"
  done
  if [[ -z "$gym_tmp_mount" || ! -d "$gym_tmp_mount" ]]; then
    gym_tmp_mount="/var/folders"
  fi

  echo "[i] Gym temp directory hint (TMPDIR): ${gym_tmp_dir}" >&2
  echo "[i] Filesystem usage for gym temp mount (${gym_tmp_mount}):" >&2
  df -h "$gym_tmp_mount" >&2 || true

  latest_bundle="$({
    find /var/folders "$HOME/Library/Logs" -type d -name '*.xcdistributionlogs' 2>/dev/null || true
  } | while IFS= read -r bundle; do
    [[ -d "$bundle" ]] || continue
    local mtime
    mtime="$(stat -f '%m' "$bundle" 2>/dev/null || stat -c '%Y' "$bundle" 2>/dev/null || echo 0)"
    printf '%s\t%s\n' "$mtime" "$bundle"
  done | sort -nr | head -n 1 | cut -f2-)"

  if [[ -z "$latest_bundle" ]]; then
    echo "[i] No *.xcdistributionlogs bundle found in /var/folders or ~/Library/Logs." >&2
    return
  fi

  echo "[i] Newest .xcdistributionlogs bundle: ${latest_bundle}" >&2

  local standard_log="${latest_bundle}/IDEDistribution.standard.log"
  if [[ -f "$standard_log" ]]; then
    echo "[i] --- ${standard_log} (tail -n 200) ---" >&2
    tail -n 200 "$standard_log" >&2 || true
  else
    echo "[i] Missing expected file: ${standard_log}" >&2
  fi

  local summary_plist="${latest_bundle}/DistributionSummary.plist"
  if [[ -f "$summary_plist" ]]; then
    echo "[i] --- ${summary_plist} ---" >&2
    if command -v plutil >/dev/null 2>&1; then
      plutil -p "$summary_plist" >&2 || cat "$summary_plist" >&2 || true
    else
      cat "$summary_plist" >&2 || true
    fi
  else
    echo "[i] Missing expected file: ${summary_plist}" >&2
  fi

  local found_any_logs="0"
  while IFS= read -r log_file; do
    [[ -f "$log_file" ]] || continue
    found_any_logs="1"
    echo "[i] --- ${log_file} (tail -n 100) ---" >&2
    tail -n 100 "$log_file" >&2 || true
  done < <(find "$latest_bundle" -type f -name '*.log' 2>/dev/null | sort)

  if [[ "$found_any_logs" == "0" ]]; then
    echo "[i] No .log files were found inside ${latest_bundle}." >&2
  fi
}

if [[ "$CLEAN_CACHE" == "1" ]]; then
  rm -rf .npm-cache
fi

if [[ "$REPAIR_CREDENTIALS" == "1" ]]; then
  npm cache verify --cache .npm-cache
  node ./scripts/repair-ios-local-credentials.mjs --repair
fi

print_phase "Preflight: iOS local build environment checks"
if ! ./scripts/check-ios-local-build-env.sh; then
  echo "❌ Preflight failed: iOS local build environment checks did not pass." >&2
  print_failure_hints
  exit 1
fi

ensure_compatible_cocoapods

print_phase "Preflight: CoreML pipeline validation"
echo "[i] Validating CoreML pipeline assets before local EAS iOS build."
if ! npm run coreml:validate -- --strict; then
  echo "❌ Preflight failed: CoreML pipeline validation did not pass." >&2
  print_failure_hints
  exit 1
fi

print_phase "Build: EAS local iOS invocation"
resolve_eas_runner
if [[ "$SKIP_AUTO_FINGERPRINT" == "1" ]]; then
  echo "[i] Skipping EAS auto fingerprint to avoid known 'balanced is not a function' failures during local builds."
  echo "[i] Pass --auto-fingerprint to re-enable EAS automatic fingerprint computation."
  if ! env NODE_ENV=production NPM_CONFIG_CACHE=.npm-cache EAS_SKIP_AUTO_FINGERPRINT=1 "${EAS_RUNNER[@]}" build --profile "$PROFILE" --platform ios --local; then
    echo "❌ Build failed: EAS local iOS invocation failed (auto fingerprint disabled)." >&2
    print_build_failure_diagnostics
    print_failure_hints
    exit 1
  fi
else
  if ! env NODE_ENV=production NPM_CONFIG_CACHE=.npm-cache "${EAS_RUNNER[@]}" build --profile "$PROFILE" --platform ios --local; then
    echo "❌ Build failed: EAS local iOS invocation failed." >&2
    print_build_failure_diagnostics
    print_failure_hints
    exit 1
  fi
fi
