#!/usr/bin/env bash
set -euo pipefail

# Automate iOS local credential sync (Apple Developer -> local files) using fastlane.
#
# What this does:
#   1) Ensures an Apple Distribution certificate exists (creates/downloads via fastlane cert)
#   2) Exports the matching certificate + private key to a .p12
#   3) Downloads a provisioning profile for a bundle id via fastlane sigh
#   4) Writes credentials.json for Expo local credentials
#
# Requirements:
#   - macOS (uses keychain + security CLI)
#   - fastlane installed and authenticated (FASTLANE_SESSION or interactive Apple login)
#   - OpenSSL
#   - Existing app id on Apple Developer account
#
# Example:
#   P12_PASSWORD='strong-pass' ./scripts/ios/sync_apple_credentials_fastlane.sh \
#     --bundle-id com.example.app \
#     --apple-id dev@example.com \
#     --team-id 1A2BC3D4E5 \
#     --type appstore

usage() {
  cat <<'USAGE'
Usage:
  P12_PASSWORD='...' ./scripts/ios/sync_apple_credentials_fastlane.sh \
    --bundle-id <com.example.app> \
    --apple-id <apple-id@email> \
    [--team-id <TEAM_ID>] \
    [--type appstore|adhoc|development] \
    [--output-dir credentials/ios] \
    [--keychain-path ~/Library/Keychains/login.keychain-db] \
    [--non-interactive]

Env:
  P12_PASSWORD      Required. Password used for exported .p12.
  FASTLANE_SESSION  Optional. Reuse authenticated fastlane session to avoid prompts.

Notes:
  - Apple does not let you download an existing private key for old certs.
    If private key is missing locally, this script creates/renews cert via fastlane.
USAGE
}

fail() {
  echo "❌ $*" >&2
  exit 1
}

info() {
  echo "[i] $*"
}

BUNDLE_ID=""
APPLE_ID=""
TEAM_ID=""
PROFILE_TYPE="appstore"
OUT_DIR="credentials/ios"
KEYCHAIN_PATH="${HOME}/Library/Keychains/login.keychain-db"
NON_INTERACTIVE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-id) BUNDLE_ID="${2:-}"; shift 2 ;;
    --apple-id) APPLE_ID="${2:-}"; shift 2 ;;
    --team-id) TEAM_ID="${2:-}"; shift 2 ;;
    --type) PROFILE_TYPE="${2:-}"; shift 2 ;;
    --output-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --keychain-path) KEYCHAIN_PATH="${2:-}"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ -n "$BUNDLE_ID" ]] || fail "Missing --bundle-id"
[[ -n "$APPLE_ID" ]] || fail "Missing --apple-id"
[[ -n "${P12_PASSWORD:-}" ]] || fail "Set P12_PASSWORD env var"

case "$PROFILE_TYPE" in
  appstore|adhoc|development) ;;
  *) fail "--type must be one of: appstore | adhoc | development" ;;
esac

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This script requires macOS (security/keychain tooling)."
fi

command -v fastlane >/dev/null 2>&1 || fail "fastlane not found. Install with: brew install fastlane"
command -v security >/dev/null 2>&1 || fail "security CLI missing"
command -v openssl >/dev/null 2>&1 || fail "openssl missing"
command -v node >/dev/null 2>&1 || fail "node missing"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR_ABS="$(cd "$PROJECT_ROOT" && mkdir -p "$OUT_DIR" && cd "$OUT_DIR" && pwd)"
P12_PATH="$OUT_DIR_ABS/dist-cert.p12"
PROFILE_PATH="$OUT_DIR_ABS/profile.mobileprovision"

info "Project root: $PROJECT_ROOT"
info "Bundle ID:    $BUNDLE_ID"
info "Apple ID:     $APPLE_ID"
info "Team ID:      ${TEAM_ID:-<auto>}"
info "Profile type: $PROFILE_TYPE"
info "Output dir:   $OUT_DIR_ABS"
info "Keychain:     $KEYCHAIN_PATH"

FASTLANE_COMMON=(--capture_output)
if [[ $NON_INTERACTIVE -eq 1 ]]; then
  FASTLANE_COMMON+=(--non-interactive)
fi

