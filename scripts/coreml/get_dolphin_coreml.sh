#!/usr/bin/env bash
set -euo pipefail

# Download a Dolphin3.0 CoreML .mlpackage from Hugging Face and optionally inspect IO.
#
# Usage:
#   ./scripts/coreml/get_dolphin_coreml.sh int4-lut
#   ./scripts/coreml/get_dolphin_coreml.sh int8
#   ./scripts/coreml/get_dolphin_coreml.sh fp16
#
# Env:
#   HF_TOKEN=...         (optional; if repo is private/gated)
#   HF_HOME=...          (optional; cache dir)
#   DEST_DIR=...         (optional; where to place models)
#   STAGING_DIR=...      (optional; where to download snapshot)
#   INSPECT=1            (optional; run inspect script after download)

VARIANT="${1:-int4-lut}"

REPO_ID="ales27pm/Dolphin3.0-CoreML"

case "$VARIANT" in
  int4|int4-lut)   PKG_DIR="Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage" ;;
  int8)            PKG_DIR="Dolphin3.0-Llama3.2-3B-int8.mlpackage" ;;
  fp16)            PKG_DIR="Dolphin3.0-Llama3.2-3B-fp16.mlpackage" ;;
  *)
    echo "❌ Unknown variant: $VARIANT (expected: int4-lut | int8 | fp16)" >&2
    exit 1
    ;;
esac

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST_DIR="${DEST_DIR:-$PROJECT_ROOT/modules/expo-coreml-llm/ios/resources/models}"
STAGING_DIR="${STAGING_DIR:-$PROJECT_ROOT/.hf_models/$REPO_ID}"
INSPECT="${INSPECT:-0}"

mkdir -p "$DEST_DIR"
mkdir -p "$STAGING_DIR"

echo "[i] Repo:        $REPO_ID"
echo "[i] Variant:     $VARIANT"
echo "[i] Package dir: $PKG_DIR"
echo "[i] Staging:     $STAGING_DIR"
echo "[i] Destination: $DEST_DIR/$PKG_DIR"
echo

# Prefer hf CLI if present. HF docs: install + hf download. (See citations in chat)
if command -v hf >/dev/null 2>&1; then
  echo "[i] Using hf CLI"
  # Download ONLY the chosen mlpackage folder.
  # `--include` keeps it tight; `--local-dir-use-symlinks False` avoids symlinks weirdness inside iOS builds.
  set +e
  hf download "$REPO_ID" \
    --repo-type model \
    --local-dir "$STAGING_DIR" \
    --local-dir-use-symlinks False \
    --include "$PKG_DIR/*" \
    ${HF_TOKEN:+--token "$HF_TOKEN"}
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "⚠️ hf download failed (rc=$rc). Falling back to python snapshot_download..."
    python3 "$PROJECT_ROOT/scripts/coreml/hf_snapshot_download.py" \
      --repo "$REPO_ID" \
      --subdir "$PKG_DIR" \
      --out "$STAGING_DIR" \
      ${HF_TOKEN:+--token "$HF_TOKEN"}
  fi
else
  echo "[i] hf CLI not found; using python snapshot_download (recommended if you don't want to install hf)."
  python3 "$PROJECT_ROOT/scripts/coreml/hf_snapshot_download.py" \
    --repo "$REPO_ID" \
    --subdir "$PKG_DIR" \
    --out "$STAGING_DIR" \
    ${HF_TOKEN:+--token "$HF_TOKEN"}
fi

SRC_PATH="$STAGING_DIR/$PKG_DIR"
DST_PATH="$DEST_DIR/$PKG_DIR"

if [[ ! -d "$SRC_PATH" ]]; then
  echo "❌ Download finished but folder not found: $SRC_PATH" >&2
  echo "   This usually means your allow/include pattern didn't match, or download was incomplete." >&2
  exit 2
fi

# Sanity checks to detect the “3 tiny files” / pointer-only situation.
FILE_COUNT="$(find "$SRC_PATH" -type f | wc -l | tr -d ' ')"
SIZE_MB="$(du -sm "$SRC_PATH" | awk '{print $1}')"

echo "[i] Downloaded file count: $FILE_COUNT"
echo "[i] Downloaded size (MB):  $SIZE_MB"

if [[ "$FILE_COUNT" -lt 20 || "$SIZE_MB" -lt 200 ]]; then
  echo "❌ This looks WAY too small to be a real CoreML LLM package."
  echo "   If you see something like 3 files / ~0MB, you're not getting the real weights."
  echo "   Fix: install/use 'hf' CLI (handles large repos well) or ensure huggingface_hub is up to date."
  exit 3
fi

# Stage into temp path first so existing installation stays intact on copy failure.
TMP_PATH="${DST_PATH}.tmp.$$"
rm -rf "$TMP_PATH"
trap 'rm -rf "$TMP_PATH" 2>/dev/null || true' EXIT

echo "[i] Copying to temporary destination..."
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SRC_PATH/" "$TMP_PATH/"
else
  cp -R "$SRC_PATH" "$TMP_PATH"
fi

if [[ -d "$DST_PATH" ]]; then
  echo "[i] Removing existing destination: $DST_PATH"
  rm -rf "$DST_PATH"
fi
mv "$TMP_PATH" "$DST_PATH"

echo "✅ Installed: $DST_PATH"

if [[ "$INSPECT" == "1" ]]; then
  echo
  echo "[next] Inspect IO:"
  if ! python3 "$PROJECT_ROOT/scripts/coreml/inspect_coreml_io.py" "$DST_PATH"; then
    echo "⚠️ inspect_coreml_io.py failed; continuing." >&2
  fi
fi
