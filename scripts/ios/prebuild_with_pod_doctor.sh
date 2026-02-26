#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${ROOT_DIR}/ios"
PREFERRED_COCOAPODS_VERSION="1.15.0"
AUTO_ISOLATE_CUSTOM_PODS=0

log() {
  echo "[ios-prebuild-doctor] $*"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --auto-isolate-custom-pods)
        AUTO_ISOLATE_CUSTOM_PODS=1
        shift
        ;;
      *)
        log "Unknown argument: $1"
        exit 1
        ;;
    esac
  done
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
    log "Warning: continuing without pod on PATH; downstream bootstrap can install CocoaPods."
    export POD_MISSING=1
    export POD_AVAILABLE=false
    return
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
  cat > "${IOS_DIR}/.ruby-version" <<'RUBY'
3.2.6
RUBY

  cat > "${IOS_DIR}/Gemfile" <<GEMFILE
source 'https://rubygems.org'

ruby File.read(File.join(__dir__, '.ruby-version')).strip

gem 'cocoapods', '= ${PREFERRED_COCOAPODS_VERSION}'
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

modules_to_isolate() {
  local raw_modules
  raw_modules="${CUSTOM_POD_MODULES:-expo-coreml-llm}"
  IFS=',' read -r -a modules <<<"${raw_modules}"
  for module in "${modules[@]}"; do
    module="${module// /}"
    if [[ -n "${module}" ]]; then
      printf '%s\n' "${module}"
    fi
  done
}

set_package_modules() {
  local package_json_path="$1"
  local original_package_json_path="$2"
  shift 2

  node -e "
const fs = require('fs');
const currentPath = process.argv[1];
const originalPath = process.argv[2];
const modules = process.argv.slice(3);
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
const original = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
for (const section of sections) {
  if (!current[section]) current[section] = {};
}
for (const section of sections) {
  for (const moduleName of modules) {
    delete current[section][moduleName];
  }
}
for (const moduleName of modules) {
  for (const section of sections) {
    if (original[section] && Object.prototype.hasOwnProperty.call(original[section], moduleName)) {
      current[section][moduleName] = original[section][moduleName];
      break;
    }
  }
}
for (const section of sections) {
  if (Object.keys(current[section]).length === 0) {
    delete current[section];
  }
}
fs.writeFileSync(currentPath, JSON.stringify(current, null, 2) + '\n');
" "${package_json_path}" "${original_package_json_path}" "$@"
}

run_automated_custom_pod_isolation() {
  local package_json_path="${ROOT_DIR}/package.json"
  local package_lock_path="${ROOT_DIR}/package-lock.json"
  local temp_dir
  temp_dir="$(mktemp -d)"

  local original_package_json_path="${temp_dir}/package.json.original"
  local original_package_lock_path="${temp_dir}/package-lock.json.original"

  cp "${package_json_path}" "${original_package_json_path}"
  if [[ -f "${package_lock_path}" ]]; then
    cp "${package_lock_path}" "${original_package_lock_path}"
  fi

  cleanup_isolation() {
    cp "${original_package_json_path}" "${package_json_path}"
    if [[ -f "${original_package_lock_path}" ]]; then
      cp "${original_package_lock_path}" "${package_lock_path}"
    else
      rm -f "${package_lock_path}"
    fi
    rm -rf "${temp_dir}"
  }
  trap cleanup_isolation EXIT

  mapfile -t modules < <(modules_to_isolate)
  if [[ ${#modules[@]} -eq 0 ]]; then
    log "No custom pod modules configured for isolation."
    return 1
  fi

  log "Starting automated custom pod isolation for: ${modules[*]}"

  set_package_modules "${package_json_path}" "${original_package_json_path}"
  (
    cd "${ROOT_DIR}"
    npm install
  )

  if ! run_prebuild_and_pod_install; then
    log "pod install still fails after removing all configured custom modules."
    return 1
  fi

  local restored_modules=()
  for module in "${modules[@]}"; do
    restored_modules+=("${module}")
    log "Re-adding module(s): ${restored_modules[*]}"

    set_package_modules "${package_json_path}" "${original_package_json_path}" "${restored_modules[@]}"
    (
      cd "${ROOT_DIR}"
      npm install
    )

    if ! run_prebuild_and_pod_install; then
      log "Detected potential problematic module: ${module}"
      return 1
    fi
  done

  log "All configured modules were re-added without reproducing the pod install failure."
  return 0
}

print_next_steps() {
  cat <<'NEXT'

If pod install still fails with `PBXFileReference#new_file`, isolate custom pods:
1. In package.json, temporarily remove custom native modules (for this repo, start with `expo-coreml-llm`).
2. Run `npm install`.
3. Re-run this script.
4. Add modules back one by one until the failure reproduces.

Tip: Run this script with `--auto-isolate-custom-pods` to automate the workflow above.
Set `CUSTOM_POD_MODULES` to a comma-separated module list to customize the isolation order.

NEXT
}

main() {
  parse_args "$@"
  ensure_cocoapods

  if run_prebuild_and_pod_install; then
    print_next_steps
    return
  fi

  log "Initial pod install workflow failed."
  if [[ ${AUTO_ISOLATE_CUSTOM_PODS} -eq 1 ]]; then
    if run_automated_custom_pod_isolation; then
      print_next_steps
      return
    fi
  fi

  print_next_steps
  exit 1
}

main "$@"
