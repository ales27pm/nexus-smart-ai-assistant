#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Reset (delete + recreate) a local macOS signing keychain with a known password.

Usage:
  ./scripts/reset-ios-signing-keychain.sh [--name <keychain-name>] [--password <password>] [--set-default]

Options:
  --name <keychain-name>  Keychain name without extension. Default: build-signing
  --password <password>   Keychain password. If omitted, reads KEYCHAIN_PASSWORD,
                          BUILD_SIGNING_KEYCHAIN_PASSWORD, or MATCH_KEYCHAIN_PASSWORD.
  --set-default           Set the recreated keychain as default keychain.
  -h, --help              Show this help.

Examples:
  KEYCHAIN_PASSWORD='known-strong-password' ./scripts/reset-ios-signing-keychain.sh
  BUILD_SIGNING_KEYCHAIN_PASSWORD='known-strong-password' ./scripts/reset-ios-signing-keychain.sh --name build-signing
USAGE
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "❌ This script requires macOS (security CLI)." >&2
  exit 1
fi

if ! command -v security >/dev/null 2>&1; then
  echo "❌ security CLI not found. Install Xcode command line tools." >&2
  exit 1
fi

KEYCHAIN_NAME="build-signing"
KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-${BUILD_SIGNING_KEYCHAIN_PASSWORD:-${MATCH_KEYCHAIN_PASSWORD:-}}}"
SET_DEFAULT="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      KEYCHAIN_NAME="${2:-}"
      shift 2
      ;;
    --password)
      KEYCHAIN_PASSWORD="${2:-}"
      shift 2
      ;;
    --set-default)
      SET_DEFAULT="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "❌ Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$KEYCHAIN_NAME" ]]; then
  echo "❌ Keychain name cannot be empty." >&2
  exit 1
fi

if [[ ! "$KEYCHAIN_NAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "❌ Keychain name may only contain letters, numbers, dot, underscore, and hyphen." >&2
  exit 1
fi

if [[ -z "$KEYCHAIN_PASSWORD" ]]; then
  echo "❌ Missing keychain password." >&2
  echo "   Provide --password or set KEYCHAIN_PASSWORD / BUILD_SIGNING_KEYCHAIN_PASSWORD / MATCH_KEYCHAIN_PASSWORD." >&2
  exit 1
fi

KEYCHAIN_PATH="$HOME/Library/Keychains/${KEYCHAIN_NAME}.keychain-db"

echo "[i] Resetting keychain: ${KEYCHAIN_NAME}"

if security list-keychains -d user | tr -d '"' | grep -Fq "$KEYCHAIN_PATH"; then
  echo "[i] Existing keychain found. Deleting: $KEYCHAIN_PATH"
  security delete-keychain "$KEYCHAIN_PATH" || true
fi

if [[ -f "$KEYCHAIN_PATH" ]]; then
  rm -f "$KEYCHAIN_PATH"
fi

echo "[i] Creating keychain at: $KEYCHAIN_PATH"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

CURRENT_KEYCHAINS=()
while IFS= read -r line; do
  CURRENT_KEYCHAINS+=("$line")
done < <(security list-keychains -d user | sed -E 's/^[[:space:]]*"//; s/"$//')

if ! printf '%s\n' "${CURRENT_KEYCHAINS[@]}" | grep -Fqx "$KEYCHAIN_PATH"; then
  echo "[i] Adding keychain to user search list"
  security list-keychains -d user -s "$KEYCHAIN_PATH" "${CURRENT_KEYCHAINS[@]}"
fi

if [[ "$SET_DEFAULT" == "1" ]]; then
  echo "[i] Setting as default keychain"
  security default-keychain -d user -s "$KEYCHAIN_PATH"
fi

echo "✅ Keychain reset complete."
echo
echo "Optional env exports for downstream signing tools:"
echo "  export KEYCHAIN_PASSWORD='<set in your shell or secret manager>'"
echo "  export MATCH_KEYCHAIN_NAME='${KEYCHAIN_NAME}'"
echo "  export MATCH_KEYCHAIN_PASSWORD='<set in your shell or secret manager>'"
