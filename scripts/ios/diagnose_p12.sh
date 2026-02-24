#!/usr/bin/env bash
set -euo pipefail

# Diagnose whether a .p12 is a *codesigning identity* on macOS.
#
# Usage:
#   P12_PASSWORD='...' ./scripts/ios/diagnose_p12.sh path/to/dist-cert.p12
#
# Prints:
#  - Subject/Issuer/Validity
#  - SHA1 fingerprint
#  - Extended Key Usage (must include Code Signing)
#  - Whether `security find-identity -p codesigning` can see it after import

P12_PATH="${1:-}"
if [[ -z "${P12_PATH}" ]]; then
  echo "Usage: P12_PASSWORD='...' diagnose_p12.sh path/to/file.p12" >&2
  exit 2
fi

if [[ -z "${P12_PASSWORD:-}" ]]; then
  echo "❌ Set P12_PASSWORD in env (avoid typing into history)." >&2
  exit 2
fi

if [[ ! -f "${P12_PATH}" ]]; then
  echo "❌ Not found: ${P12_PATH}" >&2
  exit 2
fi

OPENSSL_BIN="${OPENSSL_BIN:-openssl}"
TMP_DIR="$(mktemp -d /tmp/p12diag.XXXXXX)"
trap 'rm -rf "$TMP_DIR" 2>/dev/null || true' EXIT

LEGACY_FLAG=""
# Try reading P12; OpenSSL 3 often needs -legacy for RC2-40
set +e
"$OPENSSL_BIN" pkcs12 -in "$P12_PATH" -passin "pass:$P12_PASSWORD" -info -noout >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 0 ]]; then
  LEGACY_FLAG="-legacy"
fi

LEAF_CERT="$TMP_DIR/leaf_cert.pem"
PRIV_KEY="$TMP_DIR/private_key.pem"

CERT_EXTRACT_ERR="$TMP_DIR/openssl_extract_cert.err"
KEY_EXTRACT_ERR="$TMP_DIR/openssl_extract_key.err"

"$OPENSSL_BIN" pkcs12 $LEGACY_FLAG -in "$P12_PATH" -passin "pass:$P12_PASSWORD" -clcerts -nokeys -out "$LEAF_CERT" 2>"$CERT_EXTRACT_ERR" || {
  echo "❌ Failed to extract certificate from P12." >&2
  echo "   P12: $P12_PATH" >&2
  sed -e 's/^/   openssl: /' "$CERT_EXTRACT_ERR" >&2 || true
  exit 2
}
"$OPENSSL_BIN" pkcs12 $LEGACY_FLAG -in "$P12_PATH" -passin "pass:$P12_PASSWORD" -nocerts -nodes -out "$PRIV_KEY" 2>"$KEY_EXTRACT_ERR" || {
  echo "❌ Failed to extract private key from P12." >&2
  echo "   P12: $P12_PATH" >&2
  sed -e 's/^/   openssl: /' "$KEY_EXTRACT_ERR" >&2 || true
  exit 2
}

echo "=============================="
echo "[i] P12: $P12_PATH"
echo "=============================="
echo
echo "[i] Certificate subject/issuer:"
"$OPENSSL_BIN" x509 -in "$LEAF_CERT" -noout -subject -issuer
echo
echo "[i] Validity:"
"$OPENSSL_BIN" x509 -in "$LEAF_CERT" -noout -dates
echo
echo "[i] SHA1 fingerprint:"
"$OPENSSL_BIN" x509 -in "$LEAF_CERT" -noout -fingerprint -sha1
echo
echo "[i] Extended Key Usage (EKU):"
EKU_LINE="$($OPENSSL_BIN x509 -in "$LEAF_CERT" -noout -text | awk '
  BEGIN{found=0}
  /X509v3 Extended Key Usage/ {found=1; getline; gsub(/^[ \t]+/, "", $0); print; exit}
')"
echo "  ${EKU_LINE:-<not found>}"
echo
if [[ "${EKU_LINE}" != *"Code Signing"* ]]; then
  echo "❌ This certificate does NOT advertise Code Signing in EKU."
  echo "   That means it will not appear in: security find-identity -p codesigning"
  echo "   You likely exported the WRONG cert (APNs/Installer/etc)."
  echo
fi

# Create a temp keychain and import
if command -v "$OPENSSL_BIN" >/dev/null 2>&1; then
  KC_PASS="$("$OPENSSL_BIN" rand -base64 24)"
else
  KC_PASS="$(dd if=/dev/urandom bs=18 count=1 2>/dev/null | base64)"
fi
KC_PATH="$(mktemp /tmp/p12diag-keychain.XXXXXX.keychain-db)"
rm -f "$KC_PATH"
trap 'rm -rf "$TMP_DIR" 2>/dev/null || true; security delete-keychain "$KC_PATH" >/dev/null 2>&1 || true' EXIT

security create-keychain -p "$KC_PASS" "$KC_PATH" >/dev/null
security set-keychain-settings -lut 21600 "$KC_PATH" >/dev/null
security unlock-keychain -p "$KC_PASS" "$KC_PATH" >/dev/null

echo "[i] Importing into temp keychain: $KC_PATH"
security import "$P12_PATH" -k "$KC_PATH" -P "$P12_PASSWORD" -A -T /usr/bin/codesign -T /usr/bin/security >/dev/null || true

echo
echo "=============================="
echo "[i] security find-identity (all policies)"
echo "=============================="
security find-identity -v "$KC_PATH" || true

echo
echo "=============================="
echo "[i] security find-identity -p codesigning"
echo "=============================="
security find-identity -v -p codesigning "$KC_PATH" || true

echo
