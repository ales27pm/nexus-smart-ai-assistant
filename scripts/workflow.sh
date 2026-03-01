#!/usr/bin/env bash
set -euo pipefail

#───────────────────────────────────────────────────────────────────────────────
# Smart AI Assistant — Unified Build & Deploy Workflow
#
# One-click script that handles every stage:
#   1. Environment checks
#   2. CoreML model download
#   3. Tokenizer download
#   4. iOS credential setup
#   5. EAS local build (dev / preview / production)
#   6. Submit to App Store / TestFlight
#
# Usage:
#   ./scripts/workflow.sh                  # interactive menu
#   ./scripts/workflow.sh --step model     # run a single step
#   ./scripts/workflow.sh --full           # run everything end-to-end
#───────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── Colors & helpers ─────────────────────────────────────────────────────────
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

# ─── Defaults ─────────────────────────────────────────────────────────────────
resolve_bundle_id() {
  if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/app.json" ]]; then
    node -e "try { const c = JSON.parse(require('fs').readFileSync('$PROJECT_ROOT/app.json','utf8')); console.log(c.expo.ios.bundleIdentifier || c.expo.slug || ''); } catch(e) { console.log(''); }" 2>/dev/null
  fi
}

BUNDLE_ID_FROM_APP_JSON="$(resolve_bundle_id)"
BUNDLE_ID="${BUNDLE_ID_FROM_APP_JSON:-app.rork.smart-ai-assistant-slxh0fb}"
APP_NAME="Smart AI Assistant"
MODEL_VARIANT="${MODEL_VARIANT:-int4}"
BUILD_PROFILE="${BUILD_PROFILE:-production}"
COREML_REPO="ales27pm/Dolphin3.0-CoreML"
TOKENIZER_REPO="dphn/Dolphin3.0-Llama3.2-3B"
MODEL_DEST="$PROJECT_ROOT/modules/expo-coreml-llm/ios/resources/models"
TOK_STAGING="$PROJECT_ROOT/.hf_tokenizer_cache/dolphin_llama3_2_3b"
HF_STAGING="$PROJECT_ROOT/.hf_models/Dolphin3.0-CoreML"

resolve_model_file() {
  case "$1" in
    int4|int4-lut) echo "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage" ;;
    int8)          echo "Dolphin3.0-Llama3.2-3B-int8.mlpackage" ;;
    fp16)          echo "Dolphin3.0-Llama3.2-3B-fp16.mlpackage" ;;
    *) fail "Unknown model variant: $1 (expected int4|int8|fp16)"; exit 1 ;;
  esac
}

# ─── Step 1: Environment Check ───────────────────────────────────────────────
step_env() {
  header "1 · Environment Check"
  local ok=0 total=0

  check_cmd() {
    total=$((total + 1))
    if command -v "$1" >/dev/null 2>&1; then
      success "$1 found: $(command -v "$1")"
      ok=$((ok + 1))
    else
      fail "$1 not found"
      if [[ -n "${2:-}" ]]; then
        echo -e "    ${DIM}Install: $2${RESET}"
      fi
    fi
  }

  check_cmd node
  check_cmd bun "curl -fsSL https://bun.sh/install | bash"
  check_cmd python3
  check_cmd fastlane "brew install fastlane  OR  gem install fastlane --user-install"
  check_cmd openssl
  check_cmd xcodebuild "Install Xcode from the Mac App Store"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    warn "Not running on macOS — iOS build/signing steps will be skipped."
  else
    success "Running on macOS ($(sw_vers -productVersion 2>/dev/null || echo '?'))"
    ok=$((ok + 1))
  fi
  total=$((total + 1))

  echo
  if command -v python3 >/dev/null 2>&1; then
    if python3 -c "import huggingface_hub" 2>/dev/null; then
      success "huggingface_hub (Python) available"
    else
      warn "huggingface_hub not installed (needed for model download)"
      echo -e "    ${DIM}Install: python3 -m pip install --user huggingface_hub${RESET}"
    fi
  fi

  divider
  echo -e "${BOLD}$ok/$total${RESET} required tools found."
  echo
}

