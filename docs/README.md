# Mate Documentation

## Specs
- [Original Architecture](specs/original-architecture.md) - Initial architecture spec (historical reference)

## Project Overview

Mate is a personal AI assistant running on Raspberry Pi with a Telegram interface. It uses Claude CLI for simple queries and claude-flow for complex multi-step tasks.

### Key Components
- **Telegram Bot** - User interface via grammy with inline keyboard for mode selection
- **Orchestrator** - Routes messages to Claude CLI (simple) or claude-flow (complex)
- **Security** - User whitelist, rate limiting, audit logging
- **Integrations** - Voice transcription (Groq), TTS, Collected Notes blog
