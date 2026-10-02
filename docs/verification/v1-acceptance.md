# V1 Acceptance Evidence

## Automated implementation gate

Status: PASS — 2026-10-01; lint, strict typecheck, 103/103 tests, and build succeeded in the sandbox.

Evidence command: `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build`.

## Critical journey

Status: PASS — deterministic acceptance harness completed login → product → signed media → content/4 variants → publish → tracked redirect → metrics → analytics.

The local deterministic acceptance harness covers login → product → signed media → content + 4 variants → validate/schedule → publish worker → tracked redirect → metrics → analytics.

## Local-first persistence

Status: PASS — local business state can be restored from `DEV_STORE_FILE` via atomic JSON snapshots; social credentials remain encrypted ciphertext. S3-compatible signed media upload, embedded publish worker, hourly metrics snapshots, and restart-safe account seeding are covered by automated tests.

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

Status: BLOCKED_LOCAL_ENV — this ChatGPT sandbox currently exposes Node 22 and no Docker daemon. CI is pinned to Node 24; Docker Compose and native GPMLogin must be verified on the target machine.
