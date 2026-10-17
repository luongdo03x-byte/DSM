# Local development

## Prerequisites

- Node 24.x and Corepack.
- pnpm 10.17.1 (the repo pins this through `packageManager`).
- `ffmpeg` and `ffprobe` in `PATH` for video fixtures, metadata probing, and media tests.
- Docker Desktop/Engine only for PostgreSQL, Redis, and MinIO dependencies.
- Windows + GPMLogin only when browser fallback is needed.

## 1. Prepare environment

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the generated value into `CREDENTIAL_ENCRYPTION_KEY`. Change `DEV_OWNER_PASSWORD` and `JWT_ACCESS_SECRET` before using the app beyond a disposable local environment.

## 2. Start local infrastructure

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

This starts PostgreSQL, Redis, MinIO, and creates the private `social-v1` bucket. The default `RUNTIME_STORE=memory` keeps the local snapshot workflow and embedded worker. Set `RUNTIME_STORE=postgres` to use PostgreSQL and a separate BullMQ worker.

## 3. Install dependencies and run the core app

```bash
corepack enable
corepack pnpm install
npm run dev
```

`npm run dev` starts only Web + API. Open `http://127.0.0.1:3000`, then log in with `DEV_OWNER_EMAIL` / `DEV_OWNER_PASSWORD`. The API listens on port 4000 and runs the embedded local publish/metrics worker. With the default `DEV_STORE_FILE=.data/local-store.json`, business state is atomically snapshotted every two seconds and restored after restart; encrypted social credentials remain encrypted in the snapshot. Use the same hostname for Web and API (the default API URL is `http://127.0.0.1:4000`) so the CSRF cookie is accessible to Web after login. The refresh cookie remains HttpOnly and limited to `/auth`.

Persistent runtime:

```bash
docker exec docker-postgres-1 psql -U postgres -d postgres -c "CREATE DATABASE social_v1_test"
# Set RUNTIME_STORE=postgres and DEV_IN_MEMORY=0 in .env; set DEV_SEED=1 only for a disposable local DB.
pnpm --filter @app/database migrate:deploy
pnpm dev
pnpm dev:worker
```

`pnpm dev:worker` runs separately from the API in PostgreSQL mode. The worker reconstructs scheduled jobs from the database when it starts. Create `social_v1_test` once; an existing database may report that it already exists.

## 4. Optional Windows Browser Gateway

Install GPMLogin on the Windows browser machine and ensure its local API is reachable only from localhost (default base URL `http://127.0.0.1:9495/api/v1`). Configure `BROWSER_NODE_ID` plus either `BROWSER_NODE_KEY` or the one-time `BROWSER_REGISTRATION_TOKEN`, then run:

```bash
npm run dev:gateway
```

The gateway registers/heartbeats to `CORE_API_URL`, starts the configured GPM profile, connects Playwright through CDP, and executes fail-closed platform browser flows. Configure the four `*_GPM_PROFILE_ID` values on the API machine to enable HYBRID browser strategies for the seeded local accounts.
Keep `BROWSER_TASK_STATE_FILE` on persistent storage on the gateway machine (default `.data/browser-gateway-tasks-<nodeId>.json`). It records accepted browser task IDs and outcomes across restarts. Preserve it when upgrading the gateway; a task interrupted during submission is marked `OUTCOME_UNKNOWN` for manual reconciliation rather than submitted again.

## 5. Verify

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
docker exec docker-postgres-1 psql -U postgres -d postgres -c "CREATE DATABASE social_v1_test"
# PowerShell:
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/social_v1_test'
$env:DATABASE_URL_TEST=$env:DATABASE_URL
$env:REDIS_URL_TEST='redis://127.0.0.1:6379'
pnpm --filter @app/database migrate:deploy
pnpm verify
```

`pnpm verify` requires PostgreSQL, Redis, and `ffprobe` because their contract, restart, and media tests are mandatory. It runs lint, typecheck, at least 102 Node tests, Web build, Playwright E2E, and the evidence check.

Requirements:

- Node >=24.7 and <25: the API's argon2id hasher needs `crypto.argon2Sync`, and `pnpm install` refuses other Node versions (`engineStrict`).
- Ports 127.0.0.1:3000 and 127.0.0.1:4000 must be free: stop `pnpm dev` first.
- Install Chromium for Playwright once: `pnpm --filter web exec playwright install chromium`.
- Do not export `NEXT_PUBLIC_API_BASE_URL` when building for the E2E run; the build must keep the default `http://127.0.0.1:4000`.
- A passing run on your machine ends with `verify-v1: OK (...) — LOCAL @ <sha> (clean|dirty) — không phải bằng chứng CI`. This is `LOCAL` evidence, not CI evidence. Record it in `docs/verification/v1-acceptance.md` only when the line says `(clean)`.

The automated gate covers lint, strict typecheck, Node tests (unit tests, the acceptance harness and the HTTP API smoke), the production build, the Playwright UI journey and the evidence check. Live Facebook/Instagram/Threads/TikTok publishing and GPMLogin smoke tests require real authorized test accounts and are deliberately separate acceptance gates.