# ─── Step 2: Install JS Dependencies ─────────────────────────────────────────
step_deps() {
  header "2 · Install JS Dependencies"
  if command -v bun >/dev/null 2>&1; then
    info "Running bun install..."
    bun install
  else
    warn "bun not found, falling back to npm install"
    npm install
  fi
  success "Dependencies installed."
}

# ─── Step 3: Download CoreML Model ───────────────────────────────────────────
step_model() {
  header "3 · Download CoreML Model"

  local MODEL_FILE
  MODEL_FILE="$(resolve_model_file "$MODEL_VARIANT")"

  info "Repo:     $COREML_REPO"
  info "Variant:  $MODEL_VARIANT"
  info "Package:  $MODEL_FILE"
  info "Dest:     $MODEL_DEST/$MODEL_FILE"

  if [[ -d "$MODEL_DEST/$MODEL_FILE" ]]; then
    local size_mb
    size_mb="$(du -sm "$MODEL_DEST/$MODEL_FILE" 2>/dev/null | awk '{print $1}')"
    if [[ "${size_mb:-0}" -ge 200 ]]; then
      success "Model already present (${size_mb}MB). Skipping download."
      return 0
    else
      warn "Model directory exists but looks incomplete (${size_mb}MB). Re-downloading..."
      rm -rf "$MODEL_DEST/$MODEL_FILE"
    fi
  fi

  mkdir -p "$HF_STAGING" "$MODEL_DEST"

  if python3 -c "import huggingface_hub" 2>/dev/null; then
    info "Using python snapshot_download..."
    local ALLOW_ARGS=()
    ALLOW_ARGS+=(--allow-pattern "${MODEL_FILE}/*")
    ALLOW_ARGS+=(--allow-pattern "${MODEL_FILE}/*/*")
    ALLOW_ARGS+=(--allow-pattern "${MODEL_FILE}/*/*/*")

    local TOKEN_ARG=()
    if [[ -n "${HF_TOKEN:-}" ]]; then
      TOKEN_ARG=(--token-env HF_TOKEN)
    fi

    local PY_ARGS=(
      "$SCRIPT_DIR/coreml/hf_snapshot_download.py"
      --repo "$COREML_REPO"
      --local-dir "$HF_STAGING"
      "${ALLOW_ARGS[@]}"
    )
    if [[ -n "${HF_TOKEN:-}" ]]; then
      PY_ARGS+=("${TOKEN_ARG[@]}")
    fi
    python3 "${PY_ARGS[@]}"
  elif command -v hf >/dev/null 2>&1; then
    info "Using hf CLI..."
    local HF_ARGS=(download "$COREML_REPO" --include "$MODEL_FILE/**" --include "$MODEL_FILE/*" --local-dir "$HF_STAGING")
    if [[ -n "${HF_TOKEN:-}" ]]; then HF_ARGS+=(--token "$HF_TOKEN"); fi
    hf "${HF_ARGS[@]}"
  else
    fail "Neither huggingface_hub (Python) nor hf CLI found."
    echo -e "    ${DIM}Install one of:${RESET}"
    echo -e "    ${DIM}  python3 -m pip install --user huggingface_hub${RESET}"
    echo -e "    ${DIM}  pipx install 'huggingface_hub[cli]'${RESET}"
    return 1
  fi

  if [[ ! -d "$HF_STAGING/$MODEL_FILE" ]]; then
    fail "Downloaded snapshot missing expected directory: $HF_STAGING/$MODEL_FILE"
    return 1
  fi

  rm -rf "$MODEL_DEST/$MODEL_FILE"
  cp -R "$HF_STAGING/$MODEL_FILE" "$MODEL_DEST/$MODEL_FILE"

  local installed_mb
  installed_mb="$(du -sm "$MODEL_DEST/$MODEL_FILE" | awk '{print $1}')"
  if [[ "$installed_mb" -lt 200 ]]; then
    fail "Model size (${installed_mb}MB) looks too small for a 3B CoreML LLM."
    warn "If the repo is gated, set HF_TOKEN and retry."
    return 1
  fi

  success "Model installed: $MODEL_DEST/$MODEL_FILE (${installed_mb}MB)"
}

