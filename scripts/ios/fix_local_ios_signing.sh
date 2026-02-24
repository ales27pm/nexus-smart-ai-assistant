#!/usr/bin/env bash
set -euo pipefail

# One-shot helper:
#  1) Diagnose P12 (is it codesigning?)
#  2) Write credentials.json
#
# Usage:
#   P12_PASSWORD='...' ./scripts/ios/fix_local_ios_signing.sh \
#     --p12 credentials/ios/dist-cert.p12 \
#     --profile credentials/ios/profile.mobileprovision

P12=""
PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --p12) P12="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${P12}" || -z "${PROFILE}" ]]; then
  echo "Usage: P12_PASSWORD='...' fix_local_ios_signing.sh --p12 ... --profile ..." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "[1/2] Diagnose P12..."
P12_PASSWORD="${P12_PASSWORD:-}" "$PROJECT_ROOT/scripts/ios/diagnose_p12.sh" "$P12"

echo
echo "[2/2] Write credentials.json..."
P12_PASSWORD="${P12_PASSWORD:-}" node "$PROJECT_ROOT/scripts/ios/write_credentials_local.mjs" \
  --p12 "$P12" \
  --profile "$PROFILE" \
  --out "$PROJECT_ROOT/credentials.json"

echo
echo "✅ Done."
echo "Next: ensure eas.json build profile has: ios.credentialsSource = \"local\" (per Expo docs)."
echo "Then run your local build again."
