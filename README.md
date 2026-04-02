# lemon.test

> Your codebase. Zero blind spots.

An agentic AI testing platform that autonomously generates, executes, and fixes unit tests for TypeScript/JavaScript codebases.

## How It Works

lemon.test deploys specialized AI agents that form a generate-run-fix loop:

1. **Test Generation** -- The generator agent reads your source code and writes comprehensive vitest unit tests covering happy paths, edge cases, and error cases
2. **Test Execution** -- The executor agent runs the tests and records pass/fail results
3. **Self-Healing Fixes** -- When tests fail, the editor agent analyzes the failures and applies code fixes automatically
4. **Iterative Refinement** -- Steps 2-3 repeat until all tests pass or the maximum iteration count is reached

## Architecture

The system uses a multi-agent architecture powered by [Mastra](https://mastra.ai/), with three specialized agents:

| Agent | Role |
|---|---|
| `testGeneratorAgent` | Reads source files and generates vitest unit tests |
| `executorAgent` | Runs tests via vitest and stores results in Redis |
| `editorAgent` | Reads failures from Redis and applies source code fixes |

Agents communicate through Redis, which serves as an event log for test results, code analysis, and patches -- enabling full auditability across iterations.

### Tools

Each agent is equipped with purpose-built tools:

- **File I/O** -- Read, write, and list files in the target repository
- **Redis Operations** -- Store/fetch analysis, test results, and generated tests
- **Test Runner** -- Execute vitest and parse pass/fail output

## Prerequisites

- Node.js (latest) **or** Docker + Docker Compose
- Redis server (default: `localhost:6379`) — included in Docker Compose
- Cloudflare Workers AI API credentials

## Setup

### Option A: Docker Compose (Recommended)

1. Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your values
```

2. Set `TARGET_REPO` to an absolute path on your host machine. The Compose file will mount it into the containers automatically.

3. Run the platform:

```bash
# Local mode — runs agents on TARGET_REPO directly
docker compose up app

# Webhook mode — listens for CircleCI triggers from any repo
docker compose up webhook

# Run both modes + Redis together
docker compose up
```

Redis runs as a managed service with persistent storage and a health check — no manual setup needed.

### Option B: Local Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
REDIS_HOST=localhost
REDIS_PORT=6379
TARGET_REPO=/path/to/the/repository/you/want/to/test
WEBHOOK_PORT=3456
WEBHOOK_SECRET=your-secret-here
```

3. Start Redis (if not already running):

```bash
redis-server
```

4. Run the platform:

```bash
# Local mode — runs agents on TARGET_REPO directly
npm run dev

# Webhook mode — listens for CircleCI triggers from any repo
npm run webhook
```

## CircleCI Integration

The webhook server lets any GitHub repo trigger AI test generation, execution, and fixing through CircleCI.

### 1. Expose your local server

CircleCI needs to reach your laptop. Use one of these:

```bash
# ngrok (recommended)
ngrok http 3456
# → gives you https://abc123.ngrok-free.app

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3456
```

### 2. Configure target repository

Copy `.circleci/example-repo-config.yml` into your target repo as `.circleci/config.yml`:

```bash
cp .circleci/example-repo-config.yml /path/to/target-repo/.circleci/config.yml
```

### 3. Set CircleCI environment variables

In your target repo's CircleCI project settings, add:

| Variable | Value |
|---|---|
| `LEMON_WEBHOOK_URL` | Your tunnel URL (e.g. `https://abc123.ngrok-free.app`) |
| `LEMON_WEBHOOK_SECRET` | Must match `WEBHOOK_SECRET` in your `.env` |

### 4. Trigger the pipeline

Push to any branch (excluding `main` by default) and CircleCI will:

1. Send a webhook payload with repo, branch, commit, and working directory
2. Your local agents receive it and run the full generate → run → fix loop
3. Results are logged to your local console and stored in Redis

### Available workflows

| Workflow | What it does |
|---|---|
| `ai-test-loop` | Full generate + run + fix cycle (default) |
| `ai-generate-tests` | Generate tests only |
| `ai-run-tests` | Run existing tests only |

## Testing

The project includes integration and E2E tests powered by vitest.

### Test Structure

| Directory | Purpose |
|---|---|
| `tests/integration/` | Redis client/tools, file I/O tools, test runner |
| `tests/e2e/` | Full test-fix loop, webhook server endpoints |

### Running Tests

```bash
# All tests
npm test

# Integration tests only (Redis, FS, runner tools)
npm run test:integration

# E2E tests only (test-fix loop, webhook server)
npm run test:e2e

# Watch mode
npm run test:watch
```

### Requirements

Integration tests require a running Redis server. If using Docker Compose:

```bash
docker compose up redis -d
npm test
```

## Tech Stack

- **Language**: TypeScript (ES2020, NodeNext modules)
- **AI Framework**: Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `@mastra/rag`)
- **LLM Providers**: Cloudflare Workers AI (Qwen 30B, Llama 3.3 70B), OpenAI (GPT-5-mini for research)
- **Test Framework**: vitest
- **State Management**: Redis (ioredis) for results/analysis/patches, LibSQL for agent memory
- **Schema Validation**: Zod
- **Runtime**: tsx

