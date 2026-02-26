#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${ROOT_DIR}/ios"
PREFERRED_COCOAPODS_VERSION="1.15.2"

log() {
  echo "[ios-prebuild-doctor] $*"
}

get_user_gem_home() {
  local user_gem_home
  if ! user_gem_home="$(gem env user_gemhome 2>/dev/null)" || [[ -z "${user_gem_home}" ]]; then
    log "Failed to resolve gem user_gemhome; ensure RubyGems is installed and configured."
    exit 1
  fi

  printf '%s\n' "${user_gem_home}"
}

ensure_cocoapods() {
  if ! command -v pod >/dev/null 2>&1; then
    log "pod is not available on PATH. Install CocoaPods before running this script."
    exit 1
  fi

  local current_pod_version
  current_pod_version="$(pod --version 2>/dev/null || true)"
  log "Detected pod $(command -v pod) (version: ${current_pod_version:-unknown})"

  if [[ "${current_pod_version}" == ${PREFERRED_COCOAPODS_VERSION}* ]]; then
    return
  fi

  log "Installing CocoaPods ${PREFERRED_COCOAPODS_VERSION} into user gems for reproducible prebuild runs."
  local user_gem_home
  user_gem_home="$(get_user_gem_home)"
  gem install cocoapods -v "${PREFERRED_COCOAPODS_VERSION}" --user-install --no-document >/dev/null
  export PATH="${user_gem_home}/bin:${PATH}"

  local activated_version
  activated_version="$(pod --version 2>/dev/null || true)"
  if [[ "${activated_version}" != ${PREFERRED_COCOAPODS_VERSION}* ]]; then
    log "Failed to activate CocoaPods ${PREFERRED_COCOAPODS_VERSION} (current: ${activated_version:-unknown})."
    exit 1
  fi

  log "Using CocoaPods ${activated_version} from $(command -v pod)"
}

write_bundler_files() {
  mkdir -p "${IOS_DIR}"

  local active_ruby_version
  if ! active_ruby_version="$(ruby -e 'print RUBY_VERSION' 2>/dev/null)" || [[ -z "${active_ruby_version}" ]]; then
    log "Failed to detect the active Ruby version. Ensure Ruby is installed and available on PATH."
    exit 1
  fi

  printf '%s\n' "${active_ruby_version}" > "${IOS_DIR}/.ruby-version"

  cat > "${IOS_DIR}/Gemfile" <<'GEMFILE'
source 'https://rubygems.org'

ruby File.read(File.join(__dir__, '.ruby-version')).strip

gem 'cocoapods', '1.15.2'
GEMFILE

  log "Wrote ios/.ruby-version and ios/Gemfile to pin CocoaPods for bundle exec pod install."
}

run_prebuild_and_pod_install() {
  log "Running Expo prebuild without pod install so we can control the CocoaPods toolchain."
  (
    cd "${ROOT_DIR}"
    npx expo prebuild --platform ios --no-install
  )

  write_bundler_files

  if ! command -v bundle >/dev/null 2>&1; then
    log "Bundler not found; installing bundler into user gems."
    gem install bundler --user-install --no-document >/dev/null
    local user_gem_home
    user_gem_home="$(get_user_gem_home)"
    export PATH="${user_gem_home}/bin:${PATH}"
  fi

  log "Installing iOS Ruby gems via bundler."
  (
    cd "${IOS_DIR}"
    bundle install
  )

  log "Running pod install via bundler for deterministic CocoaPods versioning."
  (
    cd "${IOS_DIR}"
    bundle exec pod install --verbose
  )
}

print_next_steps() {
  cat <<'NEXT'

If pod install still fails with `PBXFileReference#new_file`, isolate custom pods:
1. In package.json, temporarily remove custom native modules (for this repo, start with `expo-coreml-llm`).
2. Run `npm install`.
3. Re-run this script.
4. Add modules back one by one until the failure reproduces.

NEXT
}

ensure_cocoapods
run_prebuild_and_pod_install
print_next_steps
