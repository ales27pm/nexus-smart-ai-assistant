#!/usr/bin/env bash
set -euo pipefail

# Variants per model card: fp16, int8, int4-lut :contentReference[oaicite:5]{index=5}

VARIANT="${1:-}"
if [[ -z "$VARIANT" ]]; then
  echo "Usage: $0 {fp16|int8|int4-lut}" >&2
  exit 1
fi

case "$VARIANT" in
  fp16)    PKG="Dolphin3.0-Llama3.2-3B-fp16.mlpackage" ;;
  int8)    PKG="Dolphin3.0-Llama3.2-3B-int8.mlpackage" ;;
  int4-lut|int4|lut) PKG="Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage" ;;
  *) echo "❌ Unknown variant: $VARIANT (expected fp16|int8|int4-lut)" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

REPO_ID="ales27pm/Dolphin3.0-CoreML"
STAGING="$ROOT/.hf_models/${REPO_ID}"
DEST="$ROOT/modules/expo-coreml-llm/ios/resources/models/${PKG}"

echo "[i] Repo:        $REPO_ID"
echo "[i] Variant:     $VARIANT"
echo "[i] Package dir: $PKG"
echo "[i] Staging:     $STAGING"
echo "[i] Destination: $DEST"
echo

mkdir -p "$STAGING"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"

# Allow patterns: grab mlpackage contents (a few nested levels to be safe)
ALLOW=(
  "${PKG}/*"
  "${PKG}/*/*"
  "${PKG}/*/*/*"
  "coreml_artifacts.json"
)

echo "[i] Using python snapshot_download (no hf CLI required)."
python3 "$SCRIPT_DIR/hf_snapshot_download.py" \
  --repo "$REPO_ID" \
  --local-dir "$STAGING" \
  $(printf -- "--allow-pattern %q " "${ALLOW[@]}")

SRC="$STAGING/$PKG"
if [[ ! -d "$SRC" ]]; then
  echo "❌ Downloaded snapshot missing expected directory: $SRC" >&2
  exit 1
fi

# Copy into repo destination
cp -R "$SRC" "$DEST"

# Basic sanity checks
FILECOUNT="$(find "$DEST" -type f | wc -l | tr -d ' ')"
SIZEMB="$(du -sm "$DEST" | awk '{print $1}')"

echo
echo "[i] Installed file count: $FILECOUNT"
echo "[i] Installed size (MB):  $SIZEMB"

# Heuristic: size must be non-trivial; file count can be small in mlpackages.
if [[ "$SIZEMB" -lt 200 ]]; then
  echo "❌ Package size (${SIZEMB}MB) looks too small for a real 3B CoreML LLM." >&2
  echo "   If this is unexpected, set HF_TOKEN to avoid partial/rate-limited downloads." >&2
  exit 1
fi

echo
echo "[✓] Model installed:"
echo "    $DEST"
echo
echo "[next] Inspect IO:"
echo "    python3 scripts/coreml/inspect_coreml_io.py \"$DEST\""
