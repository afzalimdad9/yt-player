#!/usr/bin/env bash
# =============================================================================
# Whisper Setup Script for YT Player
# =============================================================================
#
# Installs whisper.cpp, downloads a GGML model, and configures everything
# for the YT Player video processing pipeline.
#
# Usage:
#   ./scripts/setup-whisper.sh                    # Interactive (prompts for model)
#   ./scripts/setup-whisper.sh --model base        # Download base model
#   ./scripts/setup-whisper.sh --model large-v3    # Download large model
#   ./scripts/setup-whisper.sh --python-only       # Skip whisper.cpp, use Python
#   ./scripts/setup-whisper.sh --no-python         # Skip Python, only whisper.cpp
#   ./scripts/setup-whisper.sh --skip-build        # Only download model, skip build
#   ./scripts/setup-whisper.sh --help              # Show help
#
# Requirements:
#   - macOS:  brew, xcode-select (will install cmake via brew)
#   - Linux:  sudo access (will install build tools via apt/dnf/pacman)
#   - ffmpeg: Must be installed separately (checked but not installed here)
#
# Output:
#   - whisper.cpp binary at:  ./whisper.cpp/build/bin/whisper-cli
#   - Symlink at:             /usr/local/bin/whisper-cli (requires sudo)
#   - Models at:              ~/.cache/whisper/models/
#   - Env file:               .env.whisper (sourced by dev.sh)
# =============================================================================

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Defaults ──────────────────────────────────────────────────────────────────
WHISPER_CPP_REPO="https://github.com/ggml-org/whisper.cpp.git"
WHISPER_CPP_DIR="./whisper.cpp"
WHISPER_CPP_BRANCH="master"
MODELS_DIR="${WHISPER_MODELS_DIR:-$HOME/.cache/whisper/models}"
INSTALL_DIR="/usr/local/bin"
MODEL_CHOICE="base"
DO_BUILD=true
DO_PYTHON=true
SKIP_BUILD=false
INTERACTIVE=false

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)
      MODEL_CHOICE="$2"
      shift 2
      ;;
    --model=*)
      MODEL_CHOICE="${1#*=}"
      shift
      ;;
    --python-only)
      DO_BUILD=false
      DO_PYTHON=true
      shift
      ;;
    --no-python)
      DO_PYTHON=false
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --interactive)
      INTERACTIVE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --model <name>       Model to download (tiny, base, small, medium, large-v3, large-v3-turbo)"
      echo "  --python-only        Skip whisper.cpp build, use Python openai-whisper instead"
      echo "  --no-python          Skip Python openai-whisper installation"
      echo "  --skip-build         Skip building whisper.cpp, only download model"
      echo "  --interactive        Ask before each step"
      echo "  --help, -h           Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 --help"
      exit 1
      ;;
  esac
done

# ── Utility Functions ────────────────────────────────────────────────────────

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}   $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[FAIL]${NC} $*"; }
log_step()    { echo ""; echo -e "${CYAN}━━━ $* ━━━${NC}"; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    return 1
  fi
  return 0
}

confirm() {
  local prompt="$1"
  local default="${2:-y}"
  if [[ "$INTERACTIVE" != "true" ]]; then
    return 0
  fi
  local answer
  read -r -p "$prompt [${default}] " answer
  answer="${answer:-$default}"
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

run_with_spinner() {
  local msg="$1"
  shift
  echo -n "  $msg ... "
  if "$@" &>/tmp/whisper-setup.log; then
    echo -e "${GREEN}done${NC}"
  else
    echo -e "${RED}FAILED${NC}"
    echo ""
    echo -e "${YELLOW}Last 20 lines of log:${NC}"
    tail -20 /tmp/whisper-setup.log 2>/dev/null || true
    echo ""
    log_error "Command failed. Check /tmp/whisper-setup.log for details."
    return 1
  fi
}

detect_os() {
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "macos"
  elif [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "$ID"
  elif [[ -f /etc/debian_version ]]; then
    echo "debian"
  elif [[ -f /etc/redhat-release ]]; then
    echo "rhel"
  else
    echo "linux"
  fi
}

# ── Main Script ──────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Whisper Setup for YT Player                         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

OS="$(detect_os)"
log_info "Detected OS: ${OS}"
log_info "Model:       ${MODEL_CHOICE}"
log_info "Models dir:  ${MODELS_DIR}"
[[ "$DO_BUILD" == "true" ]] && log_info "whisper.cpp: Build from source"
[[ "$DO_PYTHON" == "true" ]] && log_info "Python:      openai-whisper fallback"
echo ""

# ── Step 1: Check prerequisites ──────────────────────────────────────────────
log_step "Step 1/6: Checking prerequisites"

PREREQ_OK=true

# Check git
if ! check_command git; then
  log_error "git is required but not installed."
  PREREQ_OK=false
fi

# Check ffmpeg (required for audio conversion)
if check_command ffmpeg; then
  log_success "ffmpeg found: $(ffmpeg -version 2>&1 | head -1)"
else
  log_warn "ffmpeg not found. Install it:"
  case "$OS" in
    ubuntu|debian) log_warn "  sudo apt install ffmpeg" ;;
    rhel|centos|fedora) log_warn "  sudo dnf install ffmpeg" ;;
    macos) log_warn "  brew install ffmpeg" ;;
    *) log_warn "  Install ffmpeg via your package manager" ;;
  esac
  log_warn "Audio conversion will fail without ffmpeg."
  if confirm "Continue anyway?" "n"; then
    log_warn "Skipping ffmpeg check..."
  else
    PREREQ_OK=false
  fi
