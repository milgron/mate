#!/bin/bash
# Auto-update script for Raspberry Pi
# Polls GitHub for changes and auto-deploys
#
# Usage: ./auto-update.sh [--daemon]
#   --daemon: Run continuously, checking every POLL_INTERVAL seconds
#
# Install as systemd service for automatic startup (see scripts/mate-updater.service)

set -e

# Configuration
REPO_DIR="${REPO_DIR:-$HOME/mate}"
DOCKER_DIR="${DOCKER_DIR:-$REPO_DIR/docker}"
POLL_INTERVAL="${POLL_INTERVAL:-60}"  # seconds
BRANCH="${BRANCH:-main}"
LOG_FILE="${LOG_FILE:-/tmp/mate-updater.log}"
TRIGGER_FILE="${TRIGGER_FILE:-/var/mate/update-trigger}"
LAST_TRIGGER=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} $1" | tee -a "$LOG_FILE"
}

check_for_updates() {
    cd "$REPO_DIR"

    # Fetch latest from remote
    git fetch origin "$BRANCH" --quiet

    # Compare local and remote
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse "origin/$BRANCH")

    if [ "$LOCAL" != "$REMOTE" ]; then
        return 0  # Updates available
    else
        return 1  # No updates
    fi
}

check_trigger_file() {
    # Check if trigger file exists and has new content
    if [ -f "$TRIGGER_FILE" ]; then
        CURRENT_TRIGGER=$(cat "$TRIGGER_FILE" 2>/dev/null || echo "")
        if [ -n "$CURRENT_TRIGGER" ] && [ "$CURRENT_TRIGGER" != "$LAST_TRIGGER" ]; then
            LAST_TRIGGER="$CURRENT_TRIGGER"
            return 0  # Triggered
        fi
    fi
    return 1  # Not triggered
}

deploy() {
    log "${YELLOW}📥 Pulling latest changes...${NC}"
    cd "$REPO_DIR"

    # Stash any local changes (like .env modifications)
    git stash --quiet 2>/dev/null || true

    # Pull latest
    git pull origin "$BRANCH" --quiet

    # Restore stashed changes
    git stash pop --quiet 2>/dev/null || true

    log "${YELLOW}🔨 Rebuilding Docker image...${NC}"
    cd "$DOCKER_DIR"
    docker compose build --quiet

    log "${YELLOW}🚀 Restarting container...${NC}"
    docker compose up -d

    # Wait for container to be healthy
    sleep 5

    if docker compose ps | grep -q "healthy\|running"; then
        log "${GREEN}✅ Deployment successful!${NC}"
        # Show recent logs
        docker compose logs --tail 5
        return 0
    else
        log "${RED}❌ Deployment failed!${NC}"
        docker compose logs --tail 20
        return 1
    fi
}

run_once() {
    log "🔍 Checking for updates..."

    if check_for_updates; then
        log "${GREEN}📦 Updates found! Deploying...${NC}"
        deploy
    else
        log "✓ Already up to date"
    fi
}

run_daemon() {
    log "🤖 Starting auto-updater daemon (checking every ${POLL_INTERVAL}s)"
    log "📁 Watching trigger file: $TRIGGER_FILE"

    # Ensure trigger directory exists
    mkdir -p "$(dirname "$TRIGGER_FILE")" 2>/dev/null || true

    while true; do
        # Check for manual trigger from bot
        if check_trigger_file; then
            log "${GREEN}🔔 Update triggered by bot! Deploying...${NC}"
            deploy
        # Check for git updates
        elif check_for_updates; then
            log "${GREEN}📦 Updates found! Deploying...${NC}"
            deploy
        fi
        sleep "$POLL_INTERVAL"
    done
}

# Ensure repo exists
if [ ! -d "$REPO_DIR/.git" ]; then
    log "${RED}Error: $REPO_DIR is not a git repository${NC}"
    log "Clone the repo first: git clone <repo-url> $REPO_DIR"
    exit 1
fi

# Parse arguments
case "${1:-}" in
    --daemon|-d)
        run_daemon
        ;;
    --help|-h)
        echo "Usage: $0 [--daemon]"
        echo ""
        echo "Options:"
        echo "  --daemon, -d  Run continuously, checking every POLL_INTERVAL seconds"
        echo "  --help, -h    Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  REPO_DIR       Path to repo (default: ~/mate)"
        echo "  POLL_INTERVAL  Seconds between checks (default: 60)"
        echo "  BRANCH         Git branch to track (default: main)"
        ;;
    *)
        run_once
        ;;
esac
