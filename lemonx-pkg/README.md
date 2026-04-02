# lemonx

> Your codebase. Zero blind spots.

AI-powered test generation, execution, and self-healing fixes via CircleCI.

## Quick Start

```bash
# 1. Set up CircleCI in your target repo
npx lemonx init /path/to/your/repo

# 2. Start the webhook server on your machine
npx lemonx start

# 3. Expose your server to the internet
npx lemonx tunnel
```

## How It Works

1. **`npx lemonx init`** generates a CircleCI config in your target repo
2. When you push to any branch (not main), CircleCI sends a webhook to your machine
3. Your local AI agents receive the webhook and run the full test-fix loop:
   - Generate vitest unit tests for your source code
   - Run the tests and collect results
   - Automatically fix any failures
   - Repeat until all tests pass or max iterations reached

## Commands

| Command | Description |
|---|---|
| `npx lemonx init [dir]` | Generate CircleCI config with AI test integration |
| `npx lemonx start` | Start the webhook server (listens on port 3456) |
| `npx lemonx tunnel` | Start ngrok to expose your server |

## Setup

### 1. Initialize your repo

```bash
npx lemonx init /path/to/your/repo
```

This creates `.circleci/config.yml` and prints a webhook secret.

### 2. Configure CircleCI

In your CircleCI project settings, add:

| Variable | Value |
|---|---|
| `LEMON_WEBHOOK_URL` | Your ngrok URL (from `npx lemonx tunnel`) |
| `LEMON_WEBHOOK_SECRET` | The secret printed by `npx lemonx init` |

### 3. Start the server

```bash
# Terminal 1: Start the webhook server
npx lemonx start

# Terminal 2: Start the tunnel
npx lemonx tunnel
```

### 4. Push code

Push to any branch (not main) and CircleCI will trigger the AI test loop automatically.

## Requirements

- Node.js 22+
- Redis server (localhost:6379)
- ngrok (for tunneling)
- Cloudflare Workers AI credentials

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | - |
| `CLOUDFLARE_API_KEY` | Cloudflare API key | - |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `WEBHOOK_PORT` | Webhook server port | `3456` |
| `WEBHOOK_SECRET` | HMAC secret for webhooks | - |

## License

Open Source
