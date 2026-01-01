# Jarvis - Self-Improving Claude Agent

## Architecture

```
┌──────────────────────────────────────────────────┐
│            Raspberry Pi Zero 2 W                 │
│                (512MB RAM)                       │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  Telegram   │  │   Claude    │  │  Self-   │ │
│  │  Bot API    │  │   Agent     │  │ Improve  │ │
│  │  (grammy)   │  │   (SDK)     │  │ Engine   │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│         │                │               │       │
│         └────────────────┼───────────────┘       │
│                          ▼                       │
│                 ┌─────────────┐                  │
│                 │   Docker    │                  │
│                 │  Container  │                  │
│                 └─────────────┘                  │
└──────────────────────────────────────────────────┘
```

## Project Structure

```
jarvis/
├── src/
│   ├── index.ts              # Entry point
│   ├── agent/
│   │   ├── agent.ts          # Claude SDK integration
│   │   ├── memory.ts         # Conversation history per user
│   │   └── tools/
│   │       ├── bash.ts       # Shell command execution (whitelisted)
│   │       └── file.ts       # File operations (path restricted)
│   ├── telegram/
│   │   ├── bot.ts            # Grammy client setup
│   │   ├── handlers.ts       # Message routing
│   │   └── middleware.ts     # Auth + rate limiting
│   └── security/
│       ├── encryption.ts     # AES-256-GCM for secrets
│       ├── whitelist.ts      # User ID validation
│       ├── rate-limit.ts     # Token bucket limiter
│       └── audit.ts          # Action logging
├── tests/                    # 39 tests (vitest + msw)
├── docker/
│   ├── Dockerfile            # Production (ARM64, hardened)
│   ├── Dockerfile.dev        # Development with hot reload
│   └── docker-compose.yml
└── .env                      # Secrets (never commit)
```

## Development Workflow

### Local Development (Mac)

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run in dev mode (hot reload)
npm run dev

# Type check
npm run typecheck

# Build
npm run build
```

### Deploy to Pi

```bash
# Full deploy (sync all + rebuild)
scp -r /Users/ale/Desktop/projects/jarvis ale@alfajor.local:~/ && \
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose up -d --build"

# Quick restart (no rebuild)
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose restart"

# View logs
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose logs -f"

# View last 20 log lines
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose logs --tail 20"
```

### Update .env on Pi

```bash
# Sync .env from Mac and restart
scp /Users/ale/Desktop/projects/jarvis/.env ale@alfajor.local:~/jarvis/ && \
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose restart"

# Or edit directly on Pi
ssh ale@alfajor.local "nano ~/jarvis/.env"
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose restart"
```

### Code Changes (rebuild required)

```bash
# After editing src/ files locally, deploy:
scp -r /Users/ale/Desktop/projects/jarvis ale@alfajor.local:~/ && \
ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose up -d --build"
```

## Auto-Deploy from GitHub

Two options for automatic deployment when you push to GitHub:

### Option 1: GitHub Actions (Recommended if Pi is accessible)

Requires your Pi to be accessible from the internet (via Tailscale, Cloudflare Tunnel, or port forwarding).

**Setup GitHub Secrets:**

1. Generate SSH key for deployment:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy
   ```

2. Add public key to Pi:
   ```bash
   ssh-copy-id -i ~/.ssh/github_deploy.pub ale@alfajor.local
   ```

3. Add these secrets to your GitHub repo (Settings → Secrets → Actions):
   - `PI_SSH_KEY`: Contents of `~/.ssh/github_deploy` (private key)
   - `PI_HOST`: Your Pi's public IP or hostname (e.g., via Tailscale)
   - `PI_HOST_KEY`: Output of `ssh-keyscan <pi-host>`

**How it works:**
- Push to `main` branch triggers the workflow
- GitHub Actions runs tests, then SSHs to Pi
- Syncs code via rsync, rebuilds Docker, restarts container

### Option 2: Pi Polling (If Pi is behind NAT)

The Pi periodically checks GitHub for updates and auto-deploys.

**Initial Setup on Pi:**

```bash
# Clone repo on Pi (first time only)
cd ~
git clone https://github.com/YOUR_USER/jarvis.git
cd jarvis

# Copy your .env file
nano .env  # Add your secrets

# Test the auto-update script
./scripts/auto-update.sh
```

**Install as systemd service (auto-start on boot):**

```bash
# Copy service file
sudo cp scripts/jarvis-updater.service /etc/systemd/system/

# Edit if needed (change username, paths)
sudo nano /etc/systemd/system/jarvis-updater.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable jarvis-updater
sudo systemctl start jarvis-updater

# Check status
sudo systemctl status jarvis-updater

# View logs
journalctl -u jarvis-updater -f
```

**Configuration (environment variables):**
- `POLL_INTERVAL`: Seconds between checks (default: 60)
- `BRANCH`: Git branch to track (default: main)
- `REPO_DIR`: Path to repo (default: ~/jarvis)

## Quick Commands

| Task | Command |
|------|---------|
| Run tests | `npm test` |
| Build | `npm run build` |
| Dev mode | `npm run dev` |
| Deploy to Pi | `scp -r . ale@alfajor.local:~/jarvis && ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose up -d --build"` |
| Restart Pi | `ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose restart"` |
| Pi logs | `ssh ale@alfajor.local "cd ~/jarvis/docker && docker compose logs -f"` |
| Pi shell | `ssh ale@alfajor.local "docker exec -it jarvis sh"` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `TELEGRAM_ALLOWED_USERS` | Yes | Comma-separated user IDs |
| `CLAUDE_MODEL` | No | Default: claude-sonnet-4-20250514 |
| `LOG_LEVEL` | No | Default: info |

## Security Features

- **User whitelist**: Only allowed Telegram users can interact
- **Rate limiting**: Token bucket per user (10 req, 0.5/sec refill)
- **Command whitelist**: Only safe bash commands allowed
- **Path restrictions**: File operations limited to safe directories
- **Docker hardening**: Non-root user, read-only fs, dropped capabilities
- **Audit logging**: All actions logged with timestamps

## Tools Available to Agent

### Bash Tool
Whitelisted commands: `echo`, `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `date`, `whoami`

### File Tool
- `read_file`: Read files in allowed paths
- `write_file`: Write files in allowed paths
- `list_files`: List directory contents

Allowed paths: Current working directory, `/tmp`

## Future: Self-Improvement Engine (Phase 5)

Not yet implemented. Will include:
- `isolated-vm` for sandboxed code execution
- `simple-git` for checkpoint/rollback
- `ts-morph` for AST-level code modification
- `pm2` for process management and restarts

## Telegram Commands

- `/start` - Show help message
- `/clear` - Clear conversation history
- Any text - Chat with Claude agent
