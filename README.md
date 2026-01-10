# Mate

Personal AI assistant running on Raspberry Pi, powered by multiple LLM providers (Anthropic, OpenAI, Groq) via the Vercel AI SDK and accessible via Telegram.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Raspberry Pi (<your-pi>)                   │
│                                                         │
│  ┌──────────┐    ┌─────────────┐    ┌───────────────┐  │
│  │ Telegram │───▶│ Orchestrator│───▶│ Vercel AI SDK │  │
│  │   Bot    │    │   Router    │    └───────┬───────┘  │
│  │ (grammy) │    │             │            │          │
│  └──────────┘    │ ⚡ Simple   │    ┌───────┴───────┐  │
│                  │ 🔄 Complex  │    │   Providers   │  │
│                  └─────────────┘    ├───────────────┤  │
│                                     │ • Anthropic   │  │
│                                     │ • OpenAI      │  │
│                                     │ • Groq        │  │
│                                     └───────────────┘  │
│                    Docker Container                     │
└─────────────────────────────────────────────────────────┘
```

## How It Works

1. Send a message to your Telegram bot
2. Choose a mode via inline buttons:
   - **⚡ Simple** - Direct API call for quick responses
   - **🔄 Complex** - Extended thinking for multi-step reasoning
3. Get your response (text or voice)

## Features

- **Multi-provider AI**: Supports Anthropic (Claude), OpenAI (GPT-4), and Groq (Llama) via Vercel AI SDK
- **Dual-mode processing**: Simple queries vs complex tasks with extended thinking (Anthropic only)
- **Voice support**: Send voice messages (transcribed via Groq), receive TTS responses
- **User whitelist**: Only authorized Telegram users can interact
- **Rate limiting**: Token bucket per user to prevent abuse
- **Conversation memory**: SQLite-based context per user session
- **Semantic memory**: Vector-based long-term memory with LanceDB and local embeddings
- **Blog integration**: Optional Collected Notes API for publishing

## Web Dashboard

Mate includes a web interface for configuration and monitoring:

| Route | Description |
|-------|-------------|
| `mate.local:3000/config` | Configure AI models, assistant name, voice settings |
| `mate.local:3000/use` | View usage statistics and cost breakdown |

Changes are saved to `data/config.json` and take effect immediately—no container restart needed.

On startup, the bot sends a Telegram notification with links to both pages.

## AI Providers

Mate uses the Vercel AI SDK to support multiple LLM providers. You can switch between them via the `AI_PROVIDER` environment variable.

| Provider | Models | Extended Thinking |
|----------|--------|-------------------|
| **Anthropic** | claude-sonnet-4-20250514 (default) | ✅ Yes |
| **OpenAI** | gpt-4o (default) | ❌ No |
| **Groq** | llama-3.3-70b-versatile (default) | ❌ No |

To use a different provider:

```bash
# Use OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Use Groq (fast and free tier available)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...

