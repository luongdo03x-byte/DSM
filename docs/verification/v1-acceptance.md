# V1 Acceptance Evidence

This file records the acceptance evidence for DSM V1. `node scripts/verify-v1.mjs` (the last step of `pnpm verify` and of the `CI / verify` job) parses it and fails the gate when one of the rules below is broken.

Evidence rules:

- Every `## ` section has exactly one status line, written at the start of a line as `Status: <STATUS>` or `Status: <STATUS> — <explanation>`.
- Valid statuses: `PASS`, `LOCAL`, `CI`, `NOT_VERIFIED`, `BLOCKED_EXTERNAL`, `BLOCKED_LOCAL_ENV`.
- `PASS` requires, in the same section, the line `Evidence: https://github.com/<owner>/<repo>/actions/runs/<run id> @ <40-character commit SHA>` pointing at a successful `CI / verify` run.
- `LOCAL` requires, in the same section, the line `Evidence: local pnpm verify @ <40-character commit SHA> (<YYYY-MM-DD>, <machine>, node v24.x.y)`. Record it only after `pnpm install --frozen-lockfile && pnpm verify` passed on a clean clone and `verify-v1` printed `(clean)`. `LOCAL` is not CI evidence.
- `CI` marks a gate that `CI / verify` enforces automatically on the head of every pull request and on every push to `main` (intermediate commits are not checked one by one). Never record `PASS` by hand for these gates.
- `NOT_VERIFIED` means that no evidence exists yet. `BLOCKED_EXTERNAL` and `BLOCKED_LOCAL_ENV` mean that the check needs external accounts or an environment that is not available.
- This introduction must not contain status or evidence lines.

History:

- 2026-10-13: the PASS claims dated 2026-10-01 ("103/103 tests", "covered by automated tests") are withdrawn. They were produced in a sandbox, not in CI, carried no commit SHA, and the tests they refer to cannot be recovered from the git history. The gate was rebuilt in sub-project SP1 (`docs/superpowers/specs/2026-10-13-dsm-sp1-ci-verification-gate-design.md`).

## Automated implementation gate

Status: CI — enforced by `CI / verify` (`.github/workflows/ci.yml`) on every pull request head and every push to `main`.

Steps of the `verify` job, in order (the first failure stops the job):

1. `pnpm install --frozen-lockfile` with Node from `.node-version` and pnpm from `packageManager`; `engineStrict` rejects Node outside `>=24.7 <25`.
2. `pnpm lint` (`scripts/lint.mjs`): no `TODO`/`FIXME`/`HACK` in `.ts`, `.tsx` and `.mjs` files under `apps`, `packages`, `scripts` and `tests`; no skip, only, todo, fail, fixme or expectFailure markers under `tests/` and `apps/web/tests/`.
3. `pnpm typecheck`: three strict TypeScript programs (`tsconfig.json`, `apps/web/tsconfig.json`, `tests/web/tsconfig.json`).
4. `pnpm test` (`scripts/run-tests.mjs`): every `tests/**/*.test.ts`, JUnit report in `test-results/node-tests.xml`.
5. `pnpm build`: `next build` of `apps/web`.
6. `pnpm --filter web exec playwright install --with-deps chromium`.
7. `pnpm test:e2e`: Playwright against the real API and `next start` on 127.0.0.1, JSON report in `test-results/e2e.json`.
8. `node scripts/verify-v1.mjs`: checks both reports and this file.
9. Clean tree: `git status --porcelain` must print nothing.

## Critical journey

Status: CI — the three required tests below run in every `CI / verify` run; `verify-v1` fails when one of them is missing, skipped or marked as expected to fail.

| Layer | File | Test name |
|---|---|---|
| Acceptance harness | `tests/acceptance/v1-acceptance-harness.test.ts` | `v1 acceptance harness` |
| HTTP API smoke | `tests/integration/http-api-smoke.test.ts` | `http api smoke journey` |
| UI end-to-end | `apps/web/tests/v1-critical-journey.spec.ts` | `v1 critical UI journey` |

Scope limits:

- The harness and the HTTP smoke publish through `FakePublisher` (`apps/worker/src/testing/fake-publisher.ts`); no real platform API is called.
- The UI E2E covers login, navigation (Tổng quan, Sản phẩm, Nội dung, Lịch đăng, Phân tích), reload with session refresh, and logout on a production build. It does not publish through the UI.
- The real Meta and TikTok publisher wiring is not covered by any automated test (see the live publish sections below).

## CI baseline (SP1)

Status: LOCAL — `pnpm verify` passed on a clean clone; no `CI / verify` run has passed yet.

Evidence: local pnpm verify @ b8f835134f4970d1f519346421069074e07c0cd5 (2026-10-16, DESKTOP-T6MQM3F, node v24.21.0)

How this section changes:

- `LOCAL`: after `pnpm install --frozen-lockfile && pnpm verify` passed on a clean clone of the latest code commit; the evidence line points at that commit and is committed afterwards, because a commit cannot contain its own SHA.
- `PASS`: after a successful `CI / verify` run on `main`, with the run URL and the SHA it checked; the annotated tag `gd0-sp1-ci-green` points at the same SHA.

## Persistent runtime (SP2)

Status: CI — PostgreSQL repository contracts, legacy snapshot loading, Redis queue contracts, worker restart, and two-worker duplicate prevention run in `CI / verify` with PostgreSQL 17 and Redis 7 service containers.

Local verification on the SP2 branch passed 82 Node tests and one Playwright E2E with PostgreSQL and Redis running in Docker. This is local evidence; the workflow has not produced a successful CI run yet.

## Media pipeline (SP3)

Status: CI — the workflow runs image normalization, HEIC decoding, EXIF removal, crop and size limits, video probing, ordered album, preflight, derived asset reuse, and HTTP album journey tests on every pull request head and push to `main`.

Local verification on the SP3 branch passed 104 Node tests and one Playwright E2E. `verify-v1` enforces the 104 test floor. This is local evidence; no successful `CI / verify` run has been observed for SP3.

The HTTP album journey publishes through `FakePublisher`. It verifies the media pipeline and job flow, while real platform album APIs and public media domain verification remain later integration work.

## Facebook live publish

Status: BLOCKED_EXTERNAL — requires a real Meta app, Page/account authorization, approved permissions, and a safe test post target.

## Instagram live publish

Status: BLOCKED_EXTERNAL — requires an eligible Instagram professional account linked to Meta authorization and safe test media.

## Threads live publish

Status: BLOCKED_EXTERNAL — requires Threads API authorization and a safe test account.

## TikTok live publish

Status: BLOCKED_EXTERNAL — requires TikTok Content Posting API credentials, Direct Post audit/approval, creator authorization, and verified media domain where required.

## GPMLogin browser smoke

Status: BLOCKED_EXTERNAL — requires a Windows runner with GPMLogin installed, authorized test profiles, and browser session access.

## Docker/Node 24 environment

Status: NOT_VERIFIED — the staging VPS deployment and external object storage backup/restore still require an operational dry run. Local development has Node 24 and Docker available.
