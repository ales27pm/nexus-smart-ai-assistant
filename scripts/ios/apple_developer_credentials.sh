#!/usr/bin/env bash
set -euo pipefail

#───────────────────────────────────────────────────────────────────────────────
# Apple Developer — Login & Auto Credential Management
#
# Authenticates with Apple Developer, then automatically:
#   1. Checks for existing distribution certificates (creates if missing)
#   2. Checks for existing provisioning profiles (creates/renews if needed)
#   3. Downloads certificate + profile to credentials/ios/
#   4. Exports a .p12 with the private key
#   5. Writes credentials.json for EAS local builds
#
# Auth methods:
#   A) App Store Connect API Key (recommended, non-interactive)
#   B) Apple ID + password (interactive 2FA prompt)
#
# Usage:
#   ./scripts/ios/apple_developer_credentials.sh              # interactive
#   ./scripts/ios/apple_developer_credentials.sh --api-key    # use saved API key
#   ./scripts/ios/apple_developer_credentials.sh --apple-id me@example.com
#───────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[i]${RESET} $*"; }
success() { echo -e "${GREEN}[✓]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*"; }
fail()    { echo -e "${RED}[✗]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}━━━ $* ━━━${RESET}\n"; }
divider() { echo -e "${DIM}────────────────────────────────────────────────${RESET}"; }

_GLOBAL_TMP_DIRS=()
_global_cleanup() {
  for d in "${_GLOBAL_TMP_DIRS[@]+"${_GLOBAL_TMP_DIRS[@]}"}"; do
    rm -rf "$d" 2>/dev/null || true
  done
}
trap '_global_cleanup' EXIT

resolve_bundle_id() {
  if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/app.json" ]]; then
    node -e "try { const c = JSON.parse(require('fs').readFileSync('$PROJECT_ROOT/app.json','utf8')); console.log(c.expo.ios.bundleIdentifier || c.expo.slug || ''); } catch(e) { console.log(''); }" 2>/dev/null
  fi
}

BUNDLE_ID_FROM_APP_JSON="$(resolve_bundle_id)"
BUNDLE_ID="${BUNDLE_ID_FROM_APP_JSON:-app.rork.smart-ai-assistant-slxh0fb}"
OUT_DIR="$PROJECT_ROOT/credentials/ios"
CREDS_JSON="$PROJECT_ROOT/credentials.json"
CONFIG_DIR="$PROJECT_ROOT/.apple-auth"
P12_PATH="$OUT_DIR/dist-cert.p12"
PROFILE_PATH="$OUT_DIR/profile.mobileprovision"
KEYCHAIN_PATH="${HOME}/Library/Keychains/login.keychain-db"

AUTH_MODE=""
APPLE_ID=""
TEAM_ID=""
PROFILE_TYPE="appstore"
API_KEY_ID=""
API_KEY_ISSUER=""
API_KEY_PATH=""
NON_INTERACTIVE=0
FORCE_RENEW=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/ios/apple_developer_credentials.sh [options]

Options:
  (no args)                   Interactive auth selection menu
  --api-key                   Use stored App Store Connect API Key
  --apple-id <email>          Authenticate with Apple ID
  --team-id <TEAM_ID>         Apple Developer Team ID
  --bundle-id <id>            Bundle identifier (default: from app.json)
  --type <appstore|adhoc|dev> Profile type (default: appstore)
  --force-renew               Force create new cert + profile even if valid
  --non-interactive           Skip all prompts (requires env vars or API key)

Environment Variables:
  P12_PASSWORD                Password for the exported .p12 (required)
  APPLE_ID                    Apple ID email
  FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD
                              App-specific password for Apple ID auth
  ASC_KEY_ID                  App Store Connect API Key ID
  ASC_ISSUER_ID               App Store Connect API Key Issuer ID
  ASC_KEY_PATH                Path to .p8 API key file
  TEAM_ID                     Apple Developer Team ID
EOF
}

check_prerequisites() {
  header "Prerequisites"
  local ok=true

  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "This script requires macOS."
    exit 1
  fi
  success "Running on macOS"

  for cmd in fastlane security openssl node; do
    if command -v "$cmd" >/dev/null 2>&1; then
      success "$cmd found"
    else
      fail "$cmd not found"
      ok=false
    fi
  done

  if [[ "$ok" != true ]]; then
    echo
    fail "Missing prerequisites. Install them and retry."
    echo -e "  ${DIM}fastlane: brew install fastlane${RESET}"
    exit 1
  fi
}

