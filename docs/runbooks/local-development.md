# Local development

## Prerequisites

- Node 24.x and Corepack.
- pnpm 10.17.1 (the repo pins this through `packageManager`).
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

This starts PostgreSQL, Redis, MinIO, and creates the private `social-v1` bucket. V1 local core uses the deterministic in-memory business store (`DEV_IN_MEMORY=1`) with an embedded worker, while MinIO is used for real media uploads. The Prisma schema/migration is included for the cloud/persistent runtime path.

## 3. Install dependencies and run the core app

```bash
corepack enable
corepack pnpm install
npm run dev
```

`npm run dev` starts only Web + API. Open `http://localhost:3000`, then log in with `DEV_OWNER_EMAIL` / `DEV_OWNER_PASSWORD`. The API listens on port 4000 and runs the embedded local publish/metrics worker. With the default `DEV_STORE_FILE=.data/local-store.json`, business state is atomically snapshotted every two seconds and restored after restart; encrypted social credentials remain encrypted in the snapshot.

Optional standalone worker:

```bash
npm run dev:worker
```

Use it only with the persistent Redis/PostgreSQL runtime; it is not needed by `DEV_IN_MEMORY=1`.

## 4. Optional Windows Browser Gateway

Install GPMLogin on the Windows browser machine and ensure its local API is reachable only from localhost (default base URL `http://127.0.0.1:9495/api/v1`). Configure `BROWSER_NODE_ID` plus either `BROWSER_NODE_KEY` or the one-time `BROWSER_REGISTRATION_TOKEN`, then run:

```bash
npm run dev:gateway
```

The gateway registers/heartbeats to `CORE_API_URL`, starts the configured GPM profile, connects Playwright through CDP, and executes fail-closed platform browser flows. Configure the four `*_GPM_PROFILE_ID` values on the API machine to enable HYBRID browser strategies for the seeded local accounts.

## 5. Verify

```bash
npm run verify
```

The automated gate covers lint, strict typecheck, unit/integration tests, build checks, and V1 artifact verification. Live Facebook/Instagram/Threads/TikTok publishing and GPMLogin smoke tests require real authorized test accounts and are deliberately separate acceptance gates.
