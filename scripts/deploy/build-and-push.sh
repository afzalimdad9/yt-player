#!/usr/bin/env bash
# =============================================================================
# Build & Push Docker Images to ECR
# =============================================================================
#
# Builds the API, Worker, and Web Docker images and pushes them to Amazon ECR.
# Used by CI/CD and for manual deployments.
#
# Usage:
#   ./scripts/deploy/build-and-push.sh                           # Auto-detect tag from git
#   ./scripts/deploy/build-and-push.sh --tag v1.2.3             # Specific tag
#   ./scripts/deploy/build-and-push.sh --region us-west-2       # Custom region
#   ./scripts/deploy/build-and-push.sh --services api worker    # Subset of services
#   ./scripts/deploy/build-and-push.sh --no-push                # Build only, no push
#   ./scripts/deploy/build-and-push.sh --help                   # Show help
#
# Requirements:
#   - AWS CLI v2 (configured with ECR push permissions)
#   - Docker
#   - jq (for JSON parsing, optional)
#
# Environment variables:
#   AWS_REGION          - AWS region (default: us-east-1)
#   IMAGE_TAG           - Docker image tag (default: git rev-parse --short HEAD)
#   SKIP_WEB            - Set to "true" to skip building the web image
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
REGION="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${IMAGE_TAG:-}"
DO_PUSH=true
SERVICES=()
VALID_SERVICES=("api" "worker" "web")

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag|--image-tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --tag=*)
      IMAGE_TAG="${1#*=}"
      shift
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --region=*)
      REGION="${1#*=}"
      shift
      ;;
    --services)
      # Read remaining args until next flag or end
      shift
      while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
        SERVICES+=("$1")
        shift
      done
      ;;
    --no-push)
      DO_PUSH=false
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Build and push Docker images to Amazon ECR."
      echo ""
      echo "Options:"
      echo "  --tag, --image-tag <name>   Image tag (default: git short SHA)"
      echo "  --region <region>           AWS region (default: \$AWS_REGION or us-east-1)"
      echo "  --services <svc1> [svc2..]  Services to build: api worker web (default: all)"
      echo "  --no-push                   Build only, skip pushing to ECR"
      echo "  --help, -h                  Show this help"
      echo ""
      echo "Environment:"
      echo "  AWS_REGION     AWS region override"
      echo "  IMAGE_TAG      Image tag override"
      echo "  SKIP_WEB       Set to 'true' to skip building the web image"
      echo ""
      echo "Examples:"
      echo "  $0                                          # Build & push all with git SHA"
      echo "  $0 --tag v1.2.3 --no-push                   # Build only with specific tag"
      echo "  $0 --services api worker                     # Only API and Worker"
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

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[FAIL]${NC}  $*"; }
log_step()    { echo ""; echo -e "${CYAN}━━━ $* ━━━${NC}"; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    log_error "$1 is required but not installed."
    return 1
  fi
  return 0
}

# ── Pre-flight Checks ────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Build & Push Docker Images to ECR                    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

log_info "Region: ${REGION}"

# Check prerequisites
PREREQ_OK=true
check_command docker || PREREQ_OK=false
check_command aws || PREREQ_OK=false

if ! aws sts get-caller-identity &>/dev/null; then
  log_error "AWS CLI is not configured. Run 'aws configure' first."
  PREREQ_OK=false
fi

if [[ "$PREREQ_OK" != "true" ]]; then
  exit 1
fi

# ── Resolve Account ID and ECR Base ──────────────────────────────────────────
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
log_info "Account: ${ACCOUNT_ID}"
log_info "ECR:     ${ECR_BASE}"

# ── Resolve Image Tag ────────────────────────────────────────────────────────
if [[ -z "$IMAGE_TAG" ]]; then
  if git rev-parse --short HEAD &>/dev/null; then
    IMAGE_TAG=$(git rev-parse --short HEAD)
    log_info "Tag:     ${IMAGE_TAG} (from git)"
  else
    IMAGE_TAG="latest"
    log_warn "Not a git repository. Using tag: ${IMAGE_TAG}"
  fi
else
  log_info "Tag:     ${IMAGE_TAG} (from argument)"
fi

# ── Determine which services to build ────────────────────────────────────────
if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=("api" "worker" "web")
  # Respect SKIP_WEB env var
  if [[ "${SKIP_WEB:-}" == "true" ]]; then
    SERVICES=("api" "worker")
    log_info "Skipping web (SKIP_WEB=true)"
  fi
fi

log_info "Services: ${SERVICES[*]}"

