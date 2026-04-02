# GitHub Actions

lemon.test runs as a GitHub Actions workflow. Every push and pull request triggers the AI test-fix loop automatically.

## How It Works

```
Push / PR → GitHub Actions Runner → Docker Compose (Redis + AI Agents) → Job Pass/Fail
```

The workflow:
1. Checks out your code
2. Builds and starts Docker Compose (Redis + lemon.test agents)
3. AI agents discover files, generate tests, run them, and fix failures
4. If all tests pass → job succeeds
5. If max iterations reached or errors → job fails

## Setup

### Step 1: Add Repository Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_KEY` | Your Cloudflare API token |

### Step 2: The Workflow Is Already There

The workflow file `.github/workflows/ai-test-loop.yml` is included in the repo. No additional setup needed.

### Step 3: Push and Watch

```bash
git push origin feature/my-branch
```

GitHub Actions will:
1. Spin up the runner
2. Run the full AI test-fix loop
3. Pass or fail the job based on results

## Workflow Configuration

```yaml
name: AI Test Loop

on:
  push:
    branches-ignore: [main]
  pull_request:
    branches-ignore: [main]

jobs:
  ai-test-fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose up --build --abort-on-container-exit --exit-code-from lemon
      - run: docker compose down -v
        if: always()
```

### Customize Branch Filters

To run on all branches including main:

```yaml
on:
  push:
  pull_request:
```

To run only on specific branches:

```yaml
on:
  push:
    branches: [develop, staging]
```

### Customize Iteration Limit

Edit `src/index.ts` to change `MAX_ITERATIONS`:

```typescript
const MAX_ITERATIONS = 5; // default
```

## What Happens During the Job

1. **Discovery** — AI scans source files (up to 5 for unit, 5 for integration, 3 for E2E)
2. **Generation** — Tests written to `src/__tests__/`, `tests/integration/`, `tests/e2e/`
3. **Execution** — Tests run via vitest, results stored in Redis
4. **Fixing** — Failed tests analyzed and source code patched
5. **Iteration** — Steps 3-4 repeat up to 5 times
6. **Result** — Job passes if all tests pass, fails otherwise

## Viewing Results

- **GitHub Actions tab** — See the full job log with AI agent output
- **PR checks** — The workflow shows as a check on pull requests
- **Commit status** — Each commit shows the workflow status

## Troubleshooting

### Job Fails Immediately

Check that `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_KEY` secrets are set correctly.

### Max Iterations Reached

The AI couldn't fix all tests within the iteration limit. Check the job logs to see which tests failed and what fixes were attempted.

### Slow Execution

AI agents can take time. Consider:
- Reducing the number of files discovered per test type
- Lowering `MAX_ITERATIONS`
- Using a larger GitHub Actions runner