TEAM_ARGS=()
if [[ -n "$TEAM_ID" ]]; then
  TEAM_ARGS+=(team_id:"$TEAM_ID")
fi

CERT_TYPE_ARG="development:false"
if [[ "$PROFILE_TYPE" == "development" ]]; then
  CERT_TYPE_ARG="development:true"
fi

info "[1/4] Ensuring signing certificate via fastlane cert..."
fastlane run cert \
  username:"$APPLE_ID" \
  $CERT_TYPE_ARG \
  generate_apple_certs:true \
  keychain_path:"$KEYCHAIN_PATH" \
  "${TEAM_ARGS[@]}" \
  "${FASTLANE_COMMON[@]}"

info "[2/4] Discovering signing identity in keychain..."
IDENTITY_SHA1="$({ security find-identity -v -p codesigning "$KEYCHAIN_PATH" || true; } | awk '/Apple (Distribution|Development):/ {print $2; exit}')"
[[ -n "$IDENTITY_SHA1" ]] || fail "No Apple Distribution/Development identity found in $KEYCHAIN_PATH"

info "Found identity SHA1: $IDENTITY_SHA1"

TMP_DIR="$(mktemp -d /tmp/ios-cred-sync.XXXXXX)"
trap 'rm -rf "$TMP_DIR" 2>/dev/null || true' EXIT

CERT_PEM="$TMP_DIR/cert.pem"
KEY_PEM="$TMP_DIR/key.pem"

security find-certificate -Z -a -p "$KEYCHAIN_PATH" | awk -v target="$IDENTITY_SHA1" '
  BEGIN {want=0}
  /^SHA-1 hash:/ {gsub(/^SHA-1 hash: /, "", $0); gsub(/ /, "", $0); want=(toupper($0)==toupper(target)); next}
  want {print}
' > "$CERT_PEM"

[[ -s "$CERT_PEM" ]] || fail "Unable to extract certificate PEM for identity $IDENTITY_SHA1"

info "Exporting private key from keychain (may prompt for keychain access)..."
security export -k "$KEYCHAIN_PATH" -t priv -f pemseq -o "$KEY_PEM" >/dev/null 2>&1 || \
  fail "Could not export private key. Approve keychain prompt or ensure private key exists locally."

[[ -s "$KEY_PEM" ]] || fail "Private key export yielded empty file"

info "Building P12: $P12_PATH"
openssl pkcs12 -export \
  -inkey "$KEY_PEM" \
  -in "$CERT_PEM" \
  -name "Apple Signing" \
  -passout "pass:$P12_PASSWORD" \
  -out "$P12_PATH" >/dev/null 2>&1

[[ -f "$P12_PATH" ]] || fail "Failed to create $P12_PATH"

info "[3/4] Downloading provisioning profile via fastlane sigh..."
fastlane run sigh \
  username:"$APPLE_ID" \
  app_identifier:"$BUNDLE_ID" \
  adhoc:$([[ "$PROFILE_TYPE" == "adhoc" ]] && echo true || echo false) \
  development:$([[ "$PROFILE_TYPE" == "development" ]] && echo true || echo false) \
  skip_install:true \
  ignore_profiles_with_different_name:true \
  filename:"$(basename "$PROFILE_PATH")" \
  output_path:"$OUT_DIR_ABS" \
  "${TEAM_ARGS[@]}" \
  "${FASTLANE_COMMON[@]}"

[[ -f "$PROFILE_PATH" ]] || fail "Provisioning profile not found at: $PROFILE_PATH"

info "[4/4] Writing credentials.json..."
(
  cd "$PROJECT_ROOT"
  P12_PASSWORD="$P12_PASSWORD" node ./scripts/ios/write_credentials_local.mjs \
    --p12 "${OUT_DIR}/$(basename "$P12_PATH")" \
    --profile "${OUT_DIR}/$(basename "$PROFILE_PATH")" \
    --out credentials.json
)

info "Running P12 diagnosis..."
P12_PASSWORD="$P12_PASSWORD" "$PROJECT_ROOT/scripts/ios/diagnose_p12.sh" "$P12_PATH"

echo
echo "✅ iOS credentials synced."
echo "   P12:      $P12_PATH"
echo "   Profile:  $PROFILE_PATH"
echo "   JSON:     $PROJECT_ROOT/credentials.json"