fi

# Check for C compiler (needed to build whisper.cpp)
if [[ "$DO_BUILD" == "true" ]]; then
  if check_command cmake; then
    log_success "cmake found: $(cmake --version 2>&1 | head -1)"
  else
    case "$OS" in
      ubuntu|debian)
        log_info "Installing build dependencies (apt)..."
        run_with_spinner "Installing cmake, build-essential" \
          sudo apt-get update -qq && sudo apt-get install -y -qq cmake build-essential
        ;;
      rhel|centos|fedora)
        log_info "Installing build dependencies (dnf)..."
        run_with_spinner "Installing cmake, gcc, g++" \
          sudo dnf install -y cmake gcc gcc-c++
        ;;
      macos)
        if ! check_command xcode-select; then
          log_info "Installing Xcode command line tools..."
          xcode-select --install 2>/dev/null || true
          log_info "Please complete the Xcode CLI tools installation and re-run."
        fi
        if ! check_command cmake; then
          log_info "Installing cmake via Homebrew..."
          run_with_spinner "Installing cmake" brew install cmake
        fi
        ;;
      *)
        log_error "Unsupported OS for automatic cmake installation."
        log_error "Please install cmake and build-essential manually."
        PREREQ_OK=false
        ;;
    esac
  fi

  # Verify cmake is now available
  if ! check_command cmake; then
    log_error "cmake is still not available after installation attempt."
    PREREQ_OK=false
  fi
fi

if [[ "$PREREQ_OK" != "true" ]]; then
  log_error "Prerequisites not met. Aborting."
  exit 1
fi

# ── Step 2: Clone or update whisper.cpp ──────────────────────────────────────
if [[ "$DO_BUILD" == "true" && "$SKIP_BUILD" != "true" ]]; then
  log_step "Step 2/6: Getting whisper.cpp source"

  if [[ -d "$WHISPER_CPP_DIR" ]]; then
    log_info "whisper.cpp directory exists. Updating..."
    run_with_spinner "Updating repository" \
      bash -c "cd '$WHISPER_CPP_DIR' && git fetch origin && git checkout $WHISPER_CPP_BRANCH && git pull"
  else
    run_with_spinner "Cloning whisper.cpp" \
      git clone --depth 1 --branch "$WHISPER_CPP_BRANCH" "$WHISPER_CPP_REPO" "$WHISPER_CPP_DIR"
  fi
  log_success "whisper.cpp source ready"
else
  log_step "Step 2/6: Getting whisper.cpp source"
  log_info "Skipping (--skip-build or --python-only)"
fi

# ── Step 3: Build whisper.cpp ────────────────────────────────────────────────
WHISPER_BINARY=""
if [[ "$DO_BUILD" == "true" && "$SKIP_BUILD" != "true" ]]; then
  log_step "Step 3/6: Building whisper.cpp"

  cd "$WHISPER_CPP_DIR"

  log_info "Configuring with cmake..."
  run_with_spinner "cmake configure" cmake -B build -DCMAKE_BUILD_TYPE=Release

  CPU_COUNT="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"
  log_info "Building with ${CPU_COUNT} threads..."
  run_with_spinner "cmake build (${CPU_COUNT} threads)" cmake --build build -j "${CPU_COUNT}"

  cd ..

  # Find the built binary
  if [[ -f "$WHISPER_CPP_DIR/build/bin/whisper-cli" ]]; then
    WHISPER_BINARY="$WHISPER_CPP_DIR/build/bin/whisper-cli"
  elif [[ -f "$WHISPER_CPP_DIR/build/bin/whisper" ]]; then
    WHISPER_BINARY="$WHISPER_CPP_DIR/build/bin/whisper"
  fi

  if [[ -n "$WHISPER_BINARY" ]]; then
    log_success "whisper.cpp built: ${WHISPER_BINARY}"
    $WHISPER_BINARY --help 2>&1 | head -3 || true
  else
    log_error "Build succeeded but binary not found!"
    log_error "Looked in: $WHISPER_CPP_DIR/build/bin/"
    ls -la "$WHISPER_CPP_DIR/build/bin/" 2>/dev/null || true
    exit 1
  fi
