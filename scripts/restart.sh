#!/bin/bash
set -e

PI_HOST="ale@alfajor.local"
PROJECT_PATH="/Users/ale/Desktop/projects/jarvis"
PI_PROJECT_PATH="~/jarvis"

echo "📤 Syncing .env to Pi..."
scp "$PROJECT_PATH/.env" "$PI_HOST:$PI_PROJECT_PATH/"

echo "🔄 Restarting container..."
ssh "$PI_HOST" "cd $PI_PROJECT_PATH/docker && docker compose restart"

echo "📋 Checking logs..."
sleep 3
ssh "$PI_HOST" "cd $PI_PROJECT_PATH/docker && docker compose logs --tail 5"

echo "✅ Restart complete!"
