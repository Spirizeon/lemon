# Docker Setup

lemon.test uses Docker Compose to run the AI agents alongside Redis. This works both locally and inside GitHub Actions runners.

## docker-compose.yml

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  lemon:
    build: .
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}
      - CLOUDFLARE_API_KEY=${CLOUDFLARE_API_KEY}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    volumes:
      - .:/app
    working_dir: /app
    command: ["npx", "tsx", "src/index.ts"]

volumes:
  redis_data:
```

### Services

**Redis** (`redis:7-alpine`):
- Port 6379
- Health check every 5 seconds
- Persistent data volume

**Lemon** (AI agents):
- Built from the project `Dockerfile`
- Source code mounted as volume (`./app`)
- Runs `src/index.ts` — the full test-fix loop
- Exits with code 0 if all tests pass, non-zero otherwise

## Dockerfile

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
CMD ["npx", "tsx", "src/index.ts"]
```

## Running Locally

```bash
# 1. Copy env template
cp .env.example .env

# 2. Edit .env with your Cloudflare credentials

# 3. Run the AI test-fix loop
docker compose up --build --abort-on-container-exit --exit-code-from lemon

# 4. Clean up
docker compose down -v
```

## npm Scripts

```bash
npm run docker:up    # Start the full test-fix loop
npm run docker:down  # Stop and remove containers + volumes
```

## In GitHub Actions

The workflow runs:

```bash
docker compose up --build --abort-on-container-exit --exit-code-from lemon
```

- `--abort-on-container-exit` — stops all containers when `lemon` exits
- `--exit-code-from lemon` — the docker compose exit code matches the `lemon` container's exit code
- This ensures the GitHub Actions job passes or fails based on test results

## Building Images

```bash
docker compose build
```

## Debugging

### View Logs

```bash
docker compose logs -f lemon
```

### Access Redis

```bash
docker compose exec redis redis-cli
```

### Inspect Redis Keys

```bash
docker compose exec redis redis-cli
> KEYS *
> GET test_results:<uuid>
> KEYS code_patches:*
```
