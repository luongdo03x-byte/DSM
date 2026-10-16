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

`npm run dev` starts only Web + API. Open `http://127.0.0.1:3000`, then log in with `DEV_OWNER_EMAIL` / `DEV_OWNER_PASSWORD`. The API listens on port 4000 and runs the embedded local publish/metrics worker. With the default `DEV_STORE_FILE=.data/local-store.json`, business state is atomically snapshotted every two seconds and restored after restart; encrypted social credentials remain encrypted in the snapshot. Use the same hostname for Web and API (the default API URL is `http://127.0.0.1:4000`) so the CSRF cookie is accessible to Web after login. The refresh cookie remains HttpOnly and limited to `/auth`.

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
pnpm verify
```

`pnpm verify` runs the same chain as the `CI / verify` job: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (a real `next build`), `pnpm test:e2e` (Playwright starts the API on 127.0.0.1:4000 and `next start` on 127.0.0.1:3000 by itself) and `node scripts/verify-v1.mjs` (checks the test reports and `docs/verification/v1-acceptance.md`).

Requirements:

- Node >=24.7 and <25: the API's argon2id hasher needs `crypto.argon2Sync`, and `pnpm install` refuses other Node versions (`engineStrict`).
- Ports 127.0.0.1:3000 and 127.0.0.1:4000 must be free: stop `pnpm dev` first.
- Install Chromium for Playwright once: `pnpm --filter web exec playwright install chromium`.
- Do not export `NEXT_PUBLIC_API_BASE_URL` when building for the E2E run; the build must keep the default `http://127.0.0.1:4000`.
- A passing run on your machine ends with `verify-v1: OK (...) — LOCAL @ <sha> (clean|dirty) — không phải bằng chứng CI`. This is `LOCAL` evidence, not CI evidence. Record it in `docs/verification/v1-acceptance.md` only when the line says `(clean)`.

The automated gate covers lint, strict typecheck, Node tests (unit tests, the acceptance harness and the HTTP API smoke), the production build, the Playwright UI journey and the evidence check. Live Facebook/Instagram/Threads/TikTok publishing and GPMLogin smoke tests require real authorized test accounts and are deliberately separate acceptance gates.
