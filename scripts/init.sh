#!/bin/bash
#
# Development Environment Initialization Script (Unix/macOS/Linux)
# This script is called by the agent to set up and start the development server.
#
# Usage: ./scripts/init.sh [options]
#   --install    Run npm install before starting
#   --build      Run build before starting
#   --test       Run tests instead of dev server
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         Development Environment Initialization                  ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"

# Parse arguments
INSTALL=false
BUILD=false
TEST=false

for arg in "$@"; do
  case $arg in
    --install)
      INSTALL=true
      shift
      ;;
    --build)
      BUILD=true
      shift
      ;;
    --test)
      TEST=true
      shift
      ;;
  esac
done

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: package.json not found. Are you in the project root?${NC}"
  exit 1
fi

# Install dependencies if requested or if node_modules doesn't exist
if [ "$INSTALL" = true ] || [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  npm install
fi

# Run build if requested
if [ "$BUILD" = true ]; then
  echo -e "${YELLOW}Building project...${NC}"
  npm run build
fi

# Run tests if requested
if [ "$TEST" = true ]; then
  echo -e "${YELLOW}Running tests...${NC}"
  npm test
  exit $?
fi

# Start development server
echo -e "${GREEN}Starting development server...${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

# Check for common dev server scripts
if npm run 2>&1 | grep -q "dev"; then
  npm run dev
elif npm run 2>&1 | grep -q "start"; then
  npm start
else
  echo -e "${RED}Error: No 'dev' or 'start' script found in package.json${NC}"
  echo -e "${YELLOW}Available scripts:${NC}"
  npm run
  exit 1
fi