## Project Structure

```
src/
├── index.ts                        # Entry point: orchestrates the test-fix-retest loop
├── redis/
│   └── client.ts                   # Redis client singleton
└── mastra/
    ├── index.ts                    # Mastra instance exporting all agents
    ├── agents/
    │   ├── testGeneratorAgent.ts   # Generates vitest unit tests
    │   ├── executorAgent.ts        # Runs tests, stores results
    │   ├── editorAgent.ts          # Applies code fixes to source files
    │   ├── orchestratorAgent.ts    # (Unused) Supervisor agent
    │   ├── research-agent.ts       # (Unused) Standalone research agent
    │   └── myAgent.ts              # Template/example agent
    └── tools/
        ├── fs/                     # File I/O tools (read, write, list)
        ├── redis/                  # Redis tools (fetch/store analysis, results)
        └── runner/                 # Test execution tool
```

## CLI Package

The entire platform is available as an npm package (`lemonx`) for easy distribution. Run it with `npx` — no installation needed.

### Commands

| Command | Description |
|---|---|
| `npx lemonx init [dir]` | Generate CircleCI config with AI test integration |
| `npx lemonx start` | Start the webhook server (listens on port 3456) |
| `npx lemonx tunnel` | Start ngrok to expose your server |

### Quick Start

```bash
# 1. Set up CircleCI in your target repo
npx lemonx init /path/to/your/repo

# 2. Start the webhook server on your machine
npx lemonx start

# 3. Expose your server to the internet
npx lemonx tunnel
```

### How It Works

1. **`npx lemonx init`** generates `.circleci/config.yml` in your target repo and prints a webhook secret
2. You add the secret and your ngrok URL to CircleCI project settings
3. When you push to any branch (not main), CircleCI sends a webhook to your machine
4. Your local AI agents receive the webhook and run the full test-fix loop:
   - Generate vitest unit tests for your source code
   - Run the tests and collect pass/fail results
   - Automatically fix any failures
   - Repeat until all tests pass or max iterations (5) reached

### CircleCI Setup

After running `npx lemonx init`, configure these in your CircleCI project settings:

| Variable | Value |
|---|---|
| `LEMON_WEBHOOK_URL` | Your ngrok URL (from `npx lemonx tunnel`) |
| `LEMON_WEBHOOK_SECRET` | The secret printed by `npx lemonx init` |

### Available Workflows

| Workflow | What it does |
|---|---|
| `ai-test-loop` | Full generate + run + fix cycle (default) |
| `ai-generate-tests` | Generate tests only |
| `ai-run-tests` | Run existing tests only |

### Requirements

- Node.js 22+
- Redis server (localhost:6379)
- ngrok (for tunneling)
- Cloudflare Workers AI credentials

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | - |
| `CLOUDFLARE_API_KEY` | Cloudflare API key | - |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `WEBHOOK_PORT` | Webhook server port | `3456` |
| `WEBHOOK_SECRET` | HMAC secret for webhooks | - |

### Package Structure

```
lemonx-pkg/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entry point
│   │   └── commands/
│   │       ├── init.ts           # CircleCI config generator
│   │       ├── start.ts          # Webhook server + AI agents
│   │       └── tunnel.ts         # ngrok wrapper
│   ├── mastra/                   # AI agents and tools
│   ├── redis/                    # Redis client
│   └── webhook-server.ts         # Standalone webhook server
├── package.json
├── tsconfig.json
└── README.md
```

### Publishing

```bash
cd lemonx-pkg
npm install
npm run build
npm publish
```

## CI/CD

The project includes a CircleCI pipeline with an AI review gatekeeper that checks for acknowledged AI comments before allowing merges to main.

## License

Open Source