# ─── Step 4: Download Tokenizer ──────────────────────────────────────────────
step_tokenizer() {
  header "4 · Download Tokenizer Files"

  local REQUIRED_FILES=("tokenizer.json" "tokenizer_config.json" "special_tokens_map.json" "config.json" "generation_config.json")
  local all_present=true

  mkdir -p "$TOK_STAGING"

  for f in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$TOK_STAGING/$f" ]]; then
      all_present=false
      break
    fi
  done

  if $all_present; then
    success "Tokenizer files already present. Skipping download."
    return 0
  fi

  info "Downloading tokenizer from: $TOKENIZER_REPO"

  if command -v hf >/dev/null 2>&1; then
    local TOK_ARGS=(download "$TOKENIZER_REPO")
    for f in "${REQUIRED_FILES[@]}"; do
      TOK_ARGS+=(--include "$f")
    done
    TOK_ARGS+=(--local-dir "$TOK_STAGING")
    if [[ -n "${HF_TOKEN:-}" ]]; then TOK_ARGS+=(--token "$HF_TOKEN"); fi
    hf "${TOK_ARGS[@]}"
  elif python3 -c "import huggingface_hub" 2>/dev/null; then
    local ALLOW_ARGS=()
    for f in "${REQUIRED_FILES[@]}"; do
      ALLOW_ARGS+=(--allow-pattern "$f")
    done
    python3 "$SCRIPT_DIR/coreml/hf_snapshot_download.py" \
      --repo "$TOKENIZER_REPO" \
      --local-dir "$TOK_STAGING" \
      "${ALLOW_ARGS[@]}"
  else
    fail "No download tool available for tokenizer."
    return 1
  fi

  for f in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$TOK_STAGING/$f" ]]; then
      fail "Missing tokenizer file after download: $f"
      return 1
    fi
  done

  success "Tokenizer installed: $TOK_STAGING"
}

# ─── Step 5: iOS Credentials ─────────────────────────────────────────────────
step_credentials() {
  header "5 · iOS Credentials Setup"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    warn "Skipping iOS credentials (not on macOS)."
    return 0
  fi

  if [[ -f "$PROJECT_ROOT/credentials.json" ]]; then
    info "credentials.json already exists."
    local creds_valid=true
    node -e "
      const c = JSON.parse(require('fs').readFileSync('credentials.json','utf8'));
      const p12 = c?.ios?.distributionCertificate?.path;
      const prof = c?.ios?.provisioningProfilePath;
      if (!p12 || !prof) { console.error('incomplete'); process.exit(1); }
      const fs = require('fs');
      if (!fs.existsSync(p12)) { console.error('p12 missing: ' + p12); process.exit(1); }
      if (!fs.existsSync(prof)) { console.error('profile missing: ' + prof); process.exit(1); }
      console.log('ok');
    " 2>/dev/null || creds_valid=false

    if $creds_valid; then
      success "credentials.json looks valid (P12 + profile files exist)."
      echo
      echo -ne "  ${BOLD}Re-run Apple Developer auto-setup anyway? [y/N]:${RESET} "
      read -r redo
      if [[ "${redo:-N}" =~ ^[Yy]$ ]]; then
        step_apple_login
        return $?
      fi
      return 0
    else
      warn "credentials.json exists but references missing files."
      info "Launching Apple Developer auto-setup..."
      step_apple_login
      return $?
    fi
  fi

  if [[ -d "$PROJECT_ROOT/credentials/ios" ]]; then
    local p12_file profile_file
    p12_file="$(find "$PROJECT_ROOT/credentials/ios" -iname '*.p12' -print -quit 2>/dev/null || true)"
    profile_file="$(find "$PROJECT_ROOT/credentials/ios" -iname '*.mobileprovision' -print -quit 2>/dev/null || true)"

    if [[ -n "$p12_file" && -n "$profile_file" ]]; then
      info "Auto-detected credentials:"
      info "  P12:     $p12_file"
      info "  Profile: $profile_file"

      if [[ -z "${P12_PASSWORD:-}" ]]; then
        echo -e "${YELLOW}Enter P12 password (or set P12_PASSWORD env):${RESET}"
        read -rs P12_PASSWORD
        export P12_PASSWORD
        echo
      fi

      P12_PASSWORD="$P12_PASSWORD" node "$SCRIPT_DIR/repair-ios-local-credentials.mjs" \
        --repair \
        --p12 "$p12_file" \
        --profile "$profile_file"
      success "credentials.json written."
      return 0
    fi
  fi

  warn "No credential files found locally."
  echo
  echo -e "  ${BOLD}How would you like to set up credentials?${RESET}"
  echo -e "  ${CYAN}1${RESET}  Apple Developer auto-setup  ${DIM}(login → fetch/create → download)${RESET}"
  echo -e "  ${CYAN}2${RESET}  Manual placement            ${DIM}(place .p12 + .mobileprovision in credentials/ios/)${RESET}"
  echo
  echo -ne "  ${BOLD}▸ Choose [1]:${RESET} "
  read -r cred_choice
  case "${cred_choice:-1}" in
    1) step_apple_login ;;
    2)
      echo
      echo -e "  ${DIM}Place your files in: credentials/ios/${RESET}"
      echo -e "  ${DIM}Then re-run this step.${RESET}"
      ;;
    *) warn "Invalid choice." ;;
  esac
}

