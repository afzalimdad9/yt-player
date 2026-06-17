#!/bin/bash
# Development startup script for YT Player
# Usage: ./scripts/dev.sh

set -euo pipefail

echo "🚀 Starting YT Player development environment..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}Error: $1 is not installed.${NC}"
    echo "Please install $1 and try again."
    exit 1
  fi
}

echo -e "${YELLOW}Checking prerequisites...${NC}"
check_command node
check_command pnpm
check_command docker
check_command ffmpeg
check_command yt-dlp

# Check Whisper (whisper.cpp or Python openai-whisper)
if command -v whisper-cli &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} whisper-cli"
elif python3 -c "import whisper" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} openai-whisper (Python)"
else
  echo -e "  ${YELLOW}⚠${NC} Whisper not found. Captions will use placeholder tracks."
  echo -e "  ${YELLOW}  Run ./scripts/setup-whisper.sh to install whisper.cpp${NC}"
fi

echo -e "${GREEN}✓ All prerequisites found${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Generate Prisma client
echo -e "${YELLOW}Generating Prisma client...${NC}"
pnpm db:generate
echo -e "${GREEN}✓ Prisma client generated${NC}"
echo ""

# Start Docker services
echo -e "${YELLOW}Starting Docker services (PostgreSQL, Redis, MinIO)...${NC}"
docker compose -f docker/docker-compose.yml up -d postgres redis minio minio-init
echo -e "${GREEN}✓ Docker services started${NC}"
echo ""

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 3

# Push Prisma schema
echo -e "${YELLOW}Pushing database schema...${NC}"
pnpm db:push
echo -e "${GREEN}✓ Database schema pushed${NC}"
echo ""

# Start dev servers
echo -e "${GREEN}Starting development servers...${NC}"
echo -e "${GREEN}  API:      http://localhost:4000${NC}"
echo -e "${GREEN}  Frontend: http://localhost:5173${NC}"
echo -e "${GREEN}  MinIO:    http://localhost:9001${NC}"
echo -e "${GREEN}  Redis:    localhost:6379${NC}"
echo -e "${GREEN}  PG:       localhost:5432${NC}"
echo ""

# Start in parallel
pnpm --parallel --filter @yt-player/api dev --filter @yt-player/web dev &
PID=$!

# Trap Ctrl+C
trap "echo 'Shutting down...'; kill $PID 2>/dev/null; docker compose -f docker/docker-compose.yml down; exit 0" SIGINT SIGTERM

# Wait for processes
wait $PID