# Override the default model
AI_MODEL=gpt-4-turbo
```

**Note:** Extended thinking (deep reasoning for complex tasks) is only available with Anthropic Claude models. Other providers will use standard generation for complex tasks.

## Memory System

Mate uses **semantic memory** powered by LanceDB (vector database) and local embeddings via Transformers.js.

### How It Works

1. When you share information ("me llamo Juan"), it's converted to a 384-dimensional vector using all-MiniLM-L6-v2
2. The vector is stored in LanceDB with metadata (key, content, type)
3. Memories are automatically loaded into the system prompt
4. Recall uses semantic search—no exact key match required

### Storage

```
data/semantic-memory/      # LanceDB vector database
├── memories.lance/        # Vector table with user memories
└── ...
```

### Memory Types

| Type | Description | Examples |
|------|-------------|----------|
| `fact` | User identity info | Name, location, work |
| `preference` | User preferences | Language, tone, style |
| `note` | General notes | Topics, context |

### Benefits

- **Semantic search**: "¿cómo me llamo?" finds "Name: Juan" even without exact match
- **No external APIs**: Embeddings run locally (~50-150ms per text)
- **Scalable**: Handles thousands of memories efficiently
- **Automatic context**: Memories loaded into every prompt

## Setup

### Prerequisites

- Raspberry Pi (tested on Pi Zero 2 W) or any Linux server
- Docker and Docker Compose
- Node.js 20+ (for local development)
- Anthropic API key

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
- `ANTHROPIC_API_KEY` - Get from [console.anthropic.com](https://console.anthropic.com)
- `TELEGRAM_BOT_TOKEN` - Get from [@BotFather](https://t.me/BotFather)
- `TELEGRAM_ALLOWED_USERS` - Your Telegram user ID (get from [@userinfobot](https://t.me/userinfobot))

Optional:
- `GROQ_API_KEY` - For voice transcription (get from [Groq Console](https://console.groq.com))

### 3. Deploy with Docker

```bash
cd docker
docker compose up -d --build
```

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

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

```bash
npm run version:patch   # Bug fixes (0.1.0 → 0.1.1)
npm run version:minor   # New features (0.1.0 → 0.2.0)
npm run version:major   # Breaking changes (0.1.0 → 1.0.0)
```

See [CHANGELOG.md](CHANGELOG.md) for version history and [CONTRIBUTING.md](CONTRIBUTING.md) for the release workflow.

## Project Structure

```
mate/
├── src/                      # Telegram bot (Node.js)
│   ├── index.ts              # Entry point
│   ├── orchestrator/         # Message routing
│   │   ├── providers.ts      # Multi-provider AI configuration
│   │   ├── router.ts         # Mode suggestion logic
│   │   ├── simple.ts         # Direct API wrapper
│   │   └── complex.ts        # Extended thinking wrapper
│   ├── telegram/
│   │   ├── bot.ts            # Grammy client
│   │   ├── handlers.ts       # Message handlers
│   │   ├── mode-selector.ts  # Mode state management
│   │   └── middleware.ts     # Auth + rate limiting
│   ├── db/
│   │   ├── conversations.ts  # SQLite conversation history
│   │   ├── longterm.ts       # Legacy markdown memory (deprecated)
│   │   └── semantic.ts       # LanceDB vector memory
│   ├── services/
│   │   └── embeddings.ts     # Local embeddings (Transformers.js)
│   ├── agent/
│   │   ├── memory.ts         # Conversation memory class
│   │   └── tools/            # Available tools
│   │       └── memory.ts     # Memory tool (remember/recall)
│   └── security/
│       ├── whitelist.ts      # User authorization
│       └── rate-limit.ts     # Token bucket limiter
├── web/                      # Web dashboard (Next.js 15)
│   ├── src/app/
│   │   ├── config/           # Configuration page
│   │   ├── use/              # Usage dashboard
│   │   └── api/              # API routes
│   └── src/components/       # React components
├── docker/
│   ├── Dockerfile            # Production image (bot + web)
│   └── docker-compose.yml
├── scripts/
│   ├── deploy.sh             # Manual deploy script
│   └── mate-updater.service  # Systemd auto-updater
├── data/                     # Runtime data (not in git)
│   ├── config.json           # Web-editable configuration
│   ├── usage.json            # Usage statistics
│   └── memory/{userId}/      # User memory files
├── CHANGELOG.md              # Version history
├── CONTRIBUTING.md           # Development guide
└── tests/                    # Vitest test suite
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_PROVIDER` | No | AI provider: `anthropic`, `openai`, or `groq` (default: anthropic) |
| `ANTHROPIC_API_KEY` | If using Anthropic | API key from console.anthropic.com |
| `OPENAI_API_KEY` | If using OpenAI | API key from platform.openai.com |
| `GROQ_API_KEY` | For voice or Groq AI | API key from console.groq.com |
| `AI_MODEL` | No | Override the default model for the active provider |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_ALLOWED_USERS` | Yes | Comma-separated user IDs |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `COLLECTED_NOTES_API_KEY` | No | For blog integration |
| `COLLECTED_NOTES_SITE_PATH` | No | Blog site path |

## Telegram Commands

- `/start` - Show help message
- `/status` - Show bot and system status
- `/clear` - Clear conversation history
- Any text or voice message - Chat with the assistant

## API Pricing

Pricing varies by provider. Here are approximate costs per million tokens:

| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| Anthropic | claude-sonnet-4 | $3 | $15 |
| OpenAI | gpt-4o | $2.50 | $10 |
| Groq | llama-3.3-70b | $0.59 | $0.79 |

Extended thinking mode (Anthropic only) uses additional tokens for reasoning.

## License

MIT