load_saved_config() {
  if [[ -f "$CONFIG_DIR/config" ]]; then
    source "$CONFIG_DIR/config" 2>/dev/null || true
  fi

  APPLE_ID="${APPLE_ID:-${SAVED_APPLE_ID:-}}"
  TEAM_ID="${TEAM_ID:-${SAVED_TEAM_ID:-${TEAM_ID:-}}}"
  API_KEY_ID="${API_KEY_ID:-${ASC_KEY_ID:-${SAVED_ASC_KEY_ID:-}}}"
  API_KEY_ISSUER="${API_KEY_ISSUER:-${ASC_ISSUER_ID:-${SAVED_ASC_ISSUER_ID:-}}}"
  API_KEY_PATH="${API_KEY_PATH:-${ASC_KEY_PATH:-${SAVED_ASC_KEY_PATH:-}}}"
}

save_config() {
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_DIR/config" <<CONF
SAVED_APPLE_ID="${APPLE_ID}"
SAVED_TEAM_ID="${TEAM_ID}"
SAVED_ASC_KEY_ID="${API_KEY_ID}"
SAVED_ASC_ISSUER_ID="${API_KEY_ISSUER}"
SAVED_ASC_KEY_PATH="${API_KEY_PATH}"
CONF
  chmod 600 "$CONFIG_DIR/config"

  if [[ -f "$PROJECT_ROOT/.gitignore" ]]; then
    if ! grep -q '\.apple-auth' "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
      echo ".apple-auth/" >> "$PROJECT_ROOT/.gitignore"
      info "Added .apple-auth/ to .gitignore"
    fi
  fi
}

prompt_auth_method() {
  echo
  echo -e "  ${BOLD}Select authentication method:${RESET}"
  echo
  echo -e "  ${CYAN}1${RESET}  App Store Connect API Key  ${DIM}(recommended, non-interactive)${RESET}"
  echo -e "  ${CYAN}2${RESET}  Apple ID + Password         ${DIM}(interactive, 2FA required)${RESET}"
  echo
  if [[ -n "$API_KEY_ID" && -n "$API_KEY_ISSUER" && -n "$API_KEY_PATH" ]]; then
    echo -e "  ${DIM}Saved API Key detected: $API_KEY_ID${RESET}"
  fi
  if [[ -n "$APPLE_ID" ]]; then
    echo -e "  ${DIM}Saved Apple ID: $APPLE_ID${RESET}"
  fi
  echo
  echo -ne "  ${BOLD}▸ Choose [1]:${RESET} "
  read -r choice
  case "${choice:-1}" in
    1) AUTH_MODE="api-key" ;;
    2) AUTH_MODE="apple-id" ;;
    *) warn "Invalid choice. Using API Key."; AUTH_MODE="api-key" ;;
  esac
}

setup_api_key_auth() {
  header "App Store Connect API Key Setup"

  if [[ -n "$API_KEY_ID" && -n "$API_KEY_ISSUER" && -f "${API_KEY_PATH:-/nonexistent}" ]]; then
    info "Using saved API Key configuration:"
    info "  Key ID:    $API_KEY_ID"
    info "  Issuer ID: $API_KEY_ISSUER"
    info "  Key File:  $API_KEY_PATH"
    echo
    echo -ne "  ${BOLD}Use these? [Y/n]:${RESET} "
    read -r confirm
    if [[ "${confirm:-Y}" =~ ^[Yy]$ ]]; then
      return 0
    fi
  fi

  echo -e "  ${DIM}Create an API key at: https://appstoreconnect.apple.com/access/integrations/api${RESET}"
  echo -e "  ${DIM}Required role: App Manager or Admin${RESET}"
  echo

  echo -ne "  ${BOLD}Key ID:${RESET} "
  read -r API_KEY_ID
  [[ -n "$API_KEY_ID" ]] || { fail "Key ID is required."; return 1; }

  echo -ne "  ${BOLD}Issuer ID:${RESET} "
  read -r API_KEY_ISSUER
  [[ -n "$API_KEY_ISSUER" ]] || { fail "Issuer ID is required."; return 1; }

  echo -ne "  ${BOLD}Path to .p8 key file:${RESET} "
  read -r API_KEY_PATH
  API_KEY_PATH="$(eval echo "$API_KEY_PATH")"
  if [[ ! -f "$API_KEY_PATH" ]]; then
    fail "Key file not found: $API_KEY_PATH"
    return 1
  fi

  mkdir -p "$CONFIG_DIR/keys"
  local key_dest="$CONFIG_DIR/keys/AuthKey_${API_KEY_ID}.p8"
  if [[ "$API_KEY_PATH" != "$key_dest" ]]; then
    cp "$API_KEY_PATH" "$key_dest"
    chmod 600 "$key_dest"
    API_KEY_PATH="$key_dest"
    info "Key copied to: $key_dest"
  fi

  success "API Key configured."
}

