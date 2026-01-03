# Mate - Hybrid Claude CLI + claude-flow Agent

## Pi Connection

```
Host: <your-pi-hostname>
User: <your-user>
SSH:  ssh <your-user>@<your-pi-hostname>
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Raspberry Pi Zero 2 W                        │
│                 (512MB RAM)                               │
│                                                           │
│  ┌─────────────┐  ┌─────────────────────────────────────┐│
│  │  Telegram   │  │           Orchestrator              ││
│  │  Bot API    │  │  ┌───────────┐  ┌───────────────┐   ││
│  │  (grammy)   │──▶│  │⚡ Simple  │  │ 🔄 Flow       │   ││
│  │             │  │  │ Claude CLI│  │ claude-flow   │   ││
│  │  [Buttons]  │  │  └───────────┘  └───────────────┘   ││
│  └─────────────┘  └─────────────────────────────────────┘│
│                                                           │
│                   ┌─────────────┐                         │
│                   │   Docker    │                         │
│                   │  Container  │                         │
│                   └─────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

### Routing Modes

- **⚡ Simple**: Uses `claude` CLI for fast, straightforward responses
- **🔄 Flow**: Uses `claude-flow swarm` for complex multi-step tasks

User selects mode via Telegram inline keyboard buttons before each message.

## Project Structure

```
mate/
├── src/
│   ├── index.ts              # Entry point
│   ├── orchestrator/         # NEW: Routing logic
│   │   ├── router.ts         # Mode selection & routing
│   │   ├── simple.ts         # Claude CLI wrapper
│   │   └── complex.ts        # claude-flow wrapper
│   ├── telegram/
│   │   ├── bot.ts            # Grammy client setup
│   │   ├── handlers.ts       # Message routing + mode selection
│   │   ├── mode-selector.ts  # Inline keyboard state
│   │   └── middleware.ts     # Auth + rate limiting
│   ├── agent/                # Legacy tools (still available)
│   │   ├── memory.ts         # Conversation history
│   │   └── tools/            # Bash, file tools
│   └── security/
│       ├── whitelist.ts      # User ID validation
│       └── rate-limit.ts     # Token bucket limiter
├── config/
│   └── personality.md        # Bot personality config
├── tests/
├── docker/
│   ├── Dockerfile            # Debian-based with Claude CLI
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

### First Time Setup on Pi

```bash
# After deploying, authenticate Claude CLI inside container:
docker exec -it mate claude auth login

# This opens a browser auth flow - complete it
# Auth is persisted in Docker volume (mate-claude-auth)
```

### Deploy to Pi

```bash
# Via npm script
npm run deploy

# Or manually:
ssh <user>@<pi-host> "cd ~/mate/docker && docker compose up -d --build"

# Quick restart (no rebuild)
ssh <user>@<pi-host> "cd ~/mate/docker && docker compose restart"

# View logs
ssh <user>@<pi-host> "cd ~/mate/docker && docker compose logs -f"
```

### Update .env on Pi

```bash
# Sync .env and restart
npm run deploy:restart

# Or edit directly on Pi
ssh <user>@<pi-host> "nano ~/mate/.env"
ssh <user>@<pi-host> "cd ~/mate/docker && docker compose restart"
```

## Auto-Deploy from GitHub

### Option 1: GitHub Actions

Requires Pi to be accessible from internet (Tailscale, Cloudflare Tunnel, etc).

**Setup GitHub Secrets:**
- `PI_SSH_KEY`: SSH private key
- `PI_HOST`: Pi's hostname/IP
- `PI_HOST_KEY`: Output of `ssh-keyscan <pi-host>`

### Option 2: Pi Polling

```bash
# Install updater service
sudo cp scripts/mate-updater.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mate-updater
sudo systemctl start mate-updater

# Check logs
journalctl -u mate-updater -f
```

## Quick Commands

| Task | Command |
|------|---------|
| Run tests | `npm test` |
| Build | `npm run build` |
| Dev mode | `npm run dev` |
| Deploy to Pi | `npm run deploy` |
| Restart Pi | `npm run deploy:restart` |
| Pi logs | `npm run deploy:logs` |
| Pi shell | `ssh <user>@<pi-host> "docker exec -it mate sh"` |
| Claude auth | `docker exec -it mate claude auth login` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_ALLOWED_USERS` | Yes | Comma-separated user IDs |
| `GROQ_API_KEY` | No | For voice transcription/TTS |
| `BOT_NAME` | No | Override personality.md name |
| `LOG_LEVEL` | No | Default: info |

**Note:** `ANTHROPIC_API_KEY` is no longer required. Authentication is handled via Claude CLI using your Pro/Max account.

## Security Features

- **User whitelist**: Only allowed Telegram users can interact
- **Rate limiting**: Token bucket per user (10 req, 0.5/sec refill)
- **Docker hardening**: Non-root user, resource limits
- **Audit logging**: All actions logged with timestamps

## Telegram Commands

- `/start` - Show help message with mode explanation
- `/clear` - Clear current mode selection
- `/status` - Show bot and system status
- Send text/voice → Select mode → Get response

## Message Flow

```
User sends message
        ↓
[Show mode selection buttons]
  ⚡ Simple | 🔄 Flow
        ↓
User taps button
        ↓
[Route to selected executor]
  - Simple: claude -p "..." --output-format text
  - Flow: claude-flow swarm "..." --claude --output-format json
        ↓
[Send response to user]
```

## Docker Volumes

| Volume | Purpose |
|--------|---------|
| `mate-claude-auth` | Persist Claude CLI auth between rebuilds |
| `/var/mate` | Update trigger file |
| `../data` | Persistent app data (logs, memory) |