# ─── Step 5b: Apple Developer Login & Auto Credentials ──────────────────────
step_apple_login() {
  header "5b · Apple Developer Login & Auto Credentials"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "Apple Developer credential management requires macOS."
    return 1
  fi

  if ! command -v fastlane >/dev/null 2>&1; then
    fail "fastlane is required for Apple Developer integration."
    echo -e "    ${DIM}Install: brew install fastlane${RESET}"
    return 1
  fi

  local cred_script="$SCRIPT_DIR/ios/apple_developer_credentials.sh"
  if [[ ! -f "$cred_script" ]]; then
    fail "Credential script not found: $cred_script"
    return 1
  fi
  "$cred_script"
}

# ─── Step 6: Build ───────────────────────────────────────────────────────────
step_build() {
  header "6 · EAS Local Build (profile: $BUILD_PROFILE)"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "iOS builds require macOS."
    return 1
  fi

  if ! command -v fastlane >/dev/null 2>&1; then
    fail "fastlane is required for local builds."
    return 1
  fi

  if [[ ! -f "$PROJECT_ROOT/credentials.json" ]]; then
    fail "credentials.json missing. Run credentials step first."
    return 1
  fi

  info "Cleaning npm cache for EAS..."
  rm -rf .npm-cache

  info "Checking build environment..."
  "$SCRIPT_DIR/check-ios-local-build-env.sh"

  info "Starting EAS local build..."
  # Some environments encounter issues computing the EAS project fingerprint
  # (e.g. "balanced is not a function"). Skip the automatic fingerprint step
  # to allow the local build to proceed. If fingerprinting is required, unset
  # EAS_SKIP_AUTO_FINGERPRINT in your environment.
  env NODE_ENV=production NPM_CONFIG_CACHE=.npm-cache EAS_SKIP_AUTO_FINGERPRINT=1 \
    npx eas build --profile "$BUILD_PROFILE" --platform ios --local
}

# ─── Step 7: Submit ──────────────────────────────────────────────────────────
step_submit() {
  header "7 · Submit to App Store Connect"

  local ipa_file
  ipa_file="$(find "$PROJECT_ROOT" -maxdepth 1 -name '*.ipa' -print -quit 2>/dev/null || true)"

  if [[ -z "$ipa_file" ]]; then
    ipa_file="$(find "$PROJECT_ROOT/build" -name '*.ipa' -print -quit 2>/dev/null || true)"
  fi

  if [[ -z "$ipa_file" ]]; then
    fail "No .ipa file found. Run the build step first."
    return 1
  fi

  info "Found IPA: $ipa_file"
  info "Submitting..."
  npx eas submit --platform ios --path "$ipa_file"
}

