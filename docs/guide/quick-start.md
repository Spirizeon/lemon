# Quick Start

Get lemon.test running in under 2 minutes.

## Prerequisites

- A GitHub repository with TypeScript/JavaScript code
- Cloudflare Workers AI account

## 1. Add Secrets to Your Repo

Go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_KEY`

## 2. Push to Any Branch

```bash
git push origin feature/my-branch
```

That's it. GitHub Actions will run the full AI test-fix loop automatically.

## What Happens

1. **Discovery** — AI scans source files (up to 5 for unit, 5 for integration, 3 for E2E)
2. **Generation** — Tests written to `src/__tests__/`, `tests/integration/`, `tests/e2e/`
3. **Execution** — Tests run via vitest, results stored in Redis
4. **Fixing** — Failed tests analyzed and source code patched
5. **Iteration** — Steps 3-4 repeat up to 5 times
6. **Result** — Job passes if all tests pass, fails otherwise

## Local Testing

```bash
cp .env.example .env
# Edit .env with your Cloudflare credentials
npm run docker:up
```

## Next Steps

- Read [How It Works](/guide/how-it-works) to understand the agent pipeline
- Explore the [Architecture](/architecture/overview) for a deep dive
- Check the [GitHub Actions deployment](/deployment/github-actions) docs
