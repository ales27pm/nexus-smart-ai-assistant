#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${P12_PASSWORD:-}" ]]; then
  echo "Usage: P12_PASSWORD='...' $0 path/to/file.p12" >&2
  exit 1
fi

P12="${1:-}"
if [[ -z "$P12" ]]; then
  echo "Usage: P12_PASSWORD='...' $0 path/to/file.p12" >&2
  exit 1
fi

if [[ ! -f "$P12" ]]; then
  echo "❌ P12 not found: $P12" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/p12diag.XXXXXX)"
KC="${TMP_DIR}/p12diag.keychain-db"
KC_PASS="diag-$(date +%s)-$RANDOM"

echo "=============================="
echo "[i] P12: $P12"
echo "=============================="
echo

echo "[i] Extracting certificate subject/issuer + validity..."
openssl pkcs12 -legacy -in "$P12" -clcerts -nokeys -passin env:P12_PASSWORD -out "${TMP_DIR}/leaf_cert.pem" >/dev/null
openssl x509 -in "${TMP_DIR}/leaf_cert.pem" -noout -subject -issuer
echo
openssl x509 -in "${TMP_DIR}/leaf_cert.pem" -noout -dates
echo
openssl x509 -in "${TMP_DIR}/leaf_cert.pem" -noout -fingerprint -sha1
echo

echo "[i] Creating temp keychain: $KC"
security create-keychain -p "$KC_PASS" "$KC" >/dev/null
security set-keychain-settings -lut 21600 "$KC" >/dev/null
security unlock-keychain -p "$KC_PASS" "$KC" >/dev/null

echo "[i] Importing P12 into temp keychain..."
security import "$P12" -k "$KC" -P "$P12_PASSWORD" -A -T /usr/bin/codesign -T /usr/bin/security >/dev/null

echo
echo "=============================="
echo "[i] security find-identity -p codesigning -v (THIS keychain)"
echo "=============================="
security find-identity -p codesigning -v "$KC" || true
echo

echo "=============================="
echo "[i] Certificates present in temp keychain (SHA-1 hashes)"
echo "=============================="
security find-certificate -a -Z "$KC" || true
echo

echo "[i] Temp artifacts: $TMP_DIR"
echo "[i] (Keychain will remain there for inspection.)"
