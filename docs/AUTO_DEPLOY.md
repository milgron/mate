# Auto-Deploy System

This document describes the automatic deployment system for Jarvis, enabling seamless updates from GitHub to the Raspberry Pi.

## Overview

The auto-deploy system supports two deployment methods:

1. **Git Polling** - The Pi periodically checks GitHub for changes
2. **Bot-Triggered** - The agent triggers updates via Telegram commands

Both methods can run simultaneously, giving you flexibility in how updates are deployed.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub                                  │
│                           │                                     │
│                     git push                                    │
│                           ▼                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌──────────────────────┐    ┌──────────────────────────────────────┐
│   GitHub Actions     │    │         Raspberry Pi                 │
│   (if Pi accessible) │    │                                      │
│         │            │    │  ┌────────────────────────────────┐  │
│         │ SSH+rsync  │    │  │  jarvis-updater.service        │  │
│         └────────────┼────┼──│  (systemd)                     │  │
│                      │    │  │                                │  │
└──────────────────────┘    │  │  ┌──────────────────────────┐  │  │
                            │  │  │  auto-update.sh --daemon │  │  │
                            │  │  │                          │  │  │
                            │  │  │  • Polls git every 60s   │  │  │
                            │  │  │  • Watches trigger file  │  │  │
                            │  │  └──────────────────────────┘  │  │
                            │  └────────────────────────────────┘  │
                            │                 │                    │
                            │                 │ reads              │
                            │                 ▼                    │
                            │  ┌────────────────────────────────┐  │
                            │  │  /var/jarvis/update-trigger    │  │
                            │  │  (shared volume)               │  │
                            │  └────────────────────────────────┘  │
                            │                 ▲                    │
                            │                 │ writes             │
                            │  ┌────────────────────────────────┐  │
                            │  │  Docker Container (jarvis)     │  │
                            │  │                                │  │
                            │  │  ┌──────────────────────────┐  │  │
                            │  │  │  self_update tool        │  │  │
                            │  │  │  (triggered via chat)    │  │  │
                            │  │  └──────────────────────────┘  │  │
                            │  └────────────────────────────────┘  │
                            └──────────────────────────────────────┘
```

## Method 1: Git Polling (Recommended)

The Pi runs a background service that checks GitHub for new commits every 60 seconds.

### How It Works

1. `jarvis-updater.service` starts on boot
2. Runs `auto-update.sh --daemon` in the background
3. Every `POLL_INTERVAL` seconds:
   - Fetches latest from `origin/main`
   - Compares local HEAD with remote HEAD
   - If different, pulls changes and rebuilds Docker

### Setup

```bash
# SSH into the Pi
ssh ale@alfajor.local

# Clone the repo (first time only)
cd ~
git clone https://github.com/YOUR_USER/jarvis.git
cd jarvis

# Add your .env file
cp .env.example .env
nano .env  # Add your secrets

# Install the systemd service
sudo cp scripts/jarvis-updater.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable jarvis-updater
sudo systemctl start jarvis-updater
```

### Verify It's Running

```bash
# Check service status
sudo systemctl status jarvis-updater

# View logs
journalctl -u jarvis-updater -f

# Check the log file
tail -f /tmp/jarvis-updater.log
```

### Configuration

Environment variables in `/etc/systemd/system/jarvis-updater.service`:

| Variable | Default | Description |
|----------|---------|-------------|
| `REPO_DIR` | `/home/ale/jarvis` | Path to the git repository |
| `POLL_INTERVAL` | `60` | Seconds between git fetch checks |
| `BRANCH` | `main` | Git branch to track |
| `TRIGGER_FILE` | `/var/jarvis/update-trigger` | Path to bot trigger file |

To change settings:

```bash
sudo systemctl edit jarvis-updater

# Add overrides, e.g.:
# [Service]
# Environment=POLL_INTERVAL=30

sudo systemctl restart jarvis-updater
```

## Method 2: Bot-Triggered Updates

The agent can trigger updates via natural language commands in Telegram.

### How It Works

1. User sends message like "update yourself" to the bot
2. Claude uses the `self_update` tool
3. Tool writes timestamp to `/var/jarvis/update-trigger`
4. Host's `auto-update.sh` detects the new trigger
5. Pulls from git and rebuilds Docker
6. Bot restarts with new code

### Trigger Phrases

The agent understands natural language. Examples:

- "update yourself"
- "pull the latest code"
- "upgrade to the newest version"
- "deploy the latest changes"
- "refresh your code"

### Technical Details

**UpdateTool** (`src/agent/tools/update.ts`):

```typescript
// Writes timestamp to trigger file
writeFileSync('/var/jarvis/update-trigger', new Date().toISOString());
```

**Docker Volume Mount** (`docker/docker-compose.yml`):

```yaml
volumes:
  - /var/jarvis:/var/jarvis