setup_apple_id_auth() {
  header "Apple ID Authentication"

  if [[ -n "$APPLE_ID" ]]; then
    echo -ne "  ${BOLD}Apple ID [${APPLE_ID}]:${RESET} "
    read -r input
    APPLE_ID="${input:-$APPLE_ID}"
  else
    echo -ne "  ${BOLD}Apple ID (email):${RESET} "
    read -r APPLE_ID
  fi
  [[ -n "$APPLE_ID" ]] || { fail "Apple ID is required."; return 1; }

  if [[ -z "${FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD:-}" ]]; then
    echo
    echo -e "  ${DIM}An app-specific password is required for 2FA accounts.${RESET}"
    echo -e "  ${DIM}Create one at: https://appleid.apple.com/account/manage${RESET}"
    echo
    echo -ne "  ${BOLD}App-specific password:${RESET} "
    read -rs app_pass
    echo
    if [[ -n "$app_pass" ]]; then
      export FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD="$app_pass"
    fi
  fi

  success "Apple ID configured: $APPLE_ID"
}

prompt_team_id() {
  if [[ -n "$TEAM_ID" ]]; then
    echo -ne "  ${BOLD}Team ID [${TEAM_ID}]:${RESET} "
    read -r input
    TEAM_ID="${input:-$TEAM_ID}"
  else
    echo -ne "  ${BOLD}Team ID (found at https://developer.apple.com/account):${RESET} "
    read -r TEAM_ID
  fi
}

