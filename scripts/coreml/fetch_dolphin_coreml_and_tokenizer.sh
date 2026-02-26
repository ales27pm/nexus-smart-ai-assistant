#!/usr/bin/env bash
set -euo pipefail

# Downloads CoreML model + tokenizer based on manifest in coreml-config.json
# Optional env:
#   HF_TOKEN=...  (only if a repo becomes gated/private)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/coreml-config.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "[!] jq is required to read coreml-config.json"
  echo "    brew install jq  # macOS"
  echo "    sudo apt-get install jq  # Debian/Ubuntu"
  exit 2
fi

COREML_REPO="$(jq -r '.coremlRepo' "$MANIFEST_PATH")"
TOKENIZER_REPO="$(jq -r '.tokenizerRepo' "$MANIFEST_PATH")"
MODEL_FILE="$(jq -r '.activeModel' "$MANIFEST_PATH")"

if [ -z "$COREML_REPO" ] || [ "$COREML_REPO" = "null" ]; then
  echo "[!] Invalid coremlRepo in $MANIFEST_PATH"
  exit 4
fi
if [ -z "$TOKENIZER_REPO" ] || [ "$TOKENIZER_REPO" = "null" ]; then
  echo "[!] Invalid tokenizerRepo in $MANIFEST_PATH"
  exit 5
fi
if [ -z "$MODEL_FILE" ] || [ "$MODEL_FILE" = "null" ]; then
  echo "[!] Invalid activeModel in $MANIFEST_PATH"
  exit 6
fi

MODEL_DEST="$ROOT_DIR/modules/expo-coreml-llm/ios/resources/models"
TOK_DEST="$ROOT_DIR/.hf_tokenizer_cache/dolphin_llama3_2_3b"

mkdir -p "$MODEL_DEST" "$TOK_DEST"

if ! command -v hf >/dev/null 2>&1; then
  echo "[i] 'hf' CLI not found; attempting safe installation via pipx/pip..."
  if command -v pipx >/dev/null 2>&1; then
    pipx install 'huggingface_hub[cli]' || true
    export PATH="$HOME/.local/bin:$PATH"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --user 'huggingface_hub[cli]' || true
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi

if ! command -v hf >/dev/null 2>&1; then
  echo "[!] hf CLI still not found. Install manually with one of:"
  echo "    pipx install 'huggingface_hub[cli]'"
  echo "    python3 -m pip install --user 'huggingface_hub[cli]'"
  echo "    export PATH=\"$HOME/.local/bin:\$PATH\""
  exit 3
fi

echo "[i] Downloading CoreML model: $COREML_REPO -> $MODEL_FILE"
HF_ARGS=(download "$COREML_REPO" --include "$MODEL_FILE/**" --include "$MODEL_FILE/*" --local-dir "$ROOT_DIR/.hf_models/Dolphin3.0-CoreML")
if [[ -n "${HF_TOKEN:-}" ]]; then HF_ARGS+=(--token "$HF_TOKEN"); fi
hf "${HF_ARGS[@]}"

: "${MODEL_FILE:?MODEL_FILE cannot be empty}"
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
