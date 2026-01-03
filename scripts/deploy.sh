#!/bin/bash
set -e

PI_HOST="tomas@mate.local"
PROJECT_PATH="$(cd "$(dirname "$0")/.." && pwd)"
PI_PROJECT_PATH="~/mate"

echo "🧪 Running tests..."
cd "$PROJECT_PATH"
npm run test:run

echo "✅ Tests passed!"

echo "📦 Syncing to Pi..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'coverage' \
  "$PROJECT_PATH/" "$PI_HOST:$PI_PROJECT_PATH/"

echo "🔨 Rebuilding on Pi..."
ssh "$PI_HOST" "cd $PI_PROJECT_PATH/docker && docker compose up -d --build"

echo "📋 Checking logs..."
sleep 3
ssh "$PI_HOST" "cd $PI_PROJECT_PATH/docker && docker compose logs --tail 5"

echo "🚀 Deploy complete!"
