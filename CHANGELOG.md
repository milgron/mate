# Changelog

All notable changes to Mate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-01-10

### Added
- **Web dashboard** at mate.local:3000
  - `/config` - Configure AI models, assistant name, voice settings
  - `/use` - Usage statistics and cost breakdown
- **Multi-provider support** via Vercel AI SDK (Anthropic, OpenAI, Groq)
- Hot-swap models from web UI without container restart
- Startup notification via Telegram with config/usage links
- Human-readable memory system (File over App philosophy)
- Multi-file memory structure: about.md, preferences.md, notes/, journal/
- Memory migration from legacy formats

### Changed
- Migrated from @anthropic-ai/sdk to Vercel AI SDK
- Config now stored in data/config.json (web-editable)

### Fixed
- Docker hostname resolution for Next.js standalone

## [0.1.0] - 2026-01-04

### Added
- Initial release of Mate personal AI assistant
- Telegram bot integration using Grammy
- Dual-mode processing via Anthropic SDK:
  - Simple: Direct API call with claude-sonnet-4
  - Complex: Extended thinking enabled
- Voice message support with Groq transcription
- Text-to-speech responses using Orpheus model
- User whitelist and rate limiting
- SQLite-based conversation history
- Long-term markdown memory storage
- Auto-deploy from GitHub to Raspberry Pi
- Docker containerization optimized for Raspberry Pi
- Shutdown notification system for graceful restarts

### Fixed
- TTS audio format and voice validation
- Telegram message formatting

### Security
- Path restrictions on file operations
- Non-root Docker user
- Rate limiting per user