```

**Trigger Detection** (`scripts/auto-update.sh`):

```bash
check_trigger_file() {
    if [ -f "$TRIGGER_FILE" ]; then
        CURRENT_TRIGGER=$(cat "$TRIGGER_FILE")
        if [ "$CURRENT_TRIGGER" != "$LAST_TRIGGER" ]; then
            LAST_TRIGGER="$CURRENT_TRIGGER"
            return 0  # New trigger detected
        fi
    fi
    return 1
}
```

## Method 3: GitHub Actions (Optional)

If your Pi is accessible from the internet (via Tailscale, Cloudflare Tunnel, etc.), you can use GitHub Actions to push updates.

### Setup

1. Generate an SSH key for deployment:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy
```

2. Add public key to the Pi:

```bash
ssh-copy-id -i ~/.ssh/github_deploy.pub ale@YOUR_PI_HOST
```

3. Add GitHub repository secrets:

| Secret | Value |
|--------|-------|
| `PI_SSH_KEY` | Contents of `~/.ssh/github_deploy` (private key) |
| `PI_HOST` | Pi's public IP or Tailscale hostname |
| `PI_HOST_KEY` | Output of `ssh-keyscan YOUR_PI_HOST` |

4. Push to `main` branch to trigger deployment.

### Workflow

The workflow (`.github/workflows/deploy.yml`):

1. Runs tests on GitHub's servers
2. If tests pass, SSHs to the Pi
3. Syncs code via rsync
4. Rebuilds and restarts Docker

## Deployment Process

When an update is triggered (by any method), the following happens:

```bash
# 1. Pull latest code
cd ~/jarvis
git stash           # Save local changes (like .env edits)
git pull origin main
git stash pop       # Restore local changes

# 2. Rebuild Docker image
cd docker
docker compose build

# 3. Restart container
docker compose up -d

# 4. Verify health
docker compose ps   # Should show "healthy" or "running"
```

## File Reference

| File | Purpose |
|------|---------|
| `scripts/auto-update.sh` | Main update script (polls git + watches trigger) |
| `scripts/jarvis-updater.service` | systemd service definition |
| `src/agent/tools/update.ts` | Bot's self-update tool |
| `docker/docker-compose.yml` | Docker config with /var/jarvis volume |
| `.github/workflows/deploy.yml` | GitHub Actions workflow (optional) |

## Troubleshooting

### Service Won't Start

```bash
# Check for errors
journalctl -u jarvis-updater -n 50

# Common issues:
# - Repo not cloned: git clone the repo first
# - Wrong permissions: chown -R ale:ale ~/jarvis
# - Docker not running: sudo systemctl start docker
```

### Bot Can't Trigger Updates

```bash
# Check trigger directory exists and has correct permissions
ls -la /var/jarvis/

# Should be owned by 1001:1001 (the container user)
# If not:
sudo mkdir -p /var/jarvis
sudo chown 1001:1001 /var/jarvis
```

### Updates Not Detected

```bash
# Check git remote is correct
cd ~/jarvis
git remote -v

# Check branch name matches
git branch

# Manually test fetch
git fetch origin main
git log HEAD..origin/main --oneline
```

### Docker Build Fails

```bash
# View build output
cd ~/jarvis/docker
docker compose build --no-cache

# Check disk space (Pi has limited storage)
df -h

# Prune old images
docker system prune -a
```

## Security Considerations

1. **Trigger File Location**: `/var/jarvis` is outside the container's read-only filesystem, allowing controlled writes.

2. **Volume Permissions**: The trigger directory is owned by UID 1001 (the container's non-root user), limiting what can be written.

3. **Git Stash**: Local changes (like `.env`) are preserved during updates via `git stash`.

4. **No Remote Code Execution**: The bot can only trigger an update; it cannot specify what code to run. Updates only come from the configured git remote.

## Logs and Monitoring

```bash
# Auto-updater logs
journalctl -u jarvis-updater -f

# Docker container logs
cd ~/jarvis/docker && docker compose logs -f

# Log file
tail -f /tmp/jarvis-updater.log
```