# Validate service names
for svc in "${SERVICES[@]}"; do
  valid=false
  for valid_svc in "${VALID_SERVICES[@]}"; do
    if [[ "$svc" == "$valid_svc" ]]; then
      valid=true
      break
    fi
  done
  if [[ "$valid" != "true" ]]; then
    log_error "Invalid service: ${svc}. Valid options: ${VALID_SERVICES[*]}"
    exit 1
  fi
done

# ── Login to ECR ─────────────────────────────────────────────────────────────
log_step "Logging in to Amazon ECR"
log_info "Logging in to ${ECR_BASE}..."

if aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_BASE" &>/dev/null; then
  log_success "ECR login successful"
else
  log_error "ECR login failed. Check your AWS credentials and permissions."
  exit 1
fi

# ── Build Images ─────────────────────────────────────────────────────────────
log_step "Building Docker images"

# Track success/failure per service
declare -A BUILD_STATUS

build_service() {
  local svc="$1"
  local dockerfile="docker/Dockerfile.${svc}"
  local repo="${ECR_BASE}/yt-player/${svc}"
  local tag_sha="${repo}:${IMAGE_TAG}"
  local tag_latest="${repo}:latest"

  if [[ ! -f "$dockerfile" ]]; then
    log_error "Dockerfile not found: ${dockerfile}"
    BUILD_STATUS["$svc"]="FAILED"
    return 1
  fi

  echo ""
  log_info "Building ${svc}..."
  log_info "  Dockerfile: ${dockerfile}"
  log_info "  Tags:       ${tag_sha}"
  log_info "  Tags:       ${tag_latest}"

  if docker build \
    -f "$dockerfile" \
    -t "$tag_sha" \
    -t "$tag_latest" \
    . 2>&1 | while IFS= read -r line; do
      # Collapse Docker build output to a single progress line
      if [[ "$line" =~ ^#([0-9]+)\ building ]]; then
        echo -ne "\r  Step ${BASH_REMATCH[1]} ... "
      fi
    done; then
    echo -e "\r  ${GREEN}✓${NC} Build complete"
    BUILD_STATUS["$svc"]="OK"
    return 0
  else
    echo -e "\r  ${RED}✗${NC} Build failed"
    BUILD_STATUS["$svc"]="FAILED"
    return 1
  fi
}

for svc in "${SERVICES[@]}"; do
  build_service "$svc"
done

# Check if any builds failed
ANY_FAILED=false
for svc in "${SERVICES[@]}"; do
  if [[ "${BUILD_STATUS[$svc]}" == "FAILED" ]]; then
    ANY_FAILED=true
  fi
done

if [[ "$ANY_FAILED" == "true" ]]; then
  echo ""
  log_error "One or more builds failed. Aborting."
  for svc in "${SERVICES[@]}"; do
    echo -e "  ${svc}: ${BUILD_STATUS[$svc]}"
  done
  exit 1
fi

log_success "All builds completed successfully"

# ── Push Images ──────────────────────────────────────────────────────────────
if [[ "$DO_PUSH" == "true" ]]; then
  log_step "Pushing images to Amazon ECR"

  for svc in "${SERVICES[@]}"; do
    repo="${ECR_BASE}/yt-player/${svc}"

    echo ""
    log_info "Pushing ${svc}..."

    # Push SHA tag
    log_info "  → ${repo}:${IMAGE_TAG}"
    if docker push "${repo}:${IMAGE_TAG}"; then
      log_success "  ✓ ${IMAGE_TAG} pushed"
    else
      log_error "Push failed for ${repo}:${IMAGE_TAG}"
      exit 1
    fi

    # Push latest tag
    log_info "  → ${repo}:latest"
    if docker push "${repo}:latest"; then
      log_success "  ✓ latest pushed"
    else
      log_error "Push failed for ${repo}:latest"
      exit 1
    fi
  done

  log_success "All images pushed successfully"
else
  log_step "Skipping push (--no-push)"
  log_info "Images are available locally:"
  for svc in "${SERVICES[@]}"; do
    echo "  ${ECR_BASE}/yt-player/${svc}:${IMAGE_TAG}"
  done
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           ${GREEN}Build complete!${CYAN}                                        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

for svc in "${SERVICES[@]}"; do
  echo -e "  ${GREEN}✓${NC} yt-player/${svc}:${IMAGE_TAG}"
done

echo ""
if [[ "$DO_PUSH" == "true" ]]; then
  echo -e "  ${BLUE}Pushed to:${NC} ${ECR_BASE}"
fi
echo ""
