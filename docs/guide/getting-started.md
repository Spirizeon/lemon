# Getting Started

## Prerequisites

- **GitHub repository** — any TypeScript/JavaScript codebase
- **Cloudflare Workers AI credentials** — for the AI agents
- **Docker + Docker Compose** — for local testing (GitHub Actions has it built-in)

## Step 1: Add Cloudflare Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_KEY` | Your Cloudflare API token |

## Step 2: The Workflow Is Already Included

The file `.github/workflows/ai-test-loop.yml` is already in the repo. It triggers on every push and PR (except `main`).

## Step 3: Push and Watch

```bash
git push origin feature/my-branch
```

GitHub Actions will automatically:
1. Check out your code
2. Build Docker Compose (Redis + AI agents)
3. Run the AI test-fix loop
4. Pass or fail the job based on results

## What Happens

When a push triggers the workflow:

1. **Discovery** — AI agents scan your source files (up to 5 for unit tests, 5 for integration, 3 for E2E)
2. **Generation** — Tests are written to `src/__tests__/`, `tests/integration/`, and `tests/e2e/`
3. **Execution** — Tests run via vitest, results stored in Redis
4. **Fixing** — Failed tests are analyzed and source code is patched
5. **Iteration** — Steps 3-4 repeat up to 5 times
6. **Result** — Job passes if all tests pass, fails otherwise

## Local Development

```bash
cp .env.example .env
# Edit .env with your Cloudflare credentials
npm run docker:up
```

## Next Steps

- Read about the [architecture](/architecture/overview) to understand how agents work
- Explore the [API reference](/reference/agents) for detailed tool and agent documentation
- Learn about [GitHub Actions deployment](/deployment/github-actions) for configuration options