# ─── Step: Inspect Model ─────────────────────────────────────────────────────
step_inspect() {
  header "Inspect CoreML Model I/O"

  local MODEL_FILE
  MODEL_FILE="$(resolve_model_file "$MODEL_VARIANT")"
  local model_path="$MODEL_DEST/$MODEL_FILE"

  if [[ ! -d "$model_path" ]]; then
    fail "Model not found at: $model_path"
    return 1
  fi

  if ! python3 -c "import coremltools" 2>/dev/null; then
    fail "coremltools not installed."
    echo -e "    ${DIM}Install: python3 -m pip install --upgrade coremltools${RESET}"
    return 1
  fi

  python3 "$SCRIPT_DIR/coreml/inspect_coreml_io.py" "$model_path"
}

# ─── Step: Run Tests ─────────────────────────────────────────────────────────
step_test() {
  header "Run Tests"
  if command -v bun >/dev/null 2>&1; then
    bun run test
  else
    npx jest
  fi
}

# ─── Full Pipeline ───────────────────────────────────────────────────────────
run_full() {
  step_env
  step_deps
  step_model
  step_tokenizer
  step_credentials
  step_build
  step_submit
}

# ─── Interactive Menu ─────────────────────────────────────────────────────────
show_menu() {
  clear 2>/dev/null || true
  echo
  echo -e "${BOLD}  ╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}  ║   ${CYAN}Smart AI Assistant${RESET}${BOLD} — Build Workflow       ║${RESET}"
  echo -e "${BOLD}  ╚══════════════════════════════════════════════╝${RESET}"
  echo
  echo -e "  ${BOLD}Pipeline Steps${RESET}"
  echo -e "  ${CYAN}1${RESET}  Check environment"
  echo -e "  ${CYAN}2${RESET}  Install JS dependencies"
  echo -e "  ${CYAN}3${RESET}  Download CoreML model          ${DIM}[variant: $MODEL_VARIANT]${RESET}"
  echo -e "  ${CYAN}4${RESET}  Download tokenizer files"
  echo -e "  ${CYAN}5${RESET}  Setup iOS credentials"
  echo -e "  ${CYAN}6${RESET}  Build IPA locally               ${DIM}[profile: $BUILD_PROFILE]${RESET}"
  echo -e "  ${CYAN}7${RESET}  Submit to App Store Connect"
  echo
  echo -e "  ${BOLD}Apple Developer${RESET}"
  echo -e "  ${CYAN}d${RESET}  Apple Developer login & credentials  ${DIM}(auto fetch/create/download)${RESET}"
  echo
  echo -e "  ${BOLD}Utilities${RESET}"
  echo -e "  ${CYAN}i${RESET}  Inspect CoreML model I/O"
  echo -e "  ${CYAN}t${RESET}  Run tests"
  echo -e "  ${CYAN}f${RESET}  Full pipeline (1→7)"
  echo
  echo -e "  ${BOLD}Config${RESET}"
  echo -e "  ${CYAN}v${RESET}  Change model variant            ${DIM}[current: $MODEL_VARIANT]${RESET}"
  echo -e "  ${CYAN}p${RESET}  Change build profile            ${DIM}[current: $BUILD_PROFILE]${RESET}"
  echo
  echo -e "  ${CYAN}q${RESET}  Quit"
  echo
  echo -ne "  ${BOLD}▸ Choose:${RESET} "
}

select_variant() {
  echo
  echo -e "  ${BOLD}Select model variant:${RESET}"
  echo -e "  ${CYAN}1${RESET}  int4  ${DIM}(smallest, recommended for most devices)${RESET}"
  echo -e "  ${CYAN}2${RESET}  int8  ${DIM}(balanced quality/size)${RESET}"
  echo -e "  ${CYAN}3${RESET}  fp16  ${DIM}(highest quality, ~6GB)${RESET}"
  echo
  echo -ne "  ${BOLD}▸ Choose [1]:${RESET} "
  read -r choice
  case "${choice:-1}" in
    1) MODEL_VARIANT="int4" ;;
    2) MODEL_VARIANT="int8" ;;
    3) MODEL_VARIANT="fp16" ;;
    *) warn "Invalid choice, keeping: $MODEL_VARIANT" ;;
  esac
  success "Model variant set to: $MODEL_VARIANT"
}