else
  log_step "Step 3/6: Building whisper.cpp"
  log_info "Skipping build step"

  # Try to find an existing binary
  if [[ -f "$WHISPER_CPP_DIR/build/bin/whisper-cli" ]]; then
    WHISPER_BINARY="$WHISPER_CPP_DIR/build/bin/whisper-cli"
  elif check_command whisper-cli; then
    WHISPER_BINARY="$(which whisper-cli)"
  elif check_command whisper; then
    WHISPER_BINARY="$(which whisper)"
  fi

  if [[ -n "$WHISPER_BINARY" ]]; then
    log_info "Found existing binary: ${WHISPER_BINARY}"
  else
    log_info "No whisper.cpp binary found (expected if using --python-only)"
  fi
fi

# ── Step 4: Install binary system-wide ───────────────────────────────────────
if [[ -n "$WHISPER_BINARY" ]]; then
  log_step "Step 4/6: Installing whisper.cpp binary"

  # Check if it's already in PATH
  if check_command whisper-cli; then
    log_success "whisper-cli already in PATH: $(which whisper-cli)"
  else
    # Create a symlink in /usr/local/bin
    if [[ -w "$INSTALL_DIR" ]] || confirm "Install binary to ${INSTALL_DIR} (requires sudo)?"; then
      if [[ -w "$INSTALL_DIR" ]]; then
        run_with_spinner "Linking to ${INSTALL_DIR}/whisper-cli" \
          ln -sf "$(realpath "$WHISPER_BINARY")" "${INSTALL_DIR}/whisper-cli"
        log_success "whisper-cli installed to ${INSTALL_DIR}/whisper-cli"
      else
        run_with_spinner "Linking to ${INSTALL_DIR}/whisper-cli (sudo)" \
          sudo ln -sf "$(realpath "$WHISPER_BINARY")" "${INSTALL_DIR}/whisper-cli"
        log_success "whisper-cli installed to ${INSTALL_DIR}/whisper-cli (requires sudo)"
      fi
    else
      log_info "Skipping system install. Binary is at: ${WHISPER_BINARY}"
      log_info "  Add to your PATH or set: export WHISPER_CPP_PATH=\"${WHISPER_BINARY}\""
    fi
  fi
fi

# ── Step 5: Download model ──────────────────────────────────────────────────
log_step "Step 5/6: Downloading Whisper model"

# Valid models and their HuggingFace filenames
declare -A MODEL_FILES
MODEL_FILES["tiny"]="ggml-tiny.bin"
MODEL_FILES["tiny.en"]="ggml-tiny.en.bin"
MODEL_FILES["base"]="ggml-base.bin"
MODEL_FILES["base.en"]="ggml-base.en.bin"
MODEL_FILES["small"]="ggml-small.bin"
MODEL_FILES["small.en"]="ggml-small.en.bin"
MODEL_FILES["medium"]="ggml-medium.bin"
MODEL_FILES["large-v3"]="ggml-large-v3.bin"
MODEL_FILES["large-v3-turbo"]="ggml-large-v3-turbo.bin"

# Validate model choice
if [[ -z "${MODEL_FILES[$MODEL_CHOICE]:-}" ]]; then
  log_error "Unknown model: ${MODEL_CHOICE}"
  echo "  Valid models: ${!MODEL_FILES[*]}"
  echo ""
  log_info "Pick a model:"
  log_info "  tiny / tiny.en    - 75MB  (fastest, least accurate)"
  log_info "  base / base.en    - 142MB (good for most use cases)"
  log_info "  small / small.en  - 466MB (better accuracy)"
  log_info "  medium            - 1.5GB (high accuracy)"
  log_info "  large-v3          - 3.1GB (most accurate)"
  log_info "  large-v3-turbo    - 1.6GB (fast + accurate)"
  echo ""

  if [[ "$INTERACTIVE" == "true" ]]; then
    read -r -p "Model name: " MODEL_CHOICE
    if [[ -z "${MODEL_FILES[$MODEL_CHOICE]:-}" ]]; then
      log_error "Invalid model. Using 'base'."
      MODEL_CHOICE="base"
    fi
  else
    MODEL_CHOICE="base"
    log_info "Falling back to 'base' model."
  fi