prompt_p12_password() {
  if [[ -n "${P12_PASSWORD:-}" ]]; then
    info "P12_PASSWORD already set in environment."
    return 0
  fi

  echo
  echo -ne "  ${BOLD}P12 export password (min 1 char):${RESET} "
  read -rs P12_PASSWORD
  echo
  if [[ -z "$P12_PASSWORD" || ${#P12_PASSWORD} -lt 1 ]]; then
    fail "P12 password is required (must be at least 1 character)."
    return 1
  fi
  export P12_PASSWORD
}

list_existing_certificates() {
  header "Checking Existing Certificates"

  local CERT_TYPE_ARG="development:false"
  if [[ "$PROFILE_TYPE" == "development" ]]; then
    CERT_TYPE_ARG="development:true"
  fi

  info "Searching keychain for signing identities..."

  local IDENTITIES_TXT
  IDENTITIES_TXT="$(mktemp)"
  security find-identity -v -p codesigning "$KEYCHAIN_PATH" > "$IDENTITIES_TXT" 2>/dev/null || true

  local IDENTITY_LABEL="Apple Distribution:"
  if [[ "$PROFILE_TYPE" == "development" ]]; then
    IDENTITY_LABEL="Apple Development:"
  fi

  local count=0
  local identities=()

  while IFS= read -r line; do
    if [[ "$line" == *"$IDENTITY_LABEL"* ]]; then
      count=$((count + 1))
      identities+=("$line")
      echo -e "  ${GREEN}$count)${RESET} $line"
    fi
  done < "$IDENTITIES_TXT"
  rm -f "$IDENTITIES_TXT"

  if [[ $count -eq 0 ]]; then
    warn "No ${IDENTITY_LABEL} identities found in keychain."
    return 1
  fi

  echo
  success "Found $count signing ${IDENTITY_LABEL} identity(ies)."
  return 0
}

ensure_certificate() {
  header "Ensuring Distribution Certificate"

  local CERT_TYPE_ARG="development:false"
  if [[ "$PROFILE_TYPE" == "development" ]]; then
    CERT_TYPE_ARG="development:true"
  fi

  local FL_ARGS=()
  FL_ARGS+=("$CERT_TYPE_ARG")
  FL_ARGS+=(generate_apple_certs:true)
  FL_ARGS+=(keychain_path:"$KEYCHAIN_PATH")

  if [[ -n "$TEAM_ID" ]]; then
    FL_ARGS+=(team_id:"$TEAM_ID")
  fi

  if [[ "$AUTH_MODE" == "api-key" ]]; then
    export APP_STORE_CONNECT_API_KEY_KEY_ID="$API_KEY_ID"
    export APP_STORE_CONNECT_API_KEY_ISSUER_ID="$API_KEY_ISSUER"
    export APP_STORE_CONNECT_API_KEY_KEY_FILEPATH="$API_KEY_PATH"
    export APP_STORE_CONNECT_API_KEY_IS_KEY_CONTENT_BASE64="false"
  else
    FL_ARGS+=(username:"$APPLE_ID")
  fi

  info "Running fastlane cert (will create if none exists)..."
  if fastlane run cert "${FL_ARGS[@]}"; then
    success "Distribution certificate ensured."
  else
    fail "fastlane cert failed."
    echo
    echo -e "  ${DIM}Common fixes:${RESET}"
    echo -e "  ${DIM}  - Revoke expired certs at developer.apple.com${RESET}"
    echo -e "  ${DIM}  - Ensure your account has the right permissions${RESET}"
    echo -e "  ${DIM}  - Check if you've hit the certificate limit (max 3)${RESET}"
    return 1
  fi
}

export_p12() {
  header "Exporting .p12 Certificate"

  local TMP_DIR
  TMP_DIR="$(mktemp -d /tmp/apple-cred-export.XXXXXX)"
  chmod 700 "$TMP_DIR"
  _GLOBAL_TMP_DIRS+=("$TMP_DIR")
  local TMP_DIR_ESCAPED
  printf -v TMP_DIR_ESCAPED '%q' "$TMP_DIR"
  trap "rm -rf ${TMP_DIR_ESCAPED} 2>/dev/null || true" RETURN

  local CERT_PEM="$TMP_DIR/cert.pem"
  local ALL_KEYS_PEM="$TMP_DIR/all-keys.pem"
  local MATCH_KEY_PEM="$TMP_DIR/matching-key.pem"
  local DIRECT_P12_PATH="$TMP_DIR/direct-export.p12"
  local IDENTITIES_TXT="$TMP_DIR/identities.txt"

  local IDENTITY_LABEL="Apple Distribution:"
  if [[ "$PROFILE_TYPE" == "development" ]]; then
    IDENTITY_LABEL="Apple Development:"
  fi

  security find-identity -v -p codesigning "$KEYCHAIN_PATH" > "$IDENTITIES_TXT" 2>/dev/null || true

  local IDENTITY_SHA1=""
  while read -r sha; do
    [[ -n "$sha" ]] || continue
    security find-certificate -Z -a -p "$KEYCHAIN_PATH" | awk -v target="$sha" '
      BEGIN {want=0}
      /^SHA-1 hash:/ {gsub(/^SHA-1 hash: /, "", $0); gsub(/ /, "", $0); want=(toupper($0)==toupper(target)); next}
      want {print}
    ' > "$CERT_PEM"

    [[ -s "$CERT_PEM" ]] || continue

    local subject
    subject="$(openssl x509 -in "$CERT_PEM" -noout -subject 2>/dev/null || true)"
    [[ "$subject" == *"$IDENTITY_LABEL"* ]] || continue

    if [[ -n "$TEAM_ID" ]]; then
      [[ "$subject" == *"OU = $TEAM_ID"* || "$subject" == *"OU=$TEAM_ID"* ]] || continue
    fi

    IDENTITY_SHA1="$sha"
    break
  done < <(awk '/Apple (Distribution|Development):/ {print $2}' "$IDENTITIES_TXT")

  if [[ -z "$IDENTITY_SHA1" ]]; then
    fail "No matching signing identity found in keychain."
    echo -e "  ${DIM}Label: $IDENTITY_LABEL  Team: ${TEAM_ID:-any}${RESET}"
    return 1
  fi

  info "Selected identity: $IDENTITY_SHA1"

  security find-certificate -Z -a -p "$KEYCHAIN_PATH" | awk -v target="$IDENTITY_SHA1" '
    BEGIN {want=0}
    /^SHA-1 hash:/ {gsub(/^SHA-1 hash: /, "", $0); gsub(/ /, "", $0); want=(toupper($0)==toupper(target)); next}
    want {print}
  ' > "$CERT_PEM"
  [[ -s "$CERT_PEM" ]] || { fail "Unable to extract certificate PEM."; return 1; }

  local cert_pub_hash
  cert_pub_hash="$(openssl x509 -in "$CERT_PEM" -pubkey -noout | openssl pkey -pubin -outform DER | shasum -a 256 | awk '{print $1}')"
  [[ -n "$cert_pub_hash" ]] || { fail "Failed computing cert public key fingerprint."; return 1; }

  info "Exporting private keys from keychain (you may need to approve a prompt)..."
  if ! security export -k "$KEYCHAIN_PATH" -t priv -f pemseq -o "$ALL_KEYS_PEM" >/dev/null 2>&1; then
    warn "Could not export raw private keys. Trying direct identity export fallback..."
    if ! security export -k "$KEYCHAIN_PATH" -t identities -f pkcs12 -P "$P12_PASSWORD" -o "$DIRECT_P12_PATH" >/dev/null 2>&1; then
      fail "Could not export private keys from keychain."
      echo -e "  ${DIM}Possible causes:${RESET}"
      echo -e "  ${DIM}  - Keychain is locked (unlock with: security unlock-keychain ~/Library/Keychains/login.keychain-db)${RESET}"
      echo -e "  ${DIM}  - Keychain access prompt was denied${RESET}"
      echo -e "  ${DIM}  - Private key does not exist in keychain${RESET}"
      return 1
    fi

    local direct_verify
    direct_verify="$(openssl pkcs12 -in "$DIRECT_P12_PATH" -passin env:P12_PASSWORD -clcerts -nokeys 2>/dev/null | openssl x509 -pubkey -noout 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
    if [[ "$direct_verify" != "$cert_pub_hash" ]]; then
      fail "Fallback P12 export succeeded, but certificate does not match selected identity $IDENTITY_SHA1."
      echo -e "  ${DIM}Try removing unrelated identities or set TEAM_ID to narrow identity selection.${RESET}"
      return 1
    fi

    mkdir -p "$OUT_DIR"
    cp "$DIRECT_P12_PATH" "$P12_PATH"
    success "P12 exported via identity fallback: $P12_PATH"

    local cert_subject cert_dates
    cert_subject="$(openssl x509 -in "$CERT_PEM" -noout -subject 2>/dev/null || true)"
    cert_dates="$(openssl x509 -in "$CERT_PEM" -noout -dates 2>/dev/null || true)"
    echo -e "  ${DIM}$cert_subject${RESET}"
    echo -e "  ${DIM}$cert_dates${RESET}"
    return 0
  fi
  [[ -s "$ALL_KEYS_PEM" ]] || { fail "Private key export yielded empty file."; return 1; }

  export TMP_DIR
  awk '
    /-----BEGIN .*PRIVATE KEY-----/ {in_key=1; file=sprintf("%s/key_%04d.pem", ENVIRON["TMP_DIR"], ++n); print > file; next}
    /-----END .*PRIVATE KEY-----/   {if (in_key) {print >> file; close(file)}; in_key=0; next}
    in_key {print >> file}
  ' "$ALL_KEYS_PEM"

  local found_key=false
  for key_file in "$TMP_DIR"/key_*.pem; do
    [[ -f "$key_file" ]] || continue
    local key_pub_hash
    key_pub_hash="$(openssl pkey -in "$key_file" -pubout -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
    if [[ "$key_pub_hash" == "$cert_pub_hash" ]]; then
      cp "$key_file" "$MATCH_KEY_PEM"
      found_key=true
      break
    fi
  done

  if [[ "$found_key" != true ]]; then
    fail "Could not find private key matching certificate $IDENTITY_SHA1."
    echo -e "  ${DIM}The private key must be in your login keychain.${RESET}"
    echo -e "  ${DIM}If you created the cert on another Mac, export the key from there.${RESET}"
    return 1
  fi

  mkdir -p "$OUT_DIR"
  openssl pkcs12 -export \
    -inkey "$MATCH_KEY_PEM" \
    -in "$CERT_PEM" \
    -name "Apple Signing" \
    -passout env:P12_PASSWORD \
    -out "$P12_PATH" >/dev/null 2>&1

  [[ -f "$P12_PATH" ]] || { fail "Failed to create .p12 file."; return 1; }

  local p12_verify
  p12_verify="$(openssl pkcs12 -in "$P12_PATH" -passin env:P12_PASSWORD -clcerts -nokeys 2>/dev/null | openssl x509 -pubkey -noout 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
  if [[ "$p12_verify" != "$cert_pub_hash" ]]; then
    fail "P12 verification failed — certificate mismatch."
    return 1
  fi

  success "P12 exported: $P12_PATH"

  local cert_subject cert_dates
  cert_subject="$(openssl x509 -in "$CERT_PEM" -noout -subject 2>/dev/null || true)"
  cert_dates="$(openssl x509 -in "$CERT_PEM" -noout -dates 2>/dev/null || true)"
  echo -e "  ${DIM}$cert_subject${RESET}"
  echo -e "  ${DIM}$cert_dates${RESET}"
}

download_provisioning_profile() {
  header "Downloading Provisioning Profile"

  local ADHOC_VAL="false"
  local DEV_VAL="false"
  [[ "$PROFILE_TYPE" == "adhoc" ]] && ADHOC_VAL="true"
  [[ "$PROFILE_TYPE" == "development" ]] && DEV_VAL="true"

  mkdir -p "$OUT_DIR"

  local FL_ARGS=()
  FL_ARGS+=(app_identifier:"$BUNDLE_ID")
  FL_ARGS+=("adhoc:$ADHOC_VAL")
  FL_ARGS+=("development:$DEV_VAL")
  FL_ARGS+=(skip_install:true)
  FL_ARGS+=(ignore_profiles_with_different_name:true)
  FL_ARGS+=(filename:"$(basename "$PROFILE_PATH")")
  FL_ARGS+=(output_path:"$OUT_DIR")

  if [[ -n "$TEAM_ID" ]]; then
    FL_ARGS+=(team_id:"$TEAM_ID")
  fi

  if [[ "$AUTH_MODE" == "api-key" ]]; then
    export APP_STORE_CONNECT_API_KEY_KEY_ID="$API_KEY_ID"
    export APP_STORE_CONNECT_API_KEY_ISSUER_ID="$API_KEY_ISSUER"
    export APP_STORE_CONNECT_API_KEY_KEY_FILEPATH="$API_KEY_PATH"
    export APP_STORE_CONNECT_API_KEY_IS_KEY_CONTENT_BASE64="false"
  else
    FL_ARGS+=(username:"$APPLE_ID")
  fi

  if [[ "$FORCE_RENEW" -eq 1 ]]; then
    FL_ARGS+=(force:true)
    info "Force-renewing provisioning profile..."
  fi

  info "Running fastlane sigh..."
  info "  Bundle ID: $BUNDLE_ID"
  info "  Type: $PROFILE_TYPE"

  if fastlane run sigh "${FL_ARGS[@]}"; then
    [[ -f "$PROFILE_PATH" ]] || { fail "Profile not found after download."; return 1; }
    success "Provisioning profile downloaded: $PROFILE_PATH"
  else
    fail "fastlane sigh failed."
    echo
    echo -e "  ${DIM}Common fixes:${RESET}"
    echo -e "  ${DIM}  - Register bundle ID at developer.apple.com/account/resources${RESET}"
    echo -e "  ${DIM}  - Ensure your account has provisioning profile permissions${RESET}"
    echo -e "  ${DIM}  - If expired, use --force-renew to regenerate${RESET}"
    return 1
  fi
}

escape_json_string() {
  local input="$1"
  input="${input//\\/\\\\}"
  input="${input//\"/\\\"}"
  printf '%s' "$input"
}

write_credentials_json() {
  header "Writing credentials.json"

  local rel_p12 rel_profile
  rel_p12="$(python3 -c "import os.path; print(os.path.relpath('$P12_PATH', '$PROJECT_ROOT'))" 2>/dev/null || echo "$P12_PATH")"
  rel_profile="$(python3 -c "import os.path; print(os.path.relpath('$PROFILE_PATH', '$PROJECT_ROOT'))" 2>/dev/null || echo "$PROFILE_PATH")"

  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg profile "$rel_profile" \
      --arg p12 "$rel_p12" \
      --arg pass "$P12_PASSWORD" \
      '{
        ios: {
          provisioningProfilePath: $profile,
          distributionCertificate: {
            path: $p12,
            password: $pass
          }
        }
      }' > "$CREDS_JSON"
  else
    local escaped_password
    escaped_password="$(escape_json_string "$P12_PASSWORD")"

    cat > "$CREDS_JSON" <<JSON
{
  "ios": {
    "provisioningProfilePath": "$rel_profile",
    "distributionCertificate": {
      "path": "$rel_p12",
      "password": "$escaped_password"
    }
  }
}
JSON
  fi

  success "credentials.json written."
  warn "credentials.json contains sensitive data — do NOT commit it to version control."
  if [[ -f "$PROJECT_ROOT/.gitignore" ]]; then
    if ! grep -q 'credentials\.json' "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
      echo "credentials.json" >> "$PROJECT_ROOT/.gitignore"
      info "Added credentials.json to .gitignore"
    fi
  fi
  info "  provisioningProfilePath: $rel_profile"
  info "  distributionCertificate.path: $rel_p12"
}

validate_credentials() {
  header "Validating Credentials"

  if [[ ! -f "$P12_PATH" ]]; then
    fail "P12 file missing: $P12_PATH"
    return 1
  fi
  if [[ ! -f "$PROFILE_PATH" ]]; then
    fail "Profile missing: $PROFILE_PATH"
    return 1
  fi
  if [[ ! -f "$CREDS_JSON" ]]; then
    fail "credentials.json missing."
    return 1
  fi

  info "Validating P12 in temp keychain..."
  local TMP_DIR
  TMP_DIR="$(mktemp -d /tmp/cred-validate.XXXXXX)"
  chmod 700 "$TMP_DIR"
  _GLOBAL_TMP_DIRS+=("$TMP_DIR")
  local KC_PATH="$TMP_DIR/validate.keychain-db"
  local KC_PASS="val-$(date +%s)-$RANDOM"

  security create-keychain -p "$KC_PASS" "$KC_PATH" >/dev/null 2>&1
  security set-keychain-settings -lut 21600 "$KC_PATH" >/dev/null 2>&1
  security unlock-keychain -p "$KC_PASS" "$KC_PATH" >/dev/null 2>&1

  security import "$P12_PATH" -k "$KC_PATH" -P "$P12_PASSWORD" -A \
    -T /usr/bin/codesign -T /usr/bin/security >/dev/null 2>&1

  local ident_out
  ident_out="$(security find-identity -p codesigning -v "$KC_PATH" 2>&1 || true)"

  if echo "$ident_out" | grep -q '[1-9][0-9]* valid identit'; then
    success "P12 imports correctly — signing identity detected."
  else
    local wwdr_cer="$TMP_DIR/AppleWWDRCAG3.cer"
    curl -fsSL "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer" -o "$wwdr_cer" 2>/dev/null || true
    if [[ -f "$wwdr_cer" ]]; then
      security import "$wwdr_cer" -k "$KC_PATH" -A >/dev/null 2>&1 || true
    fi
    ident_out="$(security find-identity -p codesigning -v "$KC_PATH" 2>&1 || true)"

    if echo "$ident_out" | grep -q '[1-9][0-9]* valid identit'; then
      success "P12 valid (after importing WWDR intermediate)."
      warn "You may need to install AppleWWDRCAG3.cer in your login keychain."
    else
      fail "P12 imported but no valid signing identity found."
      echo -e "  ${DIM}$ident_out${RESET}"
      security delete-keychain "$KC_PATH" 2>/dev/null || true
      rm -rf "$TMP_DIR" 2>/dev/null || true
      return 1
    fi
  fi

  security delete-keychain "$KC_PATH" 2>/dev/null || true
  rm -rf "$TMP_DIR" 2>/dev/null || true
  return 0
}

show_summary() {
  header "Summary"
  echo -e "  ${GREEN}P12:${RESET}              $P12_PATH"
  echo -e "  ${GREEN}Profile:${RESET}          $PROFILE_PATH"
  echo -e "  ${GREEN}credentials.json:${RESET} $CREDS_JSON"
  echo -e "  ${GREEN}Auth mode:${RESET}        $AUTH_MODE"
  echo -e "  ${GREEN}Bundle ID:${RESET}        $BUNDLE_ID"
  echo -e "  ${GREEN}Team ID:${RESET}          ${TEAM_ID:-auto}"
  echo -e "  ${GREEN}Profile type:${RESET}     $PROFILE_TYPE"
  echo
  echo -e "  ${BOLD}${GREEN}All credentials are ready for EAS local build.${RESET}"
  echo
  echo -e "  ${DIM}Next: ./scripts/workflow.sh --step build${RESET}"
}

show_credential_menu() {
  echo
  echo -e "  ${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
  echo -e "  ${BOLD}║   ${CYAN}Apple Developer${RESET}${BOLD} — Credential Manager           ║${RESET}"
  echo -e "  ${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
  echo
  echo -e "  ${BOLD}Actions${RESET}"
  echo -e "  ${CYAN}1${RESET}  Full auto-setup     ${DIM}(login → cert → profile → export)${RESET}"
  echo -e "  ${CYAN}2${RESET}  List certificates   ${DIM}(show keychain identities)${RESET}"
  echo -e "  ${CYAN}3${RESET}  Create/renew cert   ${DIM}(via fastlane cert)${RESET}"
  echo -e "  ${CYAN}4${RESET}  Download profile    ${DIM}(via fastlane sigh)${RESET}"
  echo -e "  ${CYAN}5${RESET}  Export .p12          ${DIM}(from keychain → file)${RESET}"
  echo -e "  ${CYAN}6${RESET}  Write credentials.json"
  echo -e "  ${CYAN}7${RESET}  Validate all        ${DIM}(test P12 in temp keychain)${RESET}"
  echo -e "  ${CYAN}8${RESET}  Force renew all     ${DIM}(new cert + profile, overwrite)${RESET}"
  echo
  echo -e "  ${BOLD}Settings${RESET}"
  echo -e "  ${CYAN}a${RESET}  Change auth method  ${DIM}[current: ${AUTH_MODE:-not set}]${RESET}"
  echo -e "  ${CYAN}b${RESET}  Change bundle ID    ${DIM}[current: $BUNDLE_ID]${RESET}"
  echo -e "  ${CYAN}t${RESET}  Change profile type ${DIM}[current: $PROFILE_TYPE]${RESET}"
  echo
  echo -e "  ${CYAN}q${RESET}  Back / Quit"
  echo
  echo -ne "  ${BOLD}▸ Choose:${RESET} "
}

do_full_auto_setup() {
  if [[ -z "$AUTH_MODE" ]]; then
    prompt_auth_method
  fi

  if [[ "$AUTH_MODE" == "api-key" ]]; then
    setup_api_key_auth || return 1
  else
    setup_apple_id_auth || return 1
  fi

  if [[ -z "$TEAM_ID" ]]; then
    prompt_team_id
  fi

  prompt_p12_password || return 1

  save_config

  ensure_certificate || return 1
  export_p12 || return 1
  download_provisioning_profile || return 1
  write_credentials_json
  validate_credentials || return 1
  show_summary
}

run_interactive() {
  check_prerequisites
  load_saved_config

  while true; do
    show_credential_menu
    read -r choice
    echo
    case "$choice" in
      1) do_full_auto_setup ;;
      2) list_existing_certificates ;;
      3)
        if [[ -z "$AUTH_MODE" ]]; then prompt_auth_method; fi
        if [[ "$AUTH_MODE" == "api-key" ]]; then setup_api_key_auth; else setup_apple_id_auth; fi
        if [[ -z "$TEAM_ID" ]]; then prompt_team_id; fi
        save_config
        ensure_certificate
        ;;
      4)
        if [[ -z "$AUTH_MODE" ]]; then prompt_auth_method; fi
        if [[ "$AUTH_MODE" == "api-key" ]]; then setup_api_key_auth; else setup_apple_id_auth; fi
        if [[ -z "$TEAM_ID" ]]; then prompt_team_id; fi
        save_config
        download_provisioning_profile
        ;;
      5)
        prompt_p12_password || continue
        if [[ -z "$TEAM_ID" ]]; then prompt_team_id; fi
        export_p12
        ;;
      6)
        if [[ -z "${P12_PASSWORD:-}" ]]; then prompt_p12_password || continue; fi
        write_credentials_json
        ;;
      7) validate_credentials ;;
      8)
        FORCE_RENEW=1
        do_full_auto_setup
        FORCE_RENEW=0
        ;;
      a) AUTH_MODE=""; prompt_auth_method
         if [[ "$AUTH_MODE" == "api-key" ]]; then setup_api_key_auth; else setup_apple_id_auth; fi
         save_config
         ;;
      b)
        echo -ne "  ${BOLD}Bundle ID [$BUNDLE_ID]:${RESET} "
        read -r input
        BUNDLE_ID="${input:-$BUNDLE_ID}"
        success "Bundle ID set to: $BUNDLE_ID"
        ;;
      t)
        echo -e "  ${CYAN}1${RESET}  appstore"
        echo -e "  ${CYAN}2${RESET}  adhoc"
        echo -e "  ${CYAN}3${RESET}  development"
        echo -ne "  ${BOLD}▸ Choose [1]:${RESET} "
        read -r pt
        case "${pt:-1}" in
          1) PROFILE_TYPE="appstore" ;;
          2) PROFILE_TYPE="adhoc" ;;
          3) PROFILE_TYPE="development" ;;
        esac
        success "Profile type: $PROFILE_TYPE"
        ;;
      q) return 0 ;;
      *) warn "Unknown option: $choice" ;;
    esac
    echo
    echo -ne "  ${DIM}Press Enter to continue...${RESET}"
    read -r
  done
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --api-key) AUTH_MODE="api-key"; shift ;;
      --apple-id) AUTH_MODE="apple-id"; APPLE_ID="${2:-}"; shift 2 ;;
      --team-id) TEAM_ID="${2:-}"; shift 2 ;;
      --bundle-id) BUNDLE_ID="${2:-}"; shift 2 ;;
      --type) PROFILE_TYPE="${2:-}"; shift 2 ;;
      --force-renew) FORCE_RENEW=1; shift ;;
      --non-interactive) NON_INTERACTIVE=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fail "Unknown argument: $1"; usage; exit 1 ;;
    esac
  done
}

main() {
  parse_args "$@"
  load_saved_config

  if [[ $NON_INTERACTIVE -eq 1 || -n "$AUTH_MODE" ]]; then
    check_prerequisites

    if [[ -z "$AUTH_MODE" ]]; then
      if [[ -n "$API_KEY_ID" && -n "$API_KEY_ISSUER" && -n "$API_KEY_PATH" ]]; then
        AUTH_MODE="api-key"
      elif [[ -n "$APPLE_ID" ]]; then
        AUTH_MODE="apple-id"
      else
        fail "No auth method specified. Use --api-key or --apple-id <email>"
        exit 1
      fi
    fi

    if [[ "$AUTH_MODE" == "api-key" ]]; then
      if [[ -z "$API_KEY_ID" || -z "$API_KEY_ISSUER" || -z "$API_KEY_PATH" ]]; then
        fail "API Key auth requires ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH env vars."
        exit 1
      fi
    fi

    prompt_p12_password || exit 1
    save_config

    ensure_certificate || exit 1
    export_p12 || exit 1
    download_provisioning_profile || exit 1
    write_credentials_json
    validate_credentials || exit 1
    show_summary
  else
    run_interactive
  fi
}

main "$@"