select_profile() {
  echo
  echo -e "  ${BOLD}Select build profile:${RESET}"
  echo -e "  ${CYAN}1${RESET}  development  ${DIM}(dev client, internal distribution)${RESET}"
  echo -e "  ${CYAN}2${RESET}  preview      ${DIM}(internal distribution, no dev tools)${RESET}"
  echo -e "  ${CYAN}3${RESET}  production   ${DIM}(App Store distribution)${RESET}"
  echo
  echo -ne "  ${BOLD}▸ Choose [3]:${RESET} "
  read -r choice
  case "${choice:-3}" in
    1) BUILD_PROFILE="development" ;;
    2) BUILD_PROFILE="preview" ;;
    3) BUILD_PROFILE="production" ;;
    *) warn "Invalid choice, keeping: $BUILD_PROFILE" ;;
  esac
  success "Build profile set to: $BUILD_PROFILE"
}

interactive_loop() {
  while true; do
    show_menu
    read -r choice
    echo
    case "$choice" in
      1)  step_env ;;
      2)  step_deps ;;
      3)  step_model ;;
      4)  step_tokenizer ;;
      5)  step_credentials ;;
      6)  step_build ;;
      7)  step_submit ;;
      d)  step_apple_login ;;
      i)  step_inspect ;;
      t)  step_test ;;
      f)  run_full ;;
      v)  select_variant ;;
      p)  select_profile ;;
      q)  echo -e "  ${DIM}Bye!${RESET}"; exit 0 ;;
      *)  warn "Unknown option: $choice" ;;
    esac
    echo
    echo -ne "  ${DIM}Press Enter to return to menu...${RESET}"
    read -r
  done
}

# ─── CLI Argument Parsing ────────────────────────────────────────────────────
run_step() {
  case "$1" in
    env|check)        step_env ;;
    deps|install)     step_deps ;;
    model)            step_model ;;
    tokenizer|tok)    step_tokenizer ;;
    credentials|creds) step_credentials ;;
    apple-login|apple) step_apple_login ;;
    build)            step_build ;;
    submit)           step_submit ;;
    inspect)          step_inspect ;;
    test)             step_test ;;
    *) fail "Unknown step: $1"; echo "  Steps: env deps model tokenizer credentials apple-login build submit inspect test"; exit 1 ;;
  esac
}

main() {
  if [[ $# -eq 0 ]]; then
    interactive_loop
    return
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --full|-f)
        run_full
        shift
        ;;
      --step|-s)
        run_step "${2:?Missing step name after --step}"
        shift 2
        ;;
      --variant)
        MODEL_VARIANT="${2:?Missing variant after --variant}"
        shift 2
        ;;
      --profile)
        BUILD_PROFILE="${2:?Missing profile after --profile}"
        shift 2
        ;;
      --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  (no args)              Interactive menu"
        echo "  --full                 Run full pipeline (env → submit)"
        echo "  --step <name>          Run a single step"
        echo "    Steps: env deps model tokenizer credentials apple-login build submit inspect test"
        echo "  --variant <int4|int8|fp16>  Set model variant (default: int4)"
        echo "  --profile <name>       Set build profile (default: production)"
        echo
        echo "Environment variables:"
        echo "  HF_TOKEN        Hugging Face token (for gated/private repos)"
        echo "  P12_PASSWORD    iOS distribution certificate password"
        echo "  MODEL_VARIANT   Default model variant"
        echo "  BUILD_PROFILE   Default build profile"
        echo "  ASC_KEY_ID      App Store Connect API Key ID"
        echo "  ASC_ISSUER_ID   App Store Connect API Key Issuer ID"
        echo "  ASC_KEY_PATH    Path to .p8 API key file"
        echo "  APPLE_ID        Apple ID email (for Apple ID auth)"
        exit 0
        ;;
      *)
        run_step "$1"
        shift
        ;;
    esac
  done
}

main "$@"
