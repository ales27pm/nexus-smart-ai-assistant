#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/coreml/fetch_dolphin_coreml_and_tokenizer.sh int4
#   ./scripts/coreml/fetch_dolphin_coreml_and_tokenizer.sh int8
#   ./scripts/coreml/fetch_dolphin_coreml_and_tokenizer.sh fp16
#
# Optional env:
#   HF_TOKEN=...  (only if a repo becomes gated/private)

COREML_REPO="ales27pm/Dolphin3.0-CoreML"
TOKENIZER_REPO="dphn/Dolphin3.0-Llama3.2-3B"
VARIANT="${1:-int4}"

case "$VARIANT" in
  int4|int4-lut) MODEL_FILE="Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage" ;;
  int8) MODEL_FILE="Dolphin3.0-Llama3.2-3B-int8.mlpackage" ;;
  fp16) MODEL_FILE="Dolphin3.0-Llama3.2-3B-fp16.mlpackage" ;;
  *)
    echo "Unknown variant: $VARIANT"
    echo "Use one of: int4 | int8 | fp16"
    exit 2
    ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODEL_DEST="$ROOT_DIR/modules/expo-coreml-llm/ios/resources/models"
TOK_DEST="$ROOT_DIR/.hf_tokenizer_cache/dolphin_llama3_2_3b"

mkdir -p "$MODEL_DEST" "$TOK_DEST"

if ! command -v hf >/dev/null 2>&1; then
  echo "[i] Installing hf CLI..."
  curl -LsSf https://hf.co/cli/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
fi

if ! command -v hf >/dev/null 2>&1; then
  echo "[!] hf CLI still not found. Try opening a new terminal or run:"
  echo "    export PATH=\"$HOME/.local/bin:\$PATH\""
  exit 3
fi

echo "[i] Downloading CoreML model: $COREML_REPO -> $MODEL_FILE"
HF_ARGS=(download "$COREML_REPO" --include "$MODEL_FILE/**" --include "$MODEL_FILE/*" --local-dir "$ROOT_DIR/.hf_models/Dolphin3.0-CoreML")
if [[ -n "${HF_TOKEN:-}" ]]; then HF_ARGS+=(--token "$HF_TOKEN"); fi
hf "${HF_ARGS[@]}"

rm -rf "$MODEL_DEST/$MODEL_FILE"
cp -R "$ROOT_DIR/.hf_models/Dolphin3.0-CoreML/$MODEL_FILE" "$MODEL_DEST/$MODEL_FILE"

echo "[✓] Model installed at:"
echo "    $MODEL_DEST/$MODEL_FILE"

echo "[i] Downloading tokenizer files from: $TOKENIZER_REPO"
TOK_ARGS=(download "$TOKENIZER_REPO"
  --include "tokenizer.json"
  --include "tokenizer_config.json"
  --include "special_tokens_map.json"
  --include "generation_config.json"
  --include "config.json"
  --local-dir "$TOK_DEST"
)
if [[ -n "${HF_TOKEN:-}" ]]; then TOK_ARGS+=(--token "$HF_TOKEN"); fi
hf "${TOK_ARGS[@]}"

echo "[✓] Tokenizer cache dir:"
echo "    $TOK_DEST"

echo
echo "[next] Inspect CoreML IO:"
echo "    python3 scripts/coreml/inspect_coreml_io.py \"$MODEL_DEST/$MODEL_FILE\""
echo
echo "[next] In-app tokenizer path you will use:"
echo "    $TOK_DEST"