fi

MODEL_FILE="${MODEL_FILES[$MODEL_CHOICE]}"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}"

# Create models directory
mkdir -p "$MODELS_DIR"

# Download model if not already present
if [[ -f "${MODELS_DIR}/${MODEL_FILE}" ]]; then
  log_success "Model already downloaded: ${MODELS_DIR}/${MODEL_FILE}"
else
  log_info "Downloading ${MODEL_CHOICE} model (${MODEL_URL})..."
  echo ""

  # Use wget or curl with progress
  if check_command wget; then
    wget -O "${MODELS_DIR}/${MODEL_FILE}" "$MODEL_URL" 2>&1 | \
      while IFS= read -r line; do
        if [[ "$line" =~ ([0-9]+%) ]]; then
          echo -ne "\r  Downloading: ${BASH_REMATCH[1]}"
        fi
      done
    echo ""
  elif check_command curl; then
    echo "  Downloading..."
    curl -L -o "${MODELS_DIR}/${MODEL_FILE}" "$MODEL_URL" --progress-bar
  else
    log_error "Neither wget nor curl is available. Cannot download model."
    exit 1
  fi

  # Verify download
  if [[ -f "${MODELS_DIR}/${MODEL_FILE}" ]]; then
    local_size=$(stat -f%z "${MODELS_DIR}/${MODEL_FILE}" 2>/dev/null || stat -c%s "${MODELS_DIR}/${MODEL_FILE}" 2>/dev/null || echo 0)
    log_success "Model downloaded: ${MODEL_CHOICE} ($(( local_size / 1024 / 1024 ))MB)"
  else
    log_error "Download failed. Check network and try again."
    exit 1
  fi
fi

# Set environment variables
WHISPER_CPP_SYMLINK=""
if check_command whisper-cli; then
  WHISPER_CPP_SYMLINK="$(which whisper-cli)"
fi

# ── Step 6: Set up Python openai-whisper (fallback) ──────────────────────────
if [[ "$DO_PYTHON" == "true" ]]; then
  log_step "Step 6/6: Setting up Python openai-whisper (fallback)"

  if ! check_command python3; then
    log_warn "Python 3 not found. Skipping Python whisper setup."
    log_warn "Install Python 3 to use the openai-whisper fallback."
  else
    log_info "Python 3 found: $(python3 --version)"

    if python3 -c "import whisper; print(whisper.__version__)" 2>/dev/null; then
      PY_VER=$(python3 -c "import whisper; print(whisper.__version__)" 2>/dev/null)
      log_success "openai-whisper already installed: ${PY_VER}"
    else
      log_info "Installing openai-whisper (pip)..."
      if confirm "Install openai-whisper via pip?" "y"; then
        run_with_spinner "pip install openai-whisper" \
          pip3 install openai-whisper --no-cache-dir 2>&1 | tail -5
        if python3 -c "import whisper; print(whisper.__version__)" 2>/dev/null; then
          log_success "openai-whisper installed successfully"
        else
          log_warn "openai-whisper installation may have issues."
        fi
      else
        log_info "Skipping Python whisper installation."
      fi
    fi
  fi
fi

# ── Generate .env.whisper ──────────────────────────────────────────────────
echo ""
log_step "Generating environment file"

ENV_FILE=".env.whisper"
cat > "$ENV_FILE" << ENVEOF
# Whisper configuration (auto-generated by setup-whisper.sh)
# Source this file in your shell or it will be loaded by dev.sh

export WHISPER_MODEL="${MODEL_CHOICE}"
export WHISPER_MODELS_DIR="${MODELS_DIR}"
export WHISPER_CPP_PATH="${WHISPER_CPP_SYMLINK:-${WHISPER_BINARY:-}}"
ENVEOF

# Only add WHISPER_CPP_PATH if it's set
if [[ -n "${WHISPER_BINARY:-}" || -n "${WHISPER_CPP_SYMLINK:-}" ]]; then
  echo "export WHISPER_CPP_PATH=\"${WHISPER_CPP_SYMLINK:-${WHISPER_BINARY:-}}\"" >> "$ENV_FILE"
fi

log_success "Environment file created: ${ENV_FILE}"
echo ""
echo "  Contents:"
cat "$ENV_FILE" | sed 's/^/    /'

# ── Verify ───────────────────────────────────────────────────────────────────
echo ""
log_step "Verification"

VERIFY_OK=true

