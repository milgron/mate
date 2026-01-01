# Jarvis Documentation

## Specs
- [Original Architecture](specs/original-architecture.md) - Initial architecture spec covering Claude Agent SDK, messaging, Pi Zero constraints, security, and self-improvement patterns

## Project Overview

Jarvis is a self-improving Claude agent for Raspberry Pi with a Telegram interface.

### Key Components
- **Telegram Bot** - User interface via grammy
- **Claude Agent** - AI processing with @anthropic-ai/sdk
- **Security** - User whitelist, rate limiting, audit logging, encryption
- **Tools** - Bash execution and file system operations
