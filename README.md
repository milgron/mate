# Mate

Personal AI assistant running on Raspberry Pi, powered by Claude CLI and accessible via Telegram.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Raspberry Pi (<your-pi>)                   │
│                                                         │
│  ┌──────────┐    ┌─────────────┐    ┌───────────────┐  │
│  │ Telegram │───▶│ Orchestrator│───▶│  Claude CLI   │  │
│  │   Bot    │    │   Router    │    │  (simple)     │  │
│  │ (grammy) │    │             │    ├───────────────┤  │
│  └──────────┘    │ ⚡ Simple   │    │ claude-flow   │  │
│                  │ 🔄 Flow     │───▶│  (complex)    │  │
│                  └─────────────┘    └───────────────┘  │
│                                                         │
│                    Docker Container                     │
└─────────────────────────────────────────────────────────┘
```

## How It Works

1. Send a message to your Telegram bot
2. Choose a mode via inline buttons:
   - **⚡ Simple** - Uses `claude` CLI for quick responses
   - **🔄 Flow** - Uses `claude-flow` for complex, multi-step tasks
3. Get your response (text or voice)

## Features

- **Dual-mode processing**: Simple queries via Claude CLI, complex tasks via claude-flow
- **Voice support**: Send voice messages (transcribed via Groq), receive TTS responses
- **User whitelist**: Only authorized Telegram users can interact
- **Rate limiting**: Token bucket per user to prevent abuse
- **Conversation memory**: Maintains context per user session
- **Blog integration**: Optional Collected Notes API for publishing

## Setup

### Prerequisites

- Raspberry Pi (tested on Pi Zero 2 W) or any Linux server
- Docker and Docker Compose
- Node.js 20+ (for local development)
- Claude Pro/Max subscription (for CLI auth)

### 1. Clone and Configure

```bash
git clone https://github.com/yourusername/mate.git
cd mate
cp .env.example .env
```

### 2. Edit Environment Variables

```bash
nano .env
```

Required variables:
- `TELEGRAM_BOT_TOKEN` - Get from [@BotFather](https://t.me/BotFather)
- `TELEGRAM_ALLOWED_USERS` - Your Telegram user ID (get from [@userinfobot](https://t.me/userinfobot))
- `GROQ_API_KEY` - For voice transcription (get from [Groq Console](https://console.groq.com))

### 3. Deploy with Docker

```bash
cd docker
docker compose up -d --build
```

### 4. Authenticate Claude CLI

First-time only - authenticate with your Claude Pro/Max account:

```bash
docker exec -it mate claude auth login
```

Follow the browser authentication flow. The auth persists in a Docker volume.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Dev mode with hot reload
npm run dev

# Build
npm run build
```

## Deployment

### Manual Deploy

```bash
npm run deploy        # Sync and rebuild on Pi
npm run deploy:restart # Just restart container
npm run deploy:logs   # View logs
```

### Auto-Deploy (GitHub Actions)

Push to `main` branch triggers automatic deployment. Requires these GitHub secrets:
- `PI_SSH_KEY` - SSH private key for Pi access
- `PI_HOST` - Pi hostname/IP (e.g., via Tailscale)
- `PI_HOST_KEY` - Output of `ssh-keyscan <pi-host>`

### Auto-Deploy (Pi Polling)

Alternative for Pi behind NAT - polls GitHub for updates:

```bash
sudo cp scripts/mate-updater.service /etc/systemd/system/
sudo systemctl enable mate-updater
sudo systemctl start mate-updater
```

## Project Structure

```
mate/
├── src/
│   ├── index.ts              # Entry point
│   ├── orchestrator/         # Message routing
│   │   ├── router.ts         # Mode suggestion logic
│   │   ├── simple.ts         # Claude CLI wrapper
│   │   └── complex.ts        # claude-flow wrapper
│   ├── telegram/
│   │   ├── bot.ts            # Grammy client
│   │   ├── handlers.ts       # Message handlers
│   │   ├── mode-selector.ts  # Inline keyboard UI
│   │   └── middleware.ts     # Auth + rate limiting
│   ├── agent/
│   │   ├── memory.ts         # Conversation history
│   │   └── tools/            # Available tools
│   └── security/
│       ├── whitelist.ts      # User authorization
│       └── rate-limit.ts     # Token bucket limiter
├── docker/
│   ├── Dockerfile            # Production image
│   └── docker-compose.yml
├── scripts/
│   ├── deploy.sh             # Manual deploy script
│   └── mate-updater.service  # Systemd auto-updater
└── tests/                    # Vitest test suite
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_ALLOWED_USERS` | Yes | Comma-separated user IDs |
| `GROQ_API_KEY` | Yes | For voice transcription |
| `MASTER_ENCRYPTION_KEY` | No | For encrypting stored data |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `COLLECTED_NOTES_API_KEY` | No | For blog integration |
| `COLLECTED_NOTES_SITE_PATH` | No | Blog site path |

## Telegram Commands

- `/start` - Show help message
- `/clear` - Clear conversation history
- Any text or voice message - Chat with the assistant

## License

MIT
