# VERSE AI

## Overview

VERSE AI is a cross-platform bot and AI integration project built with Node.js, Express, Firebase, Telegram(only active here for now), and WhatsApp support.

Try the bot on Telegram: https://t.me/UdemeAVXBot

The current repository includes:

- `app.js` — main Express server startup and graceful shutdown
- `platforms/telegram` — Telegram client implementation
- `src/response/ai` — AI response generation service
- `src/db` — Firebase integration and user repository logic
- `src/utils` — logging and utility helpers

## Abilities / Features

- Intelligent AI conversations through Telegram and future multi-platform support
- Context-aware response generation using configurable AI providers
- Web search integration for enhanced answers and up-to-date information
- User management and token-based access handling through Firebase
- Flexible deployment options with webhook or polling support for Telegram
- Built-in logging, error handling, and graceful shutdown for reliable operation

## Requirements

- Node.js 18+ installed
- `pnpm` package manager (recommended) or `npm`
- Firebase service account credentials
- Telegram bot token

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Update `.env` with your own values.

4. Start the app:
   ```bash
   pnpm start
   ```

## Environment Variables

Copy `.env.example` to `.env` and update the values below.

- `PORT` — server port (default: `5000`)
- `AI_BOT_VERSION` — optional version string used by the bot response layer
- `SECRET_KEY` — encryption key used for message storage and decryption (key should be 32 bit)
- `AXIOS_TIMEOUT` — request timeout in milliseconds for outbound HTTP calls
- `AXIOS_MAX_RETRY` — retry count for HTTP requests
- `AXIOS_USER_AGENT` — custom user-agent string for outbound requests
- `GEMINI_API_KEY_1` ... `GEMINI_API_KEY_5` — Gemini API keys used for provider rotation
- `AI_DEFAULT_MODEL` — optional default model name for AI configuration
- `AI_MAX_TOKENS` — optional maximum output tokens per AI request
- `AI_TEMPERATURE` — optional temperature for AI generation
- `AI_PROVIDER_TIMEOUT_MS` — optional timeout for AI provider requests
- `TAVILY_API_KEY_1` — API key for web search features
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `TELEGRAM_USE_POLLING` — set to `true` for local polling mode without HTTPS
- `TELEGRAM_WEBHOOK_URL` — public base URL for Telegram webhook mode
- `TELEGRAM_WEBHOOK_PATH` — webhook path (default: `/telegram/webhook`)
- `MEMORY_LIMIT_MB`, `MEMORY_RESTART_THRESHOLD_MB`, `MEMORY_MONITOR_INTERVAL_MS`, `MEMORY_SELF_RESTART` — optional memory watchdog settings
- `FIREBASE_SERVICE_ACCOUNT` — full Firebase service account JSON as a single environment value



## Project Structure

- `app.js` — Express app bootstrapping and platform initialization
- `platforms/telegram/client.js` — Telegram bot client and message handling
- `src/db/firebase.js` — Firebase admin initialization
- `src/response/ai/ai.service.js` — AI response generation entry point
- `src/service/user.service.js` — user validation and token handling
- `src/models/user.model.js` — user model logic

## Running

Start the application:

```bash
pnpm start
```

If you want to run directly with Node:

```bash
node app.js
```


## Notes

This README is intended to give developers a practical setup path.
