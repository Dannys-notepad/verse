# VERSE AI

## Overview

VERSE AI is a cross-platform bot and AI integration project built with Node.js, Express, Firebase, Telegram, and WhatsApp support.

The current repository includes:

- `app.js` — main Express server startup and graceful shutdown
- `platforms/telegram` — Telegram client implementation
- `platforms/whatsapp` — WhatsApp client implementation (currently disabled/commented out)
- `src/response/ai` — AI response generation service
- `src/db` — Firebase integration and user repository logic
- `src/utils` — logging and utility helpers

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

The project uses `.env` for configuration.

- `PORT` — server port (default: `5000`)
- `AXIOS_TIMEOUT` — Axios request timeout in milliseconds
- `AXIOS_MAX_RETRY` — Axios retry attempts
- `AXIOS_USER_AGENT` — user agent string for outbound requests
- `GEMINI_API_KEY_1` ... `GEMINI_API_KEY_5` — Gemini API keys
- `AI_DEFAULT_MODEL` — default model name used by AI logic
- `AI_MAX_TOKENS` — maximum tokens per AI request
- `AI_TEMPERATURE` — temperature for AI generation
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `TELEGRAM_WEBHOOK_URL` — deployed app base URL for Telegram webhooks
- `TELEGRAM_WEBHOOK_PATH` — webhook path (default: `/telegram/webhook`)
- `FIREBASE_SERVICE_ACCOUNT` — full Firebase service account JSON as a single env value

### Telegram Webhook Behavior

- If `TELEGRAM_WEBHOOK_URL` is set, the app uses webhook mode and registers the callback at:
  - `https://<your-domain><TELEGRAM_WEBHOOK_PATH>`
- If `TELEGRAM_WEBHOOK_URL` is not set, the Telegram client falls back to polling mode.

Example webhook URL:

```env
TELEGRAM_WEBHOOK_URL=https://verseai.onrender.com
TELEGRAM_WEBHOOK_PATH=/telegram/webhook
```

## Firebase Service Account

The app now reads Firebase credentials directly from the `FIREBASE_SERVICE_ACCOUNT` environment variable.

That variable should contain the entire service account JSON object as a string.

> Do not commit your `.env` file or secret credentials to source control.

## Project Structure

- `app.js` — Express app bootstrapping and platform initialization
- `platforms/telegram/client.js` — Telegram bot client and message handling
- `platforms/whatsapp/client.js` — WhatsApp client implementation
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

## Known Limitations

- No test suite is currently included
- No linting or formatting configuration is present
- WhatsApp client initialization is commented out in `app.js`
- No CI or deployment automation is configured
- No runtime validation for environment variables beyond presence checks

## Recommended Improvements

- Add automated tests and CI workflows
- Add ESLint / Prettier configuration
- Add better environment validation at startup
- Add health-check endpoints and monitoring
- Secure secret management for production deployments

## Notes

This README is intended to give developers a practical setup path and explain the current Telegram webhook behavior and Firebase env-based configuration.