# Test whisper.cpp if available
WHISPER_TEST=""
if [[ -n "${WHISPER_BINARY:-}" ]]; then
  WHISPER_TEST="$WHISPER_BINARY"
elif check_command whisper-cli; then
  WHISPER_TEST="$(which whisper-cli)"
fi

if [[ -n "$WHISPER_TEST" ]]; then
  if "$WHISPER_TEST" --help 2>&1 | head -1 &>/dev/null; then
    log_success "whisper.cpp binary is working: ${WHISPER_TEST}"
  else
    log_warn "whisper.cpp binary may have issues: ${WHISPER_TEST}"
    VERIFY_OK=false
  fi
else
  log_warn "whisper.cpp binary not found in PATH."
  log_warn "  The pipeline will fall back to Python openai-whisper."
fi

# Test model file
if [[ -f "${MODELS_DIR}/${MODEL_FILE}" ]]; then
  model_size=$(stat -f%z "${MODELS_DIR}/${MODEL_FILE}" 2>/dev/null || stat -c%s "${MODELS_DIR}/${MODEL_FILE}" 2>/dev/null || echo 0)
  log_success "Model file exists: ${MODELS_DIR}/${MODEL_FILE} ($(( model_size / 1024 / 1024 ))MB)"
else
  log_error "Model file missing: ${MODELS_DIR}/${MODEL_FILE}"
  VERIFY_OK=false
fi

# Test Python whisper
if [[ "$DO_PYTHON" == "true" ]]; then
  if python3 -c "import whisper" 2>/dev/null; then
    log_success "Python openai-whisper is available (fallback)"
  else
    log_info "Python openai-whisper not installed (pipeline will use whisper.cpp only)"
  fi
fi

# Test ffmpeg
if check_command ffmpeg; then
  log_success "ffmpeg is available"
else
  log_warn "ffmpeg not found! Audio conversion will fail."
  log_warn "Install: sudo apt install ffmpeg  |  brew install ffmpeg"
  VERIFY_OK=false
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
if [[ "$VERIFY_OK" == "true" ]]; then
  echo -e "${CYAN}║           ${GREEN}Whisper setup complete!${CYAN}                              ║${NC}"
else
  echo -e "${CYAN}║           ${YELLOW}Whisper setup finished with warnings${CYAN}                  ║${NC}"
fi
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Model:${NC}       ${MODEL_CHOICE}"
echo -e "  ${BLUE}Models dir:${NC}  ${MODELS_DIR}"
echo -e "  ${BLUE}Binary:${NC}      ${WHISPER_TEST:-Not found (using Python fallback)}"
echo -e "  ${BLUE}Env file:${NC}    ${ENV_FILE}"

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  echo ""
  echo -e "  ${YELLOW}To load the environment:${NC}"
  echo -e "    source ${ENV_FILE}"
  echo ""
  echo -e "  ${YELLOW}Or run dev.sh which auto-sources it:${NC}"
  echo -e "    ./scripts/dev.sh"
fi

echo ""

# ── Quick test section ──────────────────────────────────────────────────────
if confirm "Run a quick transcription test?" "n"; then
  echo ""
  log_info "Generating a 5-second test audio file..."

  # Generate a test tone
  if check_command ffmpeg; then
    TEST_FILE="/tmp/whisper-test.wav"
    ffmpeg -f lavfi -i "sine=frequency=440:duration=5" -ar 16000 -ac 1 "$TEST_FILE" -y 2>/dev/null

    if [[ -f "$TEST_FILE" ]]; then
      echo ""
      if [[ -n "${WHISPER_TEST:-}" ]]; then
        log_info "Running whisper.cpp on test file..."
        MODEL_PATH="${MODELS_DIR}/${MODEL_FILE}"
        if [[ -f "$MODEL_PATH" ]]; then
          $WHISPER_TEST -m "$MODEL_PATH" -f "$TEST_FILE" -otxt 2>&1 | tail -10
          echo ""
          log_success "Transcription test complete!"
        fi
      fi

      if python3 -c "import whisper" 2>/dev/null; then
        log_info "Running Python whisper on test file..."
        python3 -c "
import whisper
model = whisper.load_model('tiny')
result = model.transcribe('/tmp/whisper-test.wav')
print('Detected language:', result.get('language'))
print('Text:', result['text'][:100] if result.get('text') else 'No text')
" 2>&1
        echo ""
        log_success "Python whisper test complete!"
      fi

      rm -f "$TEST_FILE"
    fi
  else
    log_warn "ffmpeg not available. Skipping test."
  fi
fi

echo ""
log_info "Done. Happy transcribing! 🎤"
