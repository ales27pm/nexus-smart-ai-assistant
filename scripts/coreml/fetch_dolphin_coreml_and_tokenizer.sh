#!/usr/bin/env bash
set -euo pipefail

# Downloads CoreML model + tokenizer based on manifest in coreml-config.json
# Optional env:
#   HF_TOKEN=...  (only if a repo becomes gated/private)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/coreml-config.json"


if ! command -v node >/dev/null 2>&1; then
  echo "[!] node is required for CoreML pipeline validation" >&2
  exit 7
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[!] jq is required to read coreml-config.json"
  echo "    brew install jq  # macOS"
  echo "    sudo apt-get install jq  # Debian/Ubuntu"
  exit 2
fi

COREML_REPO="$(jq -r '.coremlRepo' "$MANIFEST_PATH")"
TOKENIZER_REPO="$(jq -r '.tokenizerRepo' "$MANIFEST_PATH")"
MODEL_FILE="$(jq -r ' .activeModel ' "$MANIFEST_PATH")"
TOKENIZER_BUNDLE_DIR_MANIFEST="$(jq -r ' .tokenizerBundleDir // "modules/expo-coreml-llm/ios/resources/tokenizers/byte_level_bpe" ' "$MANIFEST_PATH")"
TOKENIZER_VOCAB_FILE="$(jq -r ' .tokenizerVocabFile // "vocab.json" ' "$MANIFEST_PATH")"
TOKENIZER_MERGES_FILE="$(jq -r ' .tokenizerMergesFile // "merges.txt" ' "$MANIFEST_PATH")"

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
if [ -z "$TOKENIZER_BUNDLE_DIR_MANIFEST" ] || [ "$TOKENIZER_BUNDLE_DIR_MANIFEST" = "null" ]; then
  echo "[!] Invalid tokenizerBundleDir in $MANIFEST_PATH"
  exit 8
fi
if [ -z "$TOKENIZER_VOCAB_FILE" ] || [ "$TOKENIZER_VOCAB_FILE" = "null" ]; then
  echo "[!] Invalid tokenizerVocabFile in $MANIFEST_PATH"
  exit 9
fi
if [ -z "$TOKENIZER_MERGES_FILE" ] || [ "$TOKENIZER_MERGES_FILE" = "null" ]; then
  echo "[!] Invalid tokenizerMergesFile in $MANIFEST_PATH"
  exit 10
fi

MODEL_DEST="$ROOT_DIR/modules/expo-coreml-llm/ios/resources/models"
TOKENIZER_CACHE_KEY="$(printf "%s" "$TOKENIZER_REPO" | sed -E 's#^.*/##; s/[^[:alnum:]]+/_/g; s/^_+//; s/_+$//;' | tr "[:upper:]" "[:lower:]")"
if [ -z "$TOKENIZER_CACHE_KEY" ]; then TOKENIZER_CACHE_KEY="tokenizer"; fi
TOK_DEST="$ROOT_DIR/.hf_tokenizer_cache/$TOKENIZER_CACHE_KEY"
TOK_BUNDLE_DIR="$ROOT_DIR/$TOKENIZER_BUNDLE_DIR_MANIFEST"
TOK_BUNDLE_VOCAB="$TOK_BUNDLE_DIR/$TOKENIZER_VOCAB_FILE"
TOK_BUNDLE_MERGES="$TOK_BUNDLE_DIR/$TOKENIZER_MERGES_FILE"

mkdir -p "$MODEL_DEST" "$TOK_DEST" "$TOK_BUNDLE_DIR"

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
echo "[i] Tokenizer cache key: $TOKENIZER_CACHE_KEY"
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

python3 "$ROOT_DIR/scripts/coreml/export_gpt2_bpe_assets.py" \
  --tokenizer-json "$TOK_DEST/tokenizer.json" \
  --out-vocab "$TOK_BUNDLE_VOCAB" \
  --out-merges "$TOK_BUNDLE_MERGES"
PY_EXPORT_STATUS=$?

if [[ $PY_EXPORT_STATUS -ne 0 ]]; then
  echo "[x] Failed to export GPT-2 BPE tokenizer assets (python exit code: $PY_EXPORT_STATUS)" >&2
  exit "$PY_EXPORT_STATUS"
fi

if [[ ! -s "$TOK_BUNDLE_VOCAB" ]]; then
  echo "[x] Tokenizer vocab asset not created or empty: $TOK_BUNDLE_VOCAB" >&2
  exit 1
fi

if [[ ! -s "$TOK_BUNDLE_MERGES" ]]; then
  echo "[x] Tokenizer merges asset not created or empty: $TOK_BUNDLE_MERGES" >&2
  exit 1
fi

echo "[✓] Tokenizer cache dir:"
echo "    $TOK_DEST"
echo "[✓] Tokenizer bundle assets:"
echo "    $TOK_BUNDLE_DIR"

echo
echo "[next] Inspect CoreML IO:"
echo "    python3 scripts/coreml/inspect_coreml_io.py \"$MODEL_DEST/$MODEL_FILE\""


echo "[i] Validating CoreML pipeline artifacts against manifest"
node "$ROOT_DIR/scripts/coreml/validate_coreml_pipeline.mjs" --strict


if ! command -v python3 >/dev/null 2>&1; then
  echo "[i] python3 not installed; skipping deep CoreML IO inspection"
elif python3 -c "import coremltools" >/dev/null 2>&1; then
  echo "[i] Running deep CoreML IO inspection via coremltools"
  node "$ROOT_DIR/scripts/coreml/run_coreml_inspect.mjs"
else
  echo "[i] coremltools not installed; skipping deep CoreML IO inspection"
  echo "    Install: python3 -m pip install --upgrade coremltools"
fi
