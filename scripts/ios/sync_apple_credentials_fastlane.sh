#!/usr/bin/env bash
set -euo pipefail

# Automate iOS local credential sync (Apple Developer -> local files) using fastlane.
#
# What this does:
#   1) Ensures an Apple Distribution/Development certificate exists (via fastlane cert)
#   2) Selects a matching identity from the chosen keychain (optionally constrained by TEAM_ID)
#   3) Exports the matching cert + private key to a .p12 (key matched by public key fingerprint)
#   4) Downloads a provisioning profile for a bundle id via fastlane sigh
#   5) Writes credentials.json for Expo local credentials

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

[[ "$(uname -s)" == "Darwin" ]] || fail "This script requires macOS (security/keychain tooling)."

command -v fastlane >/dev/null 2>&1 || fail "fastlane not found. Install with: brew install fastlane"
command -v security >/dev/null 2>&1 || fail "security CLI missing"
command -v openssl >/dev/null 2>&1 || fail "openssl missing"
command -v node >/dev/null 2>&1 || fail "node missing"
command -v shasum >/dev/null 2>&1 || fail "shasum missing"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR_ABS="$(cd "$PROJECT_ROOT" && mkdir -p "$OUT_DIR" && cd "$OUT_DIR" && pwd)"
P12_PATH="$OUT_DIR_ABS/dist-cert.p12"
PROFILE_PATH="$OUT_DIR_ABS/profile.mobileprovision"

TMP_DIR="$(mktemp -d /tmp/ios-cred-sync.XXXXXX)"
trap 'rm -rf "$TMP_DIR" 2>/dev/null || true' EXIT

CERT_PEM="$TMP_DIR/cert.pem"
ALL_KEYS_PEM="$TMP_DIR/all-keys.pem"
MATCH_KEY_PEM="$TMP_DIR/matching-key.pem"
IDENTITIES_TXT="$TMP_DIR/identities.txt"

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
IDENTITY_LABEL="Apple Distribution:"
if [[ "$PROFILE_TYPE" == "development" ]]; then
  CERT_TYPE_ARG="development:true"
  IDENTITY_LABEL="Apple Development:"
fi

info "[1/4] Ensuring signing certificate via fastlane cert..."
fastlane run cert \
  username:"$APPLE_ID" \
  $CERT_TYPE_ARG \
  generate_apple_certs:true \
  keychain_path:"$KEYCHAIN_PATH" \
  "${TEAM_ARGS[@]}" \
  "${FASTLANE_COMMON[@]}"

info "[2/4] Selecting signing identity from keychain..."
security find-identity -v -p codesigning "$KEYCHAIN_PATH" >"$IDENTITIES_TXT" 2>/dev/null || true

IDENTITY_SHA1=""
while read -r sha; do
  [[ -n "$sha" ]] || continue
  security find-certificate -Z -a -p "$KEYCHAIN_PATH" | awk -v target="$sha" '
    BEGIN {want=0}
    /^SHA-1 hash:/ {gsub(/^SHA-1 hash: /, "", $0); gsub(/ /, "", $0); want=(toupper($0)==toupper(target)); next}
    want {print}
  ' >"$CERT_PEM"

  [[ -s "$CERT_PEM" ]] || continue

  subject="$(openssl x509 -in "$CERT_PEM" -noout -subject 2>/dev/null || true)"
  [[ "$subject" == *"$IDENTITY_LABEL"* ]] || continue

  if [[ -n "$TEAM_ID" ]]; then
    [[ "$subject" == *"OU = $TEAM_ID"* || "$subject" == *"OU=$TEAM_ID"* ]] || continue
  fi

  IDENTITY_SHA1="$sha"
  break
done < <(awk '/Apple (Distribution|Development):/ {print $2}' "$IDENTITIES_TXT")

[[ -n "$IDENTITY_SHA1" ]] || fail "No matching identity found in $KEYCHAIN_PATH (label=$IDENTITY_LABEL team=${TEAM_ID:-any})"
info "Selected identity SHA1: $IDENTITY_SHA1"

# re-extract selected cert pem for downstream usage
security find-certificate -Z -a -p "$KEYCHAIN_PATH" | awk -v target="$IDENTITY_SHA1" '
  BEGIN {want=0}
  /^SHA-1 hash:/ {gsub(/^SHA-1 hash: /, "", $0); gsub(/ /, "", $0); want=(toupper($0)==toupper(target)); next}
  want {print}
' >"$CERT_PEM"
[[ -s "$CERT_PEM" ]] || fail "Unable to extract certificate PEM for identity $IDENTITY_SHA1"

info "Exporting private keys from keychain for matching..."
security export -k "$KEYCHAIN_PATH" -t priv -f pemseq -o "$ALL_KEYS_PEM" >/dev/null 2>&1 || \
  fail "Could not export private keys. Approve keychain prompt or ensure private key exists locally."
[[ -s "$ALL_KEYS_PEM" ]] || fail "Private key export yielded empty file"

cert_pub_hash="$(openssl x509 -in "$CERT_PEM" -pubkey -noout | openssl pkey -pubin -outform DER | shasum -a 256 | awk '{print $1}')"
[[ -n "$cert_pub_hash" ]] || fail "Failed computing certificate public key fingerprint"

awk '
  /-----BEGIN PRIVATE KEY-----/ {in_key=1; file=sprintf("%s/key_%04d.pem", ENVIRON["TMP_DIR"], ++n); print > file; next}
  /-----END PRIVATE KEY-----/   {if (in_key) {print >> file; close(file)}; in_key=0; next}
  in_key {print >> file}
' "$ALL_KEYS_PEM"

for key_file in "$TMP_DIR"/key_*.pem; do
  [[ -f "$key_file" ]] || continue
  key_pub_hash="$(openssl pkey -in "$key_file" -pubout -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
  if [[ "$key_pub_hash" == "$cert_pub_hash" ]]; then
    cp "$key_file" "$MATCH_KEY_PEM"
    break
  fi
done

[[ -s "$MATCH_KEY_PEM" ]] || fail "Could not find private key matching selected certificate $IDENTITY_SHA1"

info "Building P12: $P12_PATH"
openssl pkcs12 -export \
  -inkey "$MATCH_KEY_PEM" \
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
