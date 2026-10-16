# DSM SP1 — Khôi phục CI và cổng nghiệm thu: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng cho DSM một cổng kiểm tra không tự nói dối: `pnpm install --frozen-lockfile && pnpm verify` chỉ xanh khi code cài được trên Node ≥ 24.7 (dưới 25), qua lint, qua typecheck ba chương trình, build được bằng `next build` thật và chạy đúng ba lớp test (harness nghiệm thu, HTTP smoke với API thật, Playwright UI E2E). Workflow `CI / verify` chạy đúng chuỗi đó, và mọi trạng thái PASS trong tài liệu nghiệm thu truy được về một commit SHA và một run CI.

**Architecture:** Xếp chồng lên PR #1 (`ui-vietnamese-recovery` @ 4f1ea10) trên nhánh `claude/dreamy-shannon-416aba`. Mười một commit code theo đúng thứ tự ở spec mục 4.1, mỗi commit "nhất quán" (mọi bước của cổng đã tồn tại tới commit đó đều pass), cộng một commit bằng chứng `LOCAL`. Không thêm framework: lint vẫn là script quét văn bản; test Node chạy bằng `node --test` với reporter JUnit; Playwright tự dựng API in-memory và `next start` trên 127.0.0.1; `scripts/verify-v1.mjs` chỉ đọc hai báo cáo test và tài liệu nghiệm thu. Code production chỉ đổi 3 chỗ thuần về kiểu.

**Tech Stack:** Node 24 (≥ 24.7, < 25; `--experimental-strip-types`, `node:test`, reporter `spec` + `junit`), pnpm 10.17.1 workspace (`engineStrict`, lockfile v9), TypeScript 5.9 (3 chương trình `tsc`), Next.js 16.4 (`next build`/`next start`), Playwright 1.56.1 + Chromium 1194, GitHub Actions (`actions/*@v4`, `pnpm/action-setup@v4`).

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-sp1-ci-verification-gate-design.md` (đã duyệt; là nguồn sự thật cho mọi quyết định của plan này).

## Global Constraints

- Spec là nguồn sự thật; plan không đổi quyết định nào của spec. Mọi chỗ lệch đã đo được ghi ngay tại task liên quan và tổng hợp ở mục "Self-review".
- Môi trường cho mọi task (thiết lập ở Task 0 Step 1):
  - Node 24.x với x ≥ 7 (dưới 25) đứng đầu `PATH`. Môi trường cloud: `export PATH=$NODE24_HOME/bin:$PATH` (Node hệ thống là 22). `NODE24_HOME` là thư mục giải nén bản Node 24.7+ chính thức từ nodejs.org (tải `node-v24.x-linux-x64.tar.xz`, kiểm SHA256 theo `SHASUMS256.txt`). API dùng `crypto.argon2Sync`, chỉ có từ Node 24.7.0.
  - pnpm 10.17.1 (`packageManager` của `package.json` tự chọn đúng bản).
  - `export NEXT_TELEMETRY_DISABLED=1`; **không** export `NEXT_PUBLIC_API_BASE_URL` (bản build phải nhúng mặc định `http://127.0.0.1:4000`).
  - Môi trường cloud: `export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (có sẵn Chromium 1194, khớp Playwright 1.56.1); **không bao giờ** chạy `playwright install` ở đây. Máy khác: cài Chromium một lần bằng `pnpm --filter web exec playwright install chromium` sau Task 2.
  - Node 22 cho các kiểm tra âm (Task 0, 2, 6): `/opt/node22/bin` (`v22.22.0`); máy khác thì thay đường dẫn.
- Mọi lệnh chạy từ gốc repo, bằng bash (plan dùng `PIPESTATUS`, `/dev/tcp`, `<(…)`).
- Web và API luôn ở `127.0.0.1`, không bao giờ `localhost` (đã chứng minh: dùng `localhost` thì login bị CORS chặn hoặc mọi lần reload trả 401).
- Trước mọi lệnh chạy E2E (`pnpm test:e2e`, `pnpm verify`, phần lớn red-check), cổng `127.0.0.1:3000` và `127.0.0.1:4000` phải trống: tắt `pnpm dev`, `next start`/API cũ và mọi lần chạy E2E khác. Kiểm bằng `for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done` (container cloud không có `ss`).
- Không bao giờ commit file sinh ra: `test-results/`, `apps/web/test-results/`, `playwright-report/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `build.log`. Mỗi commit `git add` đúng các file của task (không `git add -A`, không `git commit -a`). Không dùng `git stash` (stash dùng chung giữa các worktree của repo); khôi phục bằng `git checkout -- <file>`.
- Mọi commit message kết thúc bằng đúng hai dòng trailer:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx
  ```

  Mọi lệnh `git commit` trong plan đã kèm hai cờ `--trailer` sinh ra hai dòng này; merge commit (Task 0, bước đóng) dùng `-m` thứ hai. Mô tả PR (Task 14, bước đóng) kết thúc bằng dòng attribution của phiên.
- Code production chỉ đổi 3 chỗ, thuần về kiểu: `apps/api/src/modules/accounts/credential-crypto.service.ts` (Task 3), `apps/web/src/features/browser-nodes/node-card.tsx` (Task 4), `apps/web/src/features/overview/overview-model.ts` (Task 5). `apps/api/src/main.ts`, `apps/worker/src/testing/fake-publisher.ts` và mọi file production khác không đổi; red-check chỉ sửa tạm rồi khôi phục.
- Threads, Browser Gateway/GPMLogin và `.github/workflows/browser-smoke.yml` giữ nguyên.
- Không commit thẳng vào `main` hay `ui-vietnamese-recovery`; không rebase, không force-push, không squash. Cả hai PR merge bằng merge commit.
- Mỗi task kết thúc bằng đúng một commit, trừ Task 0 (một merge commit), Task 12 (không commit) và Task 14 (push và mở PR).
- Output mẫu: `/…/DSM` là đường dẫn repo; `…` thay cho phần biến đổi (thời gian, stack dài, danh sách dài); `<sha …>` là SHA thật. Nội dung file và diff trong plan không có chỗ nào bị lược.
- Output thật khác Expected: dừng, khôi phục file đã sửa tạm, điều tra; không sửa Expected cho khớp.

## Review Focus

- Lint đi vào `node_modules`/`.next`, bỏ sót `.tsx` hoặc `tests/`, hoặc để lọt `test.skip`/`test.fail`/`expectFailure`: cổng xanh giả. → Task 1 Step 1–6 (ba probe), Task 12 red-check 1, 6, 7, 8.
- Node 22 hoặc 24.0–24.6 vẫn cài và chạy được (thiếu `crypto.argon2Sync`). → Task 2 Step 4–6 (`engineStrict`), Task 6 Step 3 (cổng phiên bản trong runner), Task 0 Step 1.
- Lockfile không tái lập được, hoặc Playwright lệch Chromium 1194. → Task 2 Step 3 và 6 (mã băm, `Version 1.56.1`, revision `1194`).
- Next tự ghi lại `apps/web/tsconfig.json`, hoặc file sinh ra lọt khỏi `.gitignore` làm bước "Clean tree" đỏ. → Task 4 Step 2 và 4 (`TSCONFIG_UNCHANGED`, mọi file sinh ra là `!!`), Task 9 Step 11, Task 11 Step 6, Task 12 red-check 10.
- Typecheck bỏ sót file (test Node mới, `.tsx`, `playwright.config.ts`, `tests/web`). → Task 3 Step 5, Task 5 Step 4, Task 9 Step 6 (`--listFilesOnly`).
- Runner đọc báo cáo cũ, chạy 0 test mà vẫn xanh, hoặc treo mãi vì handle bị rò. → Task 6 Step 1–4.
- Harness hoặc HTTP smoke xanh khi publish hỏng, hoặc HTTP smoke gửi request ra ngoài loopback. → Task 7 Step 3, Task 8 Step 3, Task 12 red-check 5.
- E2E xanh giả: bị skip, chờ response sai thời điểm, tiêu đề khớp theo tiền tố, mất phiên khi reload, tái dùng server lạ, biến môi trường của shell làm đổi hành vi API. → Task 9 Step 3, 5, 9, 10; Task 12 red-check 3.
- `verify-v1` chấp nhận báo cáo thiếu test bắt buộc, test bị skip, `test.fail()`, spec E2E thiếu/trùng, hoặc `PASS`/`LOCAL` thiếu Evidence. → Task 10 Step 3 và 7; Task 12 red-check 1, 2, 4, 8, 9; Task 13 Step 2.
- Workflow sai cú pháp/schema hoặc lệch khối YAML của spec. → Task 11 Step 1 và 5.
- Bằng chứng `LOCAL` ghi từ cây bẩn hoặc trỏ sai SHA. → Task 13 Step 1 (`SAME_COMMIT`, dòng cuối `(clean)`), Task 13 Step 2.
- Code production bị đổi ngoài 3 chỗ sửa kiểu. → Task 14 Step 1 (kiểm phạm vi file).

## Thứ tự task, commit và file dùng chung

| Task | Commit (spec mục 4.1) | Subject |
|---|---|---|
| 0 | merge PR #1 vào nhánh SP1 | `Merge branch 'ui-vietnamese-recovery' into claude/dreamy-shannon-416aba` |
| 1 | 1. lint | `chore(lint): scan tsx and tests, skip dot dirs, forbid test markers` |
| 2 | 2. toolchain | `build: pin Node >=24.7 <25, engineStrict, Playwright 1.56.1 and commit pnpm lockfile` |
| 3 | 3. typecheck root | `build(typecheck): check Node apps and tests without type shims` |
| 4 | 4. web tsconfig + `next build` | `build(web): commit strict web tsconfig and run real next build` |
| 5 | 5. typecheck `tests/web` | `build(typecheck): typecheck tests/web against the web tsconfig` |
| 6 | 6. test runner | `test: harden node test runner with Node 24.7 gate, JUnit report and timeout` |
| 7 | 7. test harness | `test: run v1 acceptance harness as a regression test` |
| 8 | 8. HTTP smoke | `test: add HTTP API smoke journey against the real API server` |
| 9 | 9. E2E | `test(e2e): run the Playwright UI journey against the real API and production build` |
| 10 | 10. `verify-v1` + tài liệu nghiệm thu | `test(verify): check JUnit, Playwright JSON and acceptance evidence in verify-v1` |
| 11 | 11. `ci.yml` + runbook + xóa `test:integration` | `ci: run the full verify gate in GitHub Actions and drop test:integration` |
| 12 | (red-check, không commit) | — |
| 13 | 12. bằng chứng `LOCAL` | `docs: record local SP1 verification evidence` |
| 14 | (push, PR vào `ui-vietnamese-recovery`) | — |
| Sau khi merge | bước đóng | `docs: record CI evidence for the SP1 gate` |

Các file nhiều task cùng sửa phải đi đúng trình tự sau (diff của mỗi task giả định đúng trạng thái task trước để lại):

- `package.json` (root):
  - PR #1: `engines.node` `>=24 <25`; `test` = `test:integration` = `node scripts/run-tests.mjs`; `typecheck` = `tsc -p tsconfig.json --noEmit`; `build` = `node scripts/build.mjs`; `verify` = `npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs`.
  - Task 2: `engines.node` → `>=24.7 <25`.
  - Task 4: `typecheck` → `tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json`; `build` → `pnpm --filter web build`.
  - Task 5: `typecheck` → dạng cuối (thêm `tsc -p tests/web/tsconfig.json`).
  - Task 9: thêm `test:e2e` = `pnpm --filter web test:e2e` (ngay sau `build`).
  - Task 10: `verify` → `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs` (verify-v1 mới cần `test-results/e2e.json`, nên `verify` phải chạy E2E ngay từ commit 10).
  - Task 11: xóa `test:integration`; khối `scripts` khớp spec mục 4.13 (kiểm ở Task 11 Step 4). `test`, `lint`, `dev*` không đổi suốt plan.
- `apps/web/package.json`: chỉ Task 2 (ghim `@playwright/test` `1.56.1`). Script `test:e2e` của app (`playwright test`) giữ nguyên.
- `.gitignore`: chỉ Task 2 (thêm 5 mẫu). Task 12 red-check 10 xóa tạm một dòng rồi khôi phục.
- `pnpm-lock.yaml`: Task 0 Step 5 sinh bản untracked (không commit); Task 2 xóa nó và sinh lại bằng pnpm 10.17.1 sau khi ghim Playwright, rồi commit. Không task nào sau đó đổi dependency hay sửa lockfile bằng tay.
- `apps/web/tests/v1-critical-journey.spec.ts`: Task 1 xóa đúng dòng `test.skip(...)`; Task 9 viết lại toàn bộ; Task 12 red-check 1 và 8 sửa tạm.
- `docs/verification/v1-acceptance.md`: Task 10 viết lại (`CI baseline (SP1)` ở `NOT_VERIFIED`); Task 12 red-check 4 sửa tạm; Task 13 chuyển sang `LOCAL` kèm Evidence; bước đóng chuyển sang `PASS`.
- Chỉ sửa tạm rồi khôi phục: `apps/worker/src/testing/fake-publisher.ts` (Task 7 Step 3, Task 12 red-check 5 và 7), `apps/api/src/main.ts` (red-check 3), `apps/web/src/app/layout.tsx` (red-check 6), `tests/web/navigation.test.ts` (red-check 9), hai file test của Task 7–8 (red-check 2 và 7).

Số test Node của `pnpm test`: 40 (Task 3–6), 41 (sau Task 7), 42 (từ Task 8; `MIN_NODE_TESTS = 42` ở Task 10). Số file mà `pnpm lint` in ra đổi theo trạng thái cây (cộng 1 `.ts` khi `apps/web/next-env.d.ts` đã được build sinh ra); chỉ `lint: ok` là điều kiện.

---

### Task 0: Chuẩn bị nhánh thực thi `claude/dreamy-shannon-416aba` trên nền PR #1

Spec: mục 4.1 (nhánh và trình tự merge). Task này chạy **trước** Task 1. Không sửa file nào; kết quả duy nhất là một merge commit đưa `origin/ui-vietnamese-recovery` (4f1ea10, head của PR #1) vào nhánh SP1. Mọi lệnh chạy từ gốc repo bằng bash.

Bất biến trong suốt SP1 (mục 4.1):

- Không commit thẳng vào `main` hay `ui-vietnamese-recovery`; mọi commit của plan nằm trên `claude/dreamy-shannon-416aba`.
- Không rebase, không force-push. Nếu bắt buộc có hotfix trên `main`, merge `main` vào nhánh SP1 bằng merge commit.

**Files:** không có (chỉ tạo merge commit).

**Interfaces:**
- Produces: nhánh `claude/dreamy-shannon-416aba` chứa toàn bộ code của PR #1 (4f1ea10) cộng các commit tài liệu (roadmap spec, SP1 spec, plan này); `node_modules` đã cài để Task 1 chạy được.
- Produces (môi trường cho mọi task sau): Node 24.x với x ≥ 7 đứng đầu `PATH`, pnpm 10.17.1, `PLAYWRIGHT_BROWSERS_PATH` trỏ tới Chromium 1194 (môi trường cloud), `NEXT_TELEMETRY_DISABLED=1`, không có `NEXT_PUBLIC_API_BASE_URL`.

- [ ] **Step 1: Thiết lập và kiểm tra môi trường (Node ≥ 24.7, pnpm 10.17.1)**

Môi trường cloud (máy khác: dùng Node 24.7+ và pnpm 10.17.1 có sẵn, cài Chromium một lần bằng `pnpm --filter web exec playwright install chromium` sau Task 2; **không** chạy `playwright install` trong môi trường cloud):

```bash
export PATH=$NODE24_HOME/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export NEXT_TELEMETRY_DISABLED=1
unset NEXT_PUBLIC_API_BASE_URL
```

Kiểm tra (lệnh kiểm phiên bản Node dùng đúng khoảng `>=24.7 <25` của spec):

```bash
NODE_CHECK='const [major, minor] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 7) { console.error(`cần Node >=24.7 <25, đang dùng ${process.version}`); process.exit(1); } console.log(`Node ${process.version} hợp lệ (>=24.7 <25)`);'
/opt/node22/bin/node -e "$NODE_CHECK"; echo "exit=$?"
node -e "$NODE_CHECK"; echo "exit=$?"
pnpm -v
ls "$PLAYWRIGHT_BROWSERS_PATH" | grep -x chromium-1194
```

Expected (dòng đầu là RED có chủ đích: lệnh kiểm từ chối Node 22 của hệ thống; nếu máy không có `/opt/node22`, bỏ dòng đó):

```
cần Node >=24.7 <25, đang dùng v22.22.0
exit=1
Node v24.21.0 hợp lệ (>=24.7 <25)
exit=0
10.17.1
chromium-1194
```

Nếu Node < 24.7 hoặc ≥ 25: dừng, cài đúng Node rồi làm lại. API dùng `crypto.argon2Sync`, chỉ có từ Node 24.7.0.

- [ ] **Step 2: Đứng trên nhánh SP1, cây sạch, xác nhận PR #1 chưa nằm trong nhánh (RED)**

```bash
git checkout claude/dreamy-shannon-416aba
git status --porcelain | wc -l
git merge-base --is-ancestor 4f1ea10123fc6d1b9d1447d64a4d789a0883beca HEAD; echo "PR1_IN_BRANCH=$?"
git log --format='%s' --reverse 7f562b6..HEAD
```

Expected:

```
0
PR1_IN_BRANCH=1
docs: add DSM social growth platform roadmap design
docs: add image and album posting to DSM roadmap spec
docs: record roadmap approval and keep Threads/Browser Gateway as-is
docs: add SP1 CI and verification gate design spec
docs: revise SP1 spec after adversarial review against PR #1 code
<subject của commit thêm plan này>
```

`0`: cây sạch (plan này đã được commit). `PR1_IN_BRANCH=1`: head của PR #1 chưa có trong nhánh. Nếu dòng đầu khác `0`: commit hoặc dọn thay đổi đang dở trước khi tiếp tục. Các dòng còn lại là commit tài liệu của nhánh tính từ `main` (7f562b6): năm commit đã có khi viết plan, cộng commit thêm plan này (dòng cuối, subject do người commit plan đặt). Ghi lại danh sách này: Task 14 Step 1 so lại đúng các dòng đó.

- [ ] **Step 3: Lấy `ui-vietnamese-recovery` và kiểm tra trước khi merge**

```bash
git fetch origin ui-vietnamese-recovery
git rev-parse origin/ui-vietnamese-recovery
git merge-base HEAD origin/ui-vietnamese-recovery
git diff --name-only "$(git merge-base HEAD origin/ui-vietnamese-recovery)" HEAD | grep -v '^docs/superpowers/' | wc -l
```

Expected:

```
4f1ea10123fc6d1b9d1447d64a4d789a0883beca
7f562b6f893b8320e31b2d4fca2be9d712564f2b
0
```

- Dòng 1: head của PR #1 đúng là commit spec đã đo. Nếu khác (PR #1 có commit mới): **dừng** và báo lại, vì mọi số đo của spec và plan dựa trên 4f1ea10.
- Dòng 2: merge-base là `main` (7f562b6).
- Dòng 3: từ merge-base, nhánh SP1 chỉ đổi file trong `docs/superpowers/`, nên merge không thể xung đột.

- [ ] **Step 4: Merge bằng merge commit (GREEN)**

```bash
git merge --no-edit --no-ff origin/ui-vietnamese-recovery -m "Merge branch 'ui-vietnamese-recovery' into claude/dreamy-shannon-416aba" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git merge-base --is-ancestor 4f1ea10123fc6d1b9d1447d64a4d789a0883beca HEAD; echo "PR1_IN_BRANCH=$?"
git log -1 --format='%s%n%P' | head -2
git diff --name-only origin/ui-vietnamese-recovery HEAD | grep -v '^docs/superpowers/' | wc -l
git status --porcelain | wc -l
```

Expected:

```
Merge made by the 'ort' strategy.
 …(danh sách file của PR #1)…
PR1_IN_BRANCH=0
Merge branch 'ui-vietnamese-recovery' into claude/dreamy-shannon-416aba
<sha head cũ của nhánh SP1> 4f1ea10123fc6d1b9d1447d64a4d789a0883beca
0
0
```

Merge commit có hai cha, cha thứ hai là 4f1ea10. So với `origin/ui-vietnamese-recovery`, nhánh chỉ khác ở `docs/superpowers/`. `-m` thứ hai thêm hai dòng trailer bắt buộc vào message (`--no-edit` để git không mở trình soạn thảo).

- [ ] **Step 5: Cài dependencies**

```bash
pnpm install 2>&1 | grep -E 'Ignored build scripts|^Done in'
git status --porcelain
pnpm --filter web exec playwright --version
```

Expected:

```
│   Ignored build scripts: @prisma/engines, msgpackr-extract, prisma.          │
Done in …s using pnpm v10.17.1
?? pnpm-lock.yaml
Version 1.64.0
```

- Cảnh báo "Ignored build scripts" được giữ nguyên (spec mục 4.2; SP2 xử lý).
- `pnpm-lock.yaml` untracked là bình thường: PR #1 chưa có lockfile. Task 2 Step 1 xóa file này rồi sinh lại sau khi ghim Playwright.
- Playwright đang là bản mới nhất mà `^1.55.0` cho phép (con số có thể khác `1.64.0`); Task 2 ghim `1.56.1`.
- Đã đo lại khi lắp plan (clone sạch của 4f1ea10, Node 24.21, pnpm 10.17.1): `Done in 5.4s`, đúng hai dòng trên, `?? pnpm-lock.yaml`, `Version 1.64.0`.

Không có commit nào khác ngoài merge commit. Chưa push (Task 14 push).

### Task 1: Lint quét đủ mã nguồn và chặn đánh dấu test (luật 1 + luật 2)

Spec: mục 4.4. Commit 1 trong thứ tự ở mục 4.1. Mọi lệnh chạy từ thư mục gốc repo, với Node 24.x (≥ 24.7) đứng đầu `PATH` (`node -v` in `v24.21.0` trong môi trường cloud) và pnpm 10.17.1. Task này không cần `node_modules`.

**Files:**
- Modify (viết lại toàn bộ): `scripts/lint.mjs`
- Modify: `apps/web/tests/v1-critical-journey.spec.ts` (chỉ xóa dòng 4 `test.skip(...)`, lý do ở Step 5)
- Tạm thời, không commit: `apps/web/src/lint-probe.tsx`, `tests/lint-probe-expect-failure.test.ts`, `tests/lint-probe-test-fail.test.ts`

**Interfaces:**
- Produces: `pnpm lint` (= `node scripts/lint.mjs`).
  - Khi pass: in `lint: ok (<N> files: <a> .ts, <b> .tsx, <c> .mjs)`, exit 0.
  - Khi fail: in `lint: <K> problem(s)`, sau đó mỗi vi phạm một dòng `  <đường dẫn>:<dòng> rule 1 (placeholder): <chuỗi khớp>` hoặc `  <đường dẫn>:<dòng> rule 2 (test marker): <chuỗi khớp>`, exit 1.
- Ràng buộc cho mọi task sau:
  - Mọi file `.ts`/`.tsx`/`.mjs` dưới `apps/`, `packages/`, `scripts/`, `tests/` không được chứa `TODO`, `FIXME`, `HACK` (viết hoa).
  - Mọi file dưới `tests/` và `apps/web/tests/` không được chứa `expectFailure`, khóa `skip:` hoặc `todo:`, hay `test.`/`it.`/`describe.` nối với `skip`/`only`/`todo`/`fail`/`fixme`.

- [ ] **Step 1: Tạo ba file probe (kiểm tra phải bắt được)**

```bash
printf '%s\n' "export const probe = 'x'; // TODO: probe luật 1" > apps/web/src/lint-probe.tsx
printf '%s\n' "import {test} from 'node:test';" "test('probe', {expectFailure: true}, () => {});" > tests/lint-probe-expect-failure.test.ts
printf '%s\n' "import {test} from '@playwright/test';" "test.fail('probe', async () => {});" > tests/lint-probe-test-fail.test.ts
```

Ba file mô phỏng ba lỗi cố ý: `TODO` trong `.tsx` (red-check 6), `expectFailure` (red-check 7) và `test.fail` (red-check 8). Lint đúng phải báo cả ba.

- [ ] **Step 2: Chạy lint cũ, xác nhận RED**

```bash
node scripts/lint.mjs > /dev/null 2>&1; echo "EXIT=$?"
node scripts/lint.mjs 2>&1 | grep -c node_modules
node scripts/lint.mjs 2>&1 | grep -c lint-probe
```

Expected (khi đã cài dependencies):

```
EXIT=1
37
0
```

Lint cũ fail vì đi vào `apps/*/node_modules` (37 file của thư viện bị báo trong môi trường đo; con số phụ thuộc `node_modules`, chỉ cần lớn hơn 0), nhưng không thấy file probe nào (`0`): không quét `.tsx`, không quét `tests/`, chưa có luật 2. Nếu chưa cài dependencies thì hai dòng đầu là `EXIT=0` và `0`; dòng ba vẫn là `0`, nên vẫn là RED.

- [ ] **Step 3: Viết lại `scripts/lint.mjs`**

Nội dung đầy đủ của `scripts/lint.mjs`:

```js
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOTS = ['apps', 'packages', 'scripts', 'tests'];
const SOURCE_FILE = /\.(ts|tsx|mjs)$/;
const SELF = 'scripts/lint.mjs';
const TEST_DIRS = ['tests/', 'apps/web/tests/'];

const RULES = [
  {
    name: 'rule 1 (placeholder)',
    appliesTo: () => true,
    patterns: [/\b(TODO|FIXME|HACK)\b/],
  },
  {
    name: 'rule 2 (test marker)',
    appliesTo: (file) => TEST_DIRS.some((dir) => file.startsWith(dir)),
    patterns: [
      /\bexpectFailure\b/,
      /\b(skip|todo)\s*:/,
      /\b(test|it|describe)\.(skip|only|todo|fail|fixme)\b/,
    ],
  },
];

function walk(dir, out) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) out.push(path.split(sep).join('/'));
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(root, [])).filter((file) => file !== SELF);
const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const rule of RULES) {
    if (!rule.appliesTo(file)) continue;
    lines.forEach((line, index) => {
      for (const pattern of rule.patterns) {
        const match = line.match(pattern);
        if (match) problems.push(`${file}:${index + 1} ${rule.name}: ${match[0]}`);
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`lint: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
const count = (ext) => files.filter((file) => file.endsWith(ext)).length;
console.log(`lint: ok (${files.length} files: ${count('.ts')} .ts, ${count('.tsx')} .tsx, ${count('.mjs')} .mjs)`);
```

Điểm chính so với bản cũ: gốc quét thêm `tests`; bỏ qua mọi thư mục tên `node_modules` hoặc bắt đầu bằng `.` (`.next`, `.data`…); đuôi `.ts`, `.tsx`, `.mjs`; vẫn bỏ qua chính `scripts/lint.mjs`; luật 2 chỉ áp cho đường dẫn bắt đầu bằng `tests/` hoặc `apps/web/tests/`; báo đúng file và dòng.

- [ ] **Step 4: Chạy lint mới khi probe còn đó**

```bash
pnpm lint; echo "EXIT=$?"
```

Expected:

```
> dropship-social-v1@1.0.0 lint /…/DSM
> node scripts/lint.mjs

lint: 4 problem(s)
  apps/web/src/lint-probe.tsx:1 rule 1 (placeholder): TODO
  apps/web/tests/v1-critical-journey.spec.ts:4 rule 2 (test marker): test.skip
  tests/lint-probe-expect-failure.test.ts:2 rule 2 (test marker): expectFailure
  tests/lint-probe-test-fail.test.ts:2 rule 2 (test marker): test.fail
 ELIFECYCLE  Command failed with exit code 1.
EXIT=1
```

Cả ba probe đều bị bắt. Dòng thứ hai là `test.skip(!process.env.E2E_SEEDED, …)` có sẵn trong spec E2E của PR #1, đúng loại "test bị bỏ qua mà Playwright vẫn exit 0" mà luật 2 cấm.

- [ ] **Step 5: Xóa `test.skip` khỏi spec E2E**

Sửa `apps/web/tests/v1-critical-journey.spec.ts`, chỉ xóa một dòng:

```diff
--- a/apps/web/tests/v1-critical-journey.spec.ts
+++ b/apps/web/tests/v1-critical-journey.spec.ts
@@ -1,7 +1,6 @@
 import {test,expect} from '@playwright/test';
 
 test('v1 critical UI journey',async({page})=>{
-  test.skip(!process.env.E2E_SEEDED,'Requires seeded web/API test environment');
   await page.goto('/login');
   await page.getByLabel('Email').fill(process.env.E2E_EMAIL??'owner@test.local');
   await page.getByLabel('Mật khẩu').fill(process.env.E2E_PASSWORD??'test-password');
```

Lý do làm ở đây: spec (mục 4.10) xếp việc xóa dòng này vào commit 9. Nhưng luật 2 vào từ commit 1, và quy tắc "nhất quán" (mục 4.1) bắt `pnpm lint` pass ngay từ commit 1. Xóa riêng dòng này là cách tối thiểu; Task 9 vẫn viết lại toàn bộ file.

Hệ quả: từ commit 1 tới commit 9, `pnpm --filter web test:e2e` không còn tự skip mà sẽ fail nếu không có server. Đây là hành vi trung thực, và bước này chưa thuộc cổng tới Task 9 (root chưa có script `test:e2e`, `verify` cũ không chạy E2E).

- [ ] **Step 6: Gỡ probe, chạy lại, xác nhận GREEN**

```bash
pnpm lint; echo "EXIT=$?"
rm apps/web/src/lint-probe.tsx tests/lint-probe-expect-failure.test.ts tests/lint-probe-test-fail.test.ts
pnpm lint; echo "EXIT=$?"
git status --short
```

Expected:
- Lần chạy thứ nhất: `lint: 3 problem(s)`, chỉ ba dòng của ba probe, `EXIT=1`.
- Lần chạy thứ hai:

```
lint: ok (180 files: 130 .ts, 44 .tsx, 6 .mjs)
EXIT=0
```

  Nếu `apps/web/next-env.d.ts` còn sót từ một lần build trước thì là `181 files: 131 .ts, 44 .tsx, 6 .mjs`.
- `git status --short`:

```
 M apps/web/tests/v1-critical-journey.spec.ts
 M scripts/lint.mjs
?? pnpm-lock.yaml
```

  `?? pnpm-lock.yaml` là lockfile untracked do `pnpm install` ở Task 0 Step 5 sinh ra. Không add file này ở task này; Task 2 xóa rồi sinh lại nó.

- [ ] **Step 7: Commit**

```bash
git add scripts/lint.mjs apps/web/tests/v1-critical-journey.spec.ts
git commit -m "chore(lint): scan tsx and tests, skip dot dirs, forbid test markers" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

### Task 2: Toolchain cố định: Node >=24.7 <25, engineStrict, Playwright 1.56.1, lockfile

Spec: mục 4.2. Commit 2 trong thứ tự ở mục 4.1. Node 22 của hệ thống nằm ở `/opt/node22/bin` (`node -v` in `v22.22.0`); nếu máy khác, thay đường dẫn đó. Không chạy `playwright install`: Chromium 1194 đã có sẵn tại `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

**Files:**
- Modify: `package.json` (`engines.node`)
- Modify: `apps/web/package.json` (`@playwright/test`)
- Modify (nội dung đầy đủ bên dưới): `pnpm-workspace.yaml`
- Modify (nội dung đầy đủ bên dưới): `.gitignore`
- Create: `.node-version`
- Create: `pnpm-lock.yaml` (do pnpm sinh, không viết tay)

**Interfaces:**
- Produces: `pnpm install --frozen-lockfile` chạy được trên Node ≥ 24.7 và bị từ chối trên Node 22 (`ERR_PNPM_UNSUPPORTED_ENGINE`); `.node-version` cho `actions/setup-node` (Task 11); `.gitignore` che mọi file sinh ra bởi `tsc`, `next build` và Playwright (Task 4, 5, 9, 11 dựa vào đây).

- [ ] **Step 1: Kiểm tra hiện trạng, xác nhận RED**

```bash
git ls-files pnpm-lock.yaml
rm -f pnpm-lock.yaml
cat .node-version; echo "EXIT=$?"
node -p "require('./apps/web/package.json').devDependencies['@playwright/test']"
node -p "require('./package.json').engines.node"
grep -c engineStrict pnpm-workspace.yaml
pnpm install --frozen-lockfile; echo "EXIT=$?"
```

`git ls-files` phải in rỗng: lockfile chưa từng được commit. Nếu có bản untracked còn sót từ lần cài không frozen trước đó, `rm -f` xóa nó để lockfile được sinh lại từ đầu.

Expected:

```
cat: .node-version: No such file or directory
EXIT=1
^1.55.0
>=24 <25
0
Scope: all 10 workspace projects
 ERROR  Headless installation requires a pnpm-lock.yaml file

pnpm: Headless installation requires a pnpm-lock.yaml file
    at tryFrozenInstall (/…/pnpm.cjs:…)
…
EXIT=1
```

`node_modules` đã có từ Task 0 Step 5, nên pnpm báo lỗi "Headless installation" (đo lại khi lắp plan: clone sạch của 4f1ea10 sau `pnpm install`, Node 24.21, pnpm 10.17.1). Trên clone chưa cài dependencies, lỗi là ` ERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is absent`. Cả hai trường hợp đều `EXIT=1`.

- [ ] **Step 2: Ghim phiên bản Node, Playwright; thêm `.node-version` và `.gitignore`**

Sửa `package.json`:

```diff
--- a/package.json
+++ b/package.json
@@ -4,7 +4,7 @@
   "version": "1.0.0",
   "packageManager": "pnpm@10.17.1",
   "engines": {
-    "node": ">=24 <25"
+    "node": ">=24.7 <25"
   },
   "scripts": {
     "test": "node scripts/run-tests.mjs",
```

Sửa `apps/web/package.json`:

```diff
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -15,7 +15,7 @@
     "zod": "^4.1.0"
   },
   "devDependencies": {
-    "@playwright/test": "^1.55.0",
+    "@playwright/test": "1.56.1",
     "@types/react": "^19.2.0",
     "@types/react-dom": "^19.2.0",
     "tailwindcss": "^4.1.0",
```

Tạo `.node-version`, nội dung đúng một dòng `24`:

```bash
printf '24\n' > .node-version
```

Nội dung đầy đủ của `.gitignore` (thêm 5 dòng cuối):

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
coverage/
.superpowers/
backups/
debug-artifacts/
*.log

.data/
.next/
next-env.d.ts
*.tsbuildinfo
test-results/
playwright-report/
```

- [ ] **Step 3: Sinh `pnpm-lock.yaml` bằng pnpm 10.17.1 trên Node 24**

```bash
node -v
pnpm install; echo "EXIT=$?"
```

Expected: `v24.21.0` (hoặc 24.x ≥ 24.7). Phần cuối output:

```
 WARN  1 deprecated subdependencies found: cron-parser@4.9.0
…
│   Ignored build scripts: @prisma/engines, msgpackr-extract, prisma.          │
…
Done in …s using pnpm v10.17.1
EXIT=0
```

Cảnh báo "Ignored build scripts" giữ nguyên (SP2 xử lý). Kiểm tra lockfile:

```bash
head -1 pnpm-lock.yaml
grep -n -A2 "^      '@playwright/test':" pnpm-lock.yaml | head -3
grep -nE "^  playwright(-core)?@" pnpm-lock.yaml | head -4
sha256sum pnpm-lock.yaml
```

Expected:

```
lockfileVersion: '9.0'
63:      '@playwright/test':
64-        specifier: 1.56.1
65-        version: 1.56.1
1213:  playwright-core@1.56.1:
1218:  playwright-core@1.64.0:
1223:  playwright@1.56.1:
1228:  playwright@1.64.0:
0c305d2ca2498f109d51e56f38f958fda62849fe8aebfd3f6dc78ef2d3557c9c  pnpm-lock.yaml
```

Hai bản `playwright`/`playwright-core` (1.56.1 cho `apps/web`, 1.64.0 cho `apps/browser-gateway` với `^1.55.0`) là chủ ý, như mục 4.2 đã chấp nhận.

Mã băm đo ngày 13/10/2026: hai lần sinh độc lập (một lần trên clone sạch, không có `node_modules`) cho cùng từng byte. Nếu registry đã có bản mới khớp các khoảng phiên bản thì mã băm và số dòng có thể khác. Khi đó chỉ cần ba dòng `@playwright/test` ở trên đúng và có đủ hai bản playwright. Không bao giờ sửa lockfile bằng tay.

- [ ] **Step 4: Xác nhận RED cho engine: Node 22 vẫn cài được**

```bash
PATH=/opt/node22/bin:$PATH node -v
PATH=/opt/node22/bin:$PATH pnpm install --frozen-lockfile; echo "EXIT=$?"
```

Expected:

```
v22.22.0
 WARN  Unsupported engine: wanted: {"node":">=24.7 <25"} (current: {"node":"v22.22.0","pnpm":"10.17.1"})
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
…
EXIT=0
```

Chỉ có `engines` thì Node 22 mới bị cảnh báo, vẫn cài được. `node_modules` không đổi ("Already up to date").

- [ ] **Step 5: Bật `engineStrict`**

Nội dung đầy đủ của `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
engineStrict: true
```

- [ ] **Step 6: Chạy lại, xác nhận GREEN**

```bash
PATH=/opt/node22/bin:$PATH pnpm install --frozen-lockfile; echo "EXIT=$?"
pnpm install --frozen-lockfile; echo "EXIT=$?"
pnpm --filter web exec playwright --version
node -p "require('./node_modules/.pnpm/playwright-core@1.56.1/node_modules/playwright-core/browsers.json').browsers.find((b) => b.name === 'chromium').revision"
ls "$PLAYWRIGHT_BROWSERS_PATH" | grep -- '-1194'
cat .node-version
pnpm lint
git status --short
```

Expected:

```
 ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)

Your Node version is incompatible with "/…/DSM".

Expected version: >=24.7 <25
Got: v22.22.0

This is happening because the package's manifest has an engines.node field specified.
To fix this issue, install the required Node version.
EXIT=1
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
…
Done in …ms using pnpm v10.17.1
EXIT=0
Version 1.56.1
1194
chromium-1194
chromium_headless_shell-1194
24
…
lint: ok (180 files: 130 .ts, 44 .tsx, 6 .mjs)
 M .gitignore
 M apps/web/package.json
 M package.json
 M pnpm-workspace.yaml
?? .node-version
?? pnpm-lock.yaml
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore .node-version package.json apps/web/package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "build: pin Node >=24.7 <25, engineStrict, Playwright 1.56.1 and commit pnpm lockfile" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

### Task 3: Typecheck root cho Node apps và tests, xóa type shim

Spec: mục 4.5a. Commit 3 trong thứ tự ở mục 4.1. Script `typecheck` giữ nguyên `tsc -p tsconfig.json --noEmit` ở task này (cờ `--noEmit` trùng với `noEmit` trong config, vô hại). Task 4 và Task 5 đổi script này.

**Files:**
- Modify (viết lại toàn bộ): `tsconfig.json`
- Delete: `types/node-shim.d.ts`, `types/web-shim.d.ts`
- Modify: `apps/api/src/modules/accounts/credential-crypto.service.ts` (chỉ sửa kiểu)

**Interfaces:**
- Produces: chương trình root kiểm `apps/api`, `apps/worker`, `apps/browser-gateway`, `packages`, và mọi `tests/**/*.ts` trừ `tests/web/**`.
- Ràng buộc: test mới của Task 7 (`tests/acceptance/…`) và Task 8 (`tests/integration/…`) phải qua chương trình này: lib `ES2024`, `types: ["node"]`, không DOM, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.

- [ ] **Step 1: Ghi nhận hiện trạng (4 lỗi)**

```bash
pnpm typecheck 2>&1 | grep -E "error TS"
```

Expected:

```
apps/api/src/entry.ts(2,1): error TS1375: 'await' expressions are only allowed at the top level of a file when that file is a module, but this file has no imports or exports. Consider adding an empty 'export {}' to make this file a module.
apps/api/src/modules/accounts/credential-crypto.service.ts(6,83): error TS2769: No overload matches this call.
apps/browser-gateway/src/entry.ts(2,1): error TS1375: 'await' expressions are only allowed at the top level of a file when that file is a module, but this file has no imports or exports. Consider adding an empty 'export {}' to make this file a module.
apps/worker/src/entry.ts(2,1): error TS1375: 'await' expressions are only allowed at the top level of a file when that file is a module, but this file has no imports or exports. Consider adding an empty 'export {}' to make this file a module.
```

- [ ] **Step 2: Viết lại `tsconfig.json` và xóa hai shim**

Nội dung đầy đủ của `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "lib": ["ES2024"],
    "types": ["node"],
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": [
    "apps/api/**/*.ts",
    "apps/worker/**/*.ts",
    "apps/browser-gateway/**/*.ts",
    "packages/**/*.ts",
    "tests/**/*.ts"
  ],
  "exclude": ["**/node_modules/**", "tests/web/**"]
}
```

```bash
git rm -q types/node-shim.d.ts types/web-shim.d.ts
ls types
```

Expected: `ls: cannot access 'types': No such file or directory`.

- [ ] **Step 3: Chạy typecheck, xác nhận RED (đúng 1 lỗi TS2749)**

```bash
pnpm typecheck; echo "EXIT=$?"
```

Expected:

```
> dropship-social-v1@1.0.0 typecheck /…/DSM
> tsc -p tsconfig.json --noEmit

apps/api/src/modules/accounts/credential-crypto.service.ts(4,14): error TS2749: 'CryptoKey' refers to a value, but is being used as a type here. Did you mean 'typeof CryptoKey'?
 ELIFECYCLE  Command failed with exit code 2.
EXIT=2
```

`moduleDetection: "force"` đã xóa 3 lỗi TS1375 mà không đổi code `entry.ts`. Lỗi TS2769 `BufferSource` biến mất cùng lib DOM. Chỉ còn TS2749: trong `@types/node`, `CryptoKey` toàn cục chỉ là giá trị.

- [ ] **Step 4: Sửa kiểu `credential-crypto.service.ts`**

```diff
--- a/apps/api/src/modules/accounts/credential-crypto.service.ts
+++ b/apps/api/src/modules/accounts/credential-crypto.service.ts
@@ -1,7 +1,8 @@
+import type {webcrypto} from 'node:crypto';
 export interface EncryptedSecret{ciphertext:string;iv:string;authTag:string}
 function bytesToB64(x:Uint8Array){return Buffer.from(x).toString('base64url')} function b64ToBytes(x:string){return new Uint8Array(Buffer.from(x,'base64url'))}
 export class CredentialCryptoService{
- private key:CryptoKey|undefined; private raw:Uint8Array;
+ private key:webcrypto.CryptoKey|undefined; private raw:Uint8Array;
  constructor(keyBytes:Uint8Array){if(keyBytes.byteLength!==32)throw new Error('CREDENTIAL_KEY_MUST_BE_32_BYTES');this.raw=keyBytes}
  private async getKey(){if(!this.key)this.key=await crypto.subtle.importKey('raw',this.raw,{name:'AES-GCM'},false,['encrypt','decrypt']);return this.key}
  async encrypt(plaintext:string,aad:string):Promise<EncryptedSecret>{const iv=crypto.getRandomValues(new Uint8Array(12));const data=new TextEncoder().encode(plaintext),extra=new TextEncoder().encode(aad);const enc=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:extra,tagLength:128},await this.getKey(),data));const body=enc.slice(0,-16),tag=enc.slice(-16);return {ciphertext:bytesToB64(body),iv:bytesToB64(iv),authTag:bytesToB64(tag)}}
```

Chỉ thêm một dòng `import type` (bị xóa khi chạy bằng `--experimental-strip-types`) và đổi kiểu của trường `key`. Không đổi hành vi.

- [ ] **Step 5: Chạy lại, xác nhận GREEN**

```bash
pnpm typecheck; echo "EXIT=$?"
pnpm exec tsc -p tsconfig.json --listFilesOnly | grep -c "/tests/smoke/"
pnpm exec tsc -p tsconfig.json --listFilesOnly | grep -c "/tests/web/"
pnpm exec tsc -p tsconfig.json --listFilesOnly | grep -c "/apps/web/"
pnpm lint
pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
```

Expected:

```
> dropship-social-v1@1.0.0 typecheck /…/DSM
> tsc -p tsconfig.json --noEmit

EXIT=0
1
0
0
…
lint: ok (180 files: 130 .ts, 44 .tsx, 6 .mjs)
ℹ tests 40
ℹ pass 40
ℹ fail 0
ℹ skipped 0
```

`tests/smoke` đã nằm trong chương trình root. `tests/web` và `apps/web` thì không, vì hai thư mục này có chương trình riêng ở Task 4 và Task 5. Script `build` lúc này vẫn là `node scripts/build.mjs`, chạy cùng lệnh `tsc` nên cũng pass.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json apps/api/src/modules/accounts/credential-crypto.service.ts
git status --short
git commit -m "build(typecheck): check Node apps and tests without type shims" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

`git status --short` trước commit phải đúng 4 dòng: `M  apps/api/src/modules/accounts/credential-crypto.service.ts`, `M  tsconfig.json`, `D  types/node-shim.d.ts`, `D  types/web-shim.d.ts`.

### Task 4: tsconfig cho web và `next build` thật

Spec: mục 4.5b và 4.6. Commit 4 trong thứ tự ở mục 4.1. Đặt `export NEXT_TELEMETRY_DISABLED=1` (giống CI) và **không** export `NEXT_PUBLIC_API_BASE_URL` (mục 4.6). Kiểm tra: `test -z "${NEXT_PUBLIC_API_BASE_URL:-}" && echo NO_API_OVERRIDE` phải in `NO_API_OVERRIDE`.

**Files:**
- Create: `apps/web/tsconfig.json`
- Modify: `apps/web/src/features/browser-nodes/node-card.tsx` (dòng 5, chỉ sửa kiểu)
- Modify: `package.json` (`typecheck`, `build`)
- Delete: `scripts/build.mjs`

**Interfaces:**
- Produces:
  - `pnpm build` = `pnpm --filter web build` = `next build` thật, có cổng TypeScript theo `apps/web/tsconfig.json`.
  - `pnpm typecheck` = root + web.
- Ràng buộc cho Task 9: chương trình web gồm mọi `apps/web/**/*.ts(x)`, kể cả `apps/web/playwright.config.ts` và `apps/web/tests/*.ts`. Vì vậy `playwright.config.ts`, `e2e-owner.ts` và spec E2E bị kiểm với `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`, cả trong `pnpm typecheck` lẫn trong `next build`. `@types/node` có mặt trong chương trình này (tự động, không giới hạn `types`).

- [ ] **Step 1: Tạo `apps/web/tsconfig.json`**

Nội dung đầy đủ (bản Next 16.4 tự sinh, cộng các tùy chọn nghiêm ngặt; không dùng `extends`):

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Stage ngay để phát hiện nếu Next ghi lại file:

```bash
git add apps/web/tsconfig.json
```

- [ ] **Step 2: Typecheck web và `next build`, xác nhận RED**

```bash
rm -rf apps/web/.next apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
pnpm exec tsc -p apps/web/tsconfig.json; echo "EXIT=$?"
pnpm --filter web build; echo "EXIT=$?"
git diff --exit-code apps/web/tsconfig.json && echo TSCONFIG_UNCHANGED
```

Expected:

```
apps/web/src/features/browser-nodes/node-registration-manager.tsx(18,372): error TS2375: Type '{ key: string; name: string; status: string; host: string; port: number; lastSeenAt: number | undefined; max: number; }' is not assignable to type '{ name: string; status: string; host?: string; port?: number; lastSeenAt?: number; max: number; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
  Types of property 'lastSeenAt' are incompatible.
    Type 'number | undefined' is not assignable to type 'number'.
      Type 'undefined' is not assignable to type 'number'.
EXIT=2

> web@ build /…/DSM/apps/web
> next build

▲ Next.js 16.4.0 (Turbopack)
…
✓ Compiled successfully in …s
  Running TypeScript ...
src/features/browser-nodes/node-registration-manager.tsx(18,372): error TS2375: Type '{ key: string; … lastSeenAt: number | undefined; max: number; }' is not assignable to type '{ … lastSeenAt?: number; max: number; }' with 'exactOptionalPropertyTypes: true'. …
Failed to type check.

/…/DSM/apps/web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@ build: `next build`
Exit status 1
EXIT=1
TSCONFIG_UNCHANGED
```

Lỗi duy nhất nằm ở `node-registration-manager.tsx:18`; kiểu nhận nằm ở `node-card.tsx:5`. `next build` đã có cổng TypeScript thật. `TSCONFIG_UNCHANGED` chứng minh Next không ghi lại file vì đủ khóa và không có `extends`.

(Để so sánh, đã đo: khi chưa có `apps/web/tsconfig.json`, `next build` tự tạo một tsconfig không nghiêm ngặt rồi fail với hàng loạt `TS5097 … 'allowImportingTsExtensions'`. Đó là lý do checkout sạch không build được.)

- [ ] **Step 3: Sửa kiểu `node-card.tsx`; đổi script; xóa `scripts/build.mjs`**

Trong `apps/web/src/features/browser-nodes/node-card.tsx` (dòng 5, dòng này rất dài), thay chuỗi xuất hiện đúng 1 lần:

```
lastSeenAt?:number;max:number}
```

bằng:

```
lastSeenAt?:number|undefined;max:number}
```

Kiểm tra:

```bash
grep -c "lastSeenAt?:number|undefined;max:number}" apps/web/src/features/browser-nodes/node-card.tsx
```

Expected: `1`. Chỉ đổi kiểu prop; không đổi hành vi Browser Nodes.

Sửa `package.json`:

```diff
--- a/package.json
+++ b/package.json
@@ -9,8 +9,8 @@
   "scripts": {
     "test": "node scripts/run-tests.mjs",
     "test:integration": "node scripts/run-tests.mjs",
-    "typecheck": "tsc -p tsconfig.json --noEmit",
-    "build": "node scripts/build.mjs",
+    "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json",
+    "build": "pnpm --filter web build",
     "lint": "node scripts/lint.mjs",
     "verify": "npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs",
     "dev": "corepack pnpm --parallel --filter api --filter web dev",
```

```bash
git rm -q scripts/build.mjs
```

Script `test:integration` và `verify` giữ nguyên ở task này (Task 11 xóa `test:integration`; `verify` đổi ở task E2E/bằng chứng).

- [ ] **Step 4: Typecheck trên cây sạch, build, xác nhận GREEN**

```bash
rm -rf apps/web/.next apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
pnpm typecheck; echo "EXIT=$?"
pnpm build > build.log 2>&1; echo "EXIT=$?"
tail -22 build.log
grep -cE '(○|ƒ) /' build.log
git diff --exit-code apps/web/tsconfig.json && echo TSCONFIG_UNCHANGED
git status --porcelain --ignored apps/web | grep -v node_modules
pnpm typecheck; echo "EXIT=$?"
pnpm lint
rm build.log
```

`pnpm typecheck` chạy lần đầu khi chưa có `next-env.d.ts` và `.next/types`, đúng thứ tự trong CI (typecheck trước build). Lần thứ hai chạy sau build, khi các file đó đã có. Cả hai đều phải 0 lỗi. `build.log` nằm trong mẫu `*.log` đã được ignore.

Expected:

```
> dropship-social-v1@1.0.0 typecheck /…/DSM
> tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json

EXIT=0
EXIT=0
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /app/brands/[brandId]/accounts
├ ƒ /app/brands/[brandId]/analytics
├ ƒ /app/brands/[brandId]/calendar
├ ƒ /app/brands/[brandId]/campaigns
├ ƒ /app/brands/[brandId]/content
├ ƒ /app/brands/[brandId]/content/[id]
├ ƒ /app/brands/[brandId]/overview
├ ƒ /app/brands/[brandId]/products
├ ƒ /app/brands/[brandId]/settings
├ ƒ /app/brands/[brandId]/settings/browser-nodes
├ ƒ /app/brands/[brandId]/settings/system-status
└ ○ /login


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

14
TSCONFIG_UNCHANGED
 M apps/web/src/features/browser-nodes/node-card.tsx
A  apps/web/tsconfig.json
!! apps/web/.next/
!! apps/web/next-env.d.ts
!! apps/web/tsconfig.tsbuildinfo
…
EXIT=0
…
lint: ok (180 files: 131 .ts, 44 .tsx, 5 .mjs)
```

Ở phần đầu `build.log` phải có `Running TypeScript ...` rồi `Finished TypeScript in …s ...`. 14 route. Mọi file sinh ra (`.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`) đều là `!!` (đã ignore nhờ Task 2), không có `??`. Lint đếm thêm `apps/web/next-env.d.ts` (131 `.ts`) vì file này không nằm trong thư mục bắt đầu bằng dấu chấm; nó không chứa chuỗi bị cấm. Còn `.next/` thì bị bỏ qua.

- [ ] **Step 5: Commit và xác nhận cây sạch**

```bash
git add apps/web/tsconfig.json apps/web/src/features/browser-nodes/node-card.tsx package.json
git commit -m "build(web): commit strict web tsconfig and run real next build" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git status --porcelain | wc -l
```

Expected: `0` (cây sạch dù `.next/`, `next-env.d.ts`, `*.tsbuildinfo` vẫn còn trên đĩa).

### Task 5: Typecheck `tests/web` (chương trình thứ ba)

Spec: mục 4.5c. Commit 5 trong thứ tự ở mục 4.1. Sau task này script `typecheck` có dạng cuối cùng của mục 4.13.

**Files:**
- Create: `tests/web/tsconfig.json`
- Modify: `apps/web/src/features/overview/overview-model.ts` (dòng 3, chỉ nới kiểu)
- Modify: `package.json` (`typecheck`)

**Interfaces:**
- Produces: `pnpm typecheck` = `tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json`.

- [ ] **Step 1: Tạo `tests/web/tsconfig.json`**

Nội dung đầy đủ:

```json
{
  "extends": "../../apps/web/tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["dom", "dom.iterable", "esnext"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 2: Typecheck `tests/web`, xác nhận RED**

```bash
pnpm exec tsc -p tests/web/tsconfig.json; echo "EXIT=$?"
```

Expected (đúng 2 lỗi):

```
tests/web/overview-model.test.ts(6,35): error TS2375: Type '{ posts: null; views: undefined; clicks: null; ctr: null; platforms: never[]; }' is not assignable to type 'AnalyticsSnapshot' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
  Types of property 'views' are incompatible.
    Type 'undefined' is not assignable to type 'number | null'.
tests/web/overview-model.test.ts(18,82): error TS2375: Type '{ platform: string; posts: null; views: number; clicks: undefined; ctr: number; }' is not assignable to type '{ platform: string; posts?: number | null; views?: number | null; clicks?: number | null; ctr?: number | null; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
  Types of property 'clicks' are incompatible.
    Type 'undefined' is not assignable to type 'number | null'.
EXIT=2
```

- [ ] **Step 3: Nới kiểu `AnalyticsSnapshot`; đổi script `typecheck`**

```diff
--- a/apps/web/src/features/overview/overview-model.ts
+++ b/apps/web/src/features/overview/overview-model.ts
@@ -1,6 +1,6 @@
 import {platformLabel,statusLabel} from '../../lib/ui/status.ts';
 
-export type AnalyticsSnapshot={posts?:number|null;views?:number|null;clicks?:number|null;ctr?:number|null;platforms?:Array<{platform:string;posts?:number|null;views?:number|null;clicks?:number|null;ctr?:number|null}>};
+export type AnalyticsSnapshot={posts?:number|null|undefined;views?:number|null|undefined;clicks?:number|null|undefined;ctr?:number|null|undefined;platforms?:Array<{platform:string;posts?:number|null|undefined;views?:number|null|undefined;clicks?:number|null|undefined;ctr?:number|null|undefined}>|undefined};
 export type AccountSnapshot={id:string;platform?:string;username?:string;status?:string;publishMode?:string;browserProfileId?:string};
 export type JobSnapshot={id:string;platform?:string;status?:string;scheduledAt?:number;errorMessage?:string;errorCode?:string};
 
```

Mọi thuộc tính tùy chọn của `AnalyticsSnapshot` (kể cả từng dòng `platforms`) thành `… | undefined`. Không đổi logic.

```diff
--- a/package.json
+++ b/package.json
@@ -9,7 +9,7 @@
   "scripts": {
     "test": "node scripts/run-tests.mjs",
     "test:integration": "node scripts/run-tests.mjs",
-    "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json",
+    "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json",
     "build": "pnpm --filter web build",
     "lint": "node scripts/lint.mjs",
     "verify": "npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs",
```

Khối `scripts` của `package.json` sau task này:

```json
  "scripts": {
    "test": "node scripts/run-tests.mjs",
    "test:integration": "node scripts/run-tests.mjs",
    "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json",
    "build": "pnpm --filter web build",
    "lint": "node scripts/lint.mjs",
    "verify": "npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs",
    "dev": "corepack pnpm --parallel --filter api --filter web dev",
    "dev:gateway": "corepack pnpm --filter browser-gateway dev",
    "dev:worker": "corepack pnpm --filter worker dev",
    "dev:all": "corepack pnpm --parallel --filter api --filter worker --filter web --filter browser-gateway dev"
  },
```

- [ ] **Step 4: Chạy lại, xác nhận GREEN**

```bash
pnpm typecheck; echo "EXIT=$?"
pnpm exec tsc -p tests/web/tsconfig.json --listFilesOnly | grep -c "/tests/web/"
pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
pnpm lint
git status --porcelain --ignored tests | grep -v node_modules
```

Expected:

```
> dropship-social-v1@1.0.0 typecheck /…/DSM
> tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json

EXIT=0
13
ℹ tests 40
ℹ pass 40
ℹ fail 0
ℹ skipped 0
…
lint: ok (180 files: 131 .ts, 44 .tsx, 5 .mjs)
?? tests/web/tsconfig.json
!! tests/web/tsconfig.tsbuildinfo
```

Cả 13 file `tests/web/*.test.ts` nằm trong chương trình thứ ba. `tests/web/tsconfig.tsbuildinfo` (do `incremental: true` kế thừa từ web) đã được ignore. Số file lint là 180/131 nếu `apps/web/next-env.d.ts` còn từ Task 4, hoặc 179/130 trên cây chưa build.

- [ ] **Step 5: Commit**

```bash
git add tests/web/tsconfig.json apps/web/src/features/overview/overview-model.ts package.json
git commit -m "build(typecheck): typecheck tests/web against the web tsconfig" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git status --porcelain | wc -l
```

Expected: `0`.

- [ ] **Step 6: Kiểm tra commit 1–5 trên clone sạch**

```bash
CLEAN_DIR="$(mktemp -d)"
git clone -q . "$CLEAN_DIR/dsm"
(cd "$CLEAN_DIR/dsm" && git log --oneline -1 && pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build > build.log 2>&1 && grep -cE '(○|ƒ) /' build.log && rm build.log && echo "PORCELAIN_LINES=$(git status --porcelain | wc -l)")
rm -rf "$CLEAN_DIR"
```

Expected:
- Dòng đầu là commit Task 5.
- `pnpm install --frozen-lockfile` in `Done in …s using pnpm v10.17.1`.
- `lint: ok (179 files: 130 .ts, 44 .tsx, 5 .mjs)`.
- `pnpm typecheck` chạy cả ba chương trình, 0 lỗi.
- `pnpm test`: `ℹ pass 40`, `ℹ fail 0`.
- `14` (số route).
- `PORCELAIN_LINES=0`.

Đây là điều kiện "nhất quán" sau commit 5 (mục 4.1): `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build` pass từ checkout sạch và cây vẫn sạch.

### Task 6: Test runner `scripts/run-tests.mjs`

> Quy ước lệnh cho Task 6–8: mọi lệnh chạy từ thư mục gốc repo, với Node 24.x (≥ 24.7) đứng đầu `PATH` (`node -v` in `v24.21.0` trong môi trường cloud) và pnpm 10.17.1. Bước kiểm tra nhánh lỗi phiên bản dùng Node 22 của hệ thống ở `/opt/node22/bin/node` (`v22.22.0`); nếu máy khác, thay đường dẫn đó. Các task này chạy sau Task 1–5: `.gitignore` đã có `test-results/` và `pnpm-lock.yaml` đã được commit (Task 2), root `tsconfig.json` đã include `tests/**/*.ts` (Task 3), `pnpm lint` đã có luật 2 (Task 1). Số mili-giây trong output mẫu là số đo thật trên Node 24.21, mỗi lần chạy sẽ khác; đường dẫn tuyệt đối được rút gọn thành `…`.

**Files:**
- Modify: `scripts/run-tests.mjs` (viết lại toàn bộ)

**Interfaces:**
- Produces: `pnpm test` (script root `"test": "node scripts/run-tests.mjs"`, đã có sẵn, không đổi) chạy mọi `tests/**/*.test.ts` bằng `node --experimental-strip-types --test --test-timeout=60000`; reporter `spec` ra stdout, reporter `junit` ra `test-results/node-tests.xml`.
- Produces (Task 10 `scripts/verify-v1.mjs` đọc): mỗi test là một dòng `<testcase name="<tên test>" time="…" classname="test" file="<đường dẫn tuyệt đối>"/>`; cuối file có các comment đếm, mỗi dòng thụt một ký tự tab: `<!-- tests N -->`, `<!-- suites N -->`, `<!-- pass N -->`, `<!-- fail N -->`, `<!-- cancelled N -->`, `<!-- skipped N -->`, `<!-- todo N -->`, `<!-- duration_ms X -->`.
- Exit code: `0` khi mọi test pass; `1` khi Node ngoài khoảng `>=24.7 <25`, khi không có file test (`NO_TESTS_FOUND`), khi quá 300 giây (`TIMEOUT`), hoặc khi có test fail.

- [ ] **Step 1: Ghi lại ba hành vi sai của runner cũ (RED)**

Chạy:

```bash
node -v
/opt/node22/bin/node -v
/opt/node22/bin/node scripts/run-tests.mjs > /dev/null; echo "exit=$?"
rm -rf test-results; node scripts/run-tests.mjs > /dev/null; echo "exit=$?"
test -f test-results/node-tests.xml && echo HAS_JUNIT || echo NO_JUNIT
T=$(mktemp -d); mkdir -p "$T/scripts" "$T/tests"; cp scripts/run-tests.mjs "$T/scripts/"
(cd "$T" && node scripts/run-tests.mjs; echo "exit=$?"); rm -rf "$T"
```

Kỳ vọng (RED):

```text
v24.21.0
v22.22.0
exit=0
exit=0
NO_JUNIT
ℹ tests 0
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14.231054
exit=0
```

- Node 22 chạy được và exit 0: chưa có kiểm tra phiên bản.
- Không có `test-results/node-tests.xml`: chưa có báo cáo JUnit.
- Bản copy runner trong thư mục tạm có `tests/` rỗng vẫn exit 0: chưa có `NO_TESTS_FOUND`.

- [ ] **Step 2: Viết lại `scripts/run-tests.mjs`**

Nội dung đầy đủ:

```js
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';

const TEST_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 300_000;

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 7) {
  console.error(`run-tests: cần Node >=24.7 <25, đang dùng ${process.version}`);
  process.exit(1);
}

const root = join(import.meta.dirname, '..');
const resultsDir = join(root, 'test-results');
const junitFile = join(resultsDir, 'node-tests.xml');
rmSync(resultsDir, {recursive: true, force: true});
mkdirSync(resultsDir, {recursive: true});

const testsDir = join(root, 'tests');
const files = existsSync(testsDir)
  ? readdirSync(testsDir, {recursive: true})
      .map(String)
      .filter((name) => name.endsWith('.test.ts'))
      .map((name) => join('tests', name))
      .sort()
  : [];
if (files.length === 0) {
  console.error('run-tests: NO_TESTS_FOUND — không có file tests/**/*.test.ts');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--test',
    `--test-timeout=${TEST_TIMEOUT_MS}`,
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=junit',
    `--test-reporter-destination=${junitFile}`,
    ...files,
  ],
  {cwd: root, stdio: 'inherit', timeout: RUN_TIMEOUT_MS, killSignal: 'SIGKILL'},
);

if (result.error?.code === 'ETIMEDOUT') {
  console.error(`run-tests: TIMEOUT — node --test chạy quá ${RUN_TIMEOUT_MS} ms và đã bị SIGKILL (kiểm tra server, timer hoặc socket chưa đóng; tiến trình con của file test bị treo có thể vẫn chạy với PPID 1, cần tự kill)`);
  process.exit(1);
}
if (result.error) {
  console.error(`run-tests: không chạy được node --test: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`run-tests: node --test bị dừng bởi ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
```

Ghi chú:
- Kiểm tra phiên bản chạy trước mọi thao tác khác, kể cả xóa `test-results/`.
- `root` lấy từ `import.meta.dirname`, nên chạy từ thư mục nào cũng được; danh sách test là đường dẫn tương đối `tests/...` và `spawnSync` chạy với `cwd: root`.
- Không dùng `--test-force-exit`.
- `--test-timeout=60000` chỉ áp cho từng test. Một file có handle bị rò vẫn treo sau khi test của nó pass (đã đo trên Node 24.21: với `--test-timeout=3000`, file chứa `setInterval` rò vẫn treo tới khi bị kill từ ngoài). Vì vậy `timeout: 300000` của `spawnSync` là chốt chặn cuối.
- `SIGKILL` chỉ tới tiến trình `node --test`; tiến trình con chạy file test bị treo không bị kill theo và còn sống với PPID 1 (đã đo ở Step 4). Trên CI, runner GitHub dọn mọi tiến trình khi job kết thúc; khi chạy máy, thông báo `TIMEOUT` nhắc tự kill.

- [ ] **Step 3: Chạy các kiểm tra nhanh (GREEN)**

Chạy:

```bash
/opt/node22/bin/node scripts/run-tests.mjs; echo "exit=$?"
mkdir -p test-results && echo stale > test-results/stale.txt
ROOT=$(pwd); (cd / && node "$ROOT/scripts/run-tests.mjs" > /dev/null; echo "exit=$?")
ls test-results
grep -E '<!-- (tests|pass|fail|cancelled|skipped|todo) ' test-results/node-tests.xml
T=$(mktemp -d); mkdir -p "$T/scripts" "$T/tests"; cp scripts/run-tests.mjs "$T/scripts/"
(cd "$T" && node scripts/run-tests.mjs; echo "exit=$?"); rm -rf "$T"
git status --short
```

Kỳ vọng:

```text
run-tests: cần Node >=24.7 <25, đang dùng v22.22.0
exit=1
exit=0
node-tests.xml
	<!-- tests 40 -->
	<!-- pass 40 -->
	<!-- fail 0 -->
	<!-- cancelled 0 -->
	<!-- skipped 0 -->
	<!-- todo 0 -->
run-tests: NO_TESTS_FOUND — không có file tests/**/*.test.ts
exit=1
 M scripts/run-tests.mjs
```

- `stale.txt` biến mất: `test-results/` được xóa rồi tạo lại.
- Chạy từ `/` vẫn tìm đủ 40 test (38 `tests/web` + 2 `tests/smoke`) và ghi báo cáo vào `test-results/` ở gốc repo.
- Bản copy trong thư mục tạm với `tests/` rỗng báo `NO_TESTS_FOUND`, đồng thời chứng minh runner tìm test theo vị trí của script chứ không theo cwd.
- `git status` không liệt kê `test-results/` vì Task 2 đã thêm mẫu này vào `.gitignore`.

- [ ] **Step 4: Chứng minh `TIMEOUT` bằng timeout thật (khoảng 5 phút)**

Spec không có biến môi trường để hạ timeout, nên dùng đúng 300 giây, trên bản copy trong thư mục tạm (không đụng `tests/` của repo). Chạy:

```bash
T=$(mktemp -d); mkdir -p "$T/scripts" "$T/tests"; cp scripts/run-tests.mjs "$T/scripts/"
printf '%s\n' "import test from 'node:test';" "test('leaked interval', () => { setInterval(() => {}, 1000); });" > "$T/tests/leak.test.ts"
start=$(date +%s); (cd "$T" && node scripts/run-tests.mjs; echo "exit=$?"); echo "elapsed=$(( $(date +%s) - start ))s"
ps -eo pid,ppid,args | grep -- '--test-timeout=60000 tests/[l]eak\.test\.ts' | cut -c1-60
pkill -KILL -f -- '--test-timeout=60000 tests/leak\.test\.ts'; rm -rf "$T"
ps -eo pid,args | grep -- '--test-timeout=60000 tests/[l]eak\.test\.ts' || echo no-orphans
```

Kỳ vọng:

```text
✔ leaked interval (1.429698ms)
run-tests: TIMEOUT — node --test chạy quá 300000 ms và đã bị SIGKILL (kiểm tra server, timer hoặc socket chưa đóng; tiến trình con của file test bị treo có thể vẫn chạy với PPID 1, cần tự kill)
exit=1
elapsed=300s
 4887     1 <scratch>/...
no-orphans
```

Test pass ngay, nhưng `setInterval` giữ tiến trình file sống; sau 300 giây runner in `TIMEOUT` và exit 1. Dòng `ps` (PID khác nhau mỗi lần) cho thấy tiến trình con mồ côi với PPID 1; `pkill` dọn nó, lệnh cuối in `no-orphans`. Mẫu `--test-timeout=60000 tests/…` chỉ khớp tiến trình node, không khớp shell đang chạy khối lệnh.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-tests.mjs
git commit -m "test: harden node test runner with Node 24.7 gate, JUnit report and timeout" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

### Task 7: Test harness nghiệm thu `tests/acceptance/v1-acceptance-harness.test.ts`

**Files:**
- Create: `tests/acceptance/v1-acceptance-harness.test.ts`

**Interfaces:**
- Consumes: `runV1CriticalJourney()` ở `apps/api/src/testing/v1-acceptance-harness.ts` (không sửa). Kết quả có dạng `{loginOk, variants, jobs, batchStatus, publishedPosts, redirect, analytics}`; `batchStatus` là chuỗi do `BatchStatusService.get()` trả; `analytics` là `AnalyticsService.overview('b')` gồm `posts`, `views`, `clicks`, `ctr`, `platforms[]`.
- Produces: testcase `v1 acceptance harness` trong `test-results/node-tests.xml` (Task 10 bắt buộc có).

- [ ] **Step 1: Xác nhận cổng chưa có testcase harness (RED)**

Chạy:

```bash
pnpm test > /dev/null; echo "exit=$?"
grep -c 'testcase name="v1 acceptance harness"' test-results/node-tests.xml
```

Kỳ vọng:

```text
exit=0
0
```

- [ ] **Step 2: Viết test**

Thư mục `tests/acceptance/` chưa có ở PR #1 (chỉ có `tests/smoke` và `tests/web`), nên tạo nó trước:

```bash
mkdir -p tests/acceptance
```

Tạo `tests/acceptance/v1-acceptance-harness.test.ts` với nội dung đầy đủ:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {runV1CriticalJourney} from '../../apps/api/src/testing/v1-acceptance-harness.ts';

test('v1 acceptance harness', async () => {
  const result = await runV1CriticalJourney();

  assert.equal(result.loginOk, true);
  assert.equal(result.variants, 4);
  assert.equal(result.jobs, 4);
  assert.equal(result.publishedPosts, 4);
  assert.equal(result.batchStatus, 'PUBLISHED');
  assert.equal(result.redirect, 'https://shop.test/dog-brush');
  assert.equal(result.analytics.posts, 4);
  assert.equal(result.analytics.views, 400);
  assert.equal(result.analytics.clicks, 1);
  assert.equal(result.analytics.platforms.length, 4);
});
```

Một test duy nhất, tên đúng `'v1 acceptance harness'`, không subtest, đủ 10 assert theo bảng ở spec mục 4.8.

- [ ] **Step 3: Chứng minh test bắt được lỗi thật (RED)**

Tạm phá `FakePublisher` theo hai cách, mỗi lần khôi phục bằng git. Chạy:

```bash
sed -i 's/if(this.fail)throw this.fail;/throw new Error("RED_CHECK_PUBLISH_FAILED");/' apps/worker/src/testing/fake-publisher.ts
node --experimental-strip-types --test tests/acceptance/v1-acceptance-harness.test.ts; echo "exit=$?"
git checkout -- apps/worker/src/testing/fake-publisher.ts
```

Kỳ vọng (publish ném lỗi, giống red-check 5; harness lấy bài đăng đầu tiên trong khi không có bài nào):

```text
✖ v1 acceptance harness (18.905834ms)
…
✖ failing tests:

test at tests/acceptance/v1-acceptance-harness.test.ts:5:1
✖ v1 acceptance harness (18.905834ms)
  TypeError: Cannot read properties of undefined (reading 'id')
      at runV1CriticalJourney (file:///…/apps/api/src/testing/v1-acceptance-harness.ts:28:276)
      at async TestContext.<anonymous> (file:///…/tests/acceptance/v1-acceptance-harness.test.ts:6:18)
…
exit=1
```

Chạy tiếp:

```bash
sed -i 's/views:100,/views:99,/' apps/worker/src/testing/fake-publisher.ts
node --experimental-strip-types --test tests/acceptance/v1-acceptance-harness.test.ts; echo "exit=$?"
git checkout -- apps/worker/src/testing/fake-publisher.ts
git status --short apps/worker
```

Kỳ vọng (assert `analytics.views` bắt được số liệu lệch; `git status` không in gì):

```text
✖ v1 acceptance harness (14.573995ms)
…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  396 !== 400

      at TestContext.<anonymous> (file:///…/tests/acceptance/v1-acceptance-harness.test.ts:15:10)
…
exit=1
```

- [ ] **Step 4: Chạy test, cổng và typecheck (GREEN)**

Chạy:

```bash
node --experimental-strip-types --test tests/acceptance/v1-acceptance-harness.test.ts; echo "exit=$?"
pnpm test > /dev/null; echo "exit=$?"
grep -E '<!-- (tests|pass|fail|cancelled|skipped|todo) ' test-results/node-tests.xml
grep -c 'testcase name="v1 acceptance harness"' test-results/node-tests.xml
pnpm exec tsc -p tsconfig.json; echo "tsc-exit=$?"
pnpm lint > /dev/null; echo "lint-exit=$?"
```

Kỳ vọng:

```text
✔ v1 acceptance harness (12.988553ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 170.325527
exit=0
exit=0
	<!-- tests 41 -->
	<!-- pass 41 -->
	<!-- fail 0 -->
	<!-- cancelled 0 -->
	<!-- skipped 0 -->
	<!-- todo 0 -->
1
tsc-exit=0
lint-exit=0
```

`tsc -p tsconfig.json` (cấu hình root của Task 3) kiểm cả file test mới; `pnpm lint` (Task 1) không tìm thấy dấu đánh dấu test bị cấm.

- [ ] **Step 5: Commit**

```bash
git add tests/acceptance/v1-acceptance-harness.test.ts
git commit -m "test: run v1 acceptance harness as a regression test" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

### Task 8: HTTP smoke `tests/integration/http-api-smoke.test.ts`

**Files:**
- Create: `tests/integration/http-api-smoke.test.ts`

**Interfaces:**
- Consumes (không sửa code production):
  - `createDevelopmentRuntime({env})` từ `apps/api/src/runtime/dev-runtime.ts` → `{store, runtime, registry, services, ids}`. Seed owner `local-owner` (email `env.DEV_OWNER_EMAIL`, mật khẩu `env.DEV_OWNER_PASSWORD` băm bằng argon2id thật, cần Node ≥ 24.7), brand `local-brand`, 4 tài khoản `HYBRID` (FACEBOOK, INSTAGRAM, THREADS, TIKTOK) ở trạng thái `DISCONNECTED`; `CREDENTIAL_ENCRYPTION_KEY` bắt buộc 32 byte base64.
  - `app.registry.register(platform, 'API', new FakePublisher())`: `PublisherRegistry` là `Map` theo khóa `platform:strategy`, nên ghi đè publisher thật. `FakePublisher` (`apps/worker/src/testing/fake-publisher.ts`) không tham số; `fetchMetrics` trả `views: 100`.
  - `new LocalWorkerRuntime(app.store, app.registry, app.services.media)` và `metricsCaptureKey()` từ `apps/worker/src/runtime/local-worker.ts`; `tick()` và `syncMetrics(captureKey)` trả số bản ghi đã xử lý.
  - `startApiServer(port, runtime)` từ `apps/api/src/main.ts`: gọi `listen(port, '127.0.0.1')` (bất đồng bộ) và trả `http.Server`. Import `main.ts` không tự boot server (chỉ boot khi `process.argv[1]` kết thúc bằng `/main.ts`).
  - Cookie khi login/refresh: `refresh_token=…; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=2592000` và `csrf_token=…; SameSite=Lax; Path=/; Max-Age=2592000` (thêm `; Secure` khi `COOKIE_SECURE=true`). `POST /auth/refresh` đọc `refresh_token`, `csrf_token` từ header `cookie`, so `csrf_token` (đã decode) với header `x-csrf-token`; lệch hoặc thiếu thì 403 `{error:'CSRF_MISMATCH'}`. Body login/refresh có `accessToken`, `csrfToken`, không có `refreshToken`.
  - Status thật của các route trong test: `POST …/variants/copy` → 200 (mảng 4 biến thể), `POST …/accounts/:id/credentials` → 200 `{id, status}`, `POST …/publish/validate` → 200 (mảng kết quả), `POST …/publish` → 201 `{batchId, results[]}`, `GET /r/:code` → 302 kèm header `location`.
- Produces: testcase `http api smoke journey` trong `test-results/node-tests.xml` (Task 10 bắt buộc có); tổng `pnpm test` là 42.

- [ ] **Step 1: Xác nhận cổng chưa có testcase HTTP smoke (RED)**

Chạy:

```bash
pnpm test > /dev/null; echo "exit=$?"
grep -c 'testcase name="http api smoke journey"' test-results/node-tests.xml
```

Kỳ vọng:

```text
exit=0
0
```

- [ ] **Step 2: Viết test**

Thư mục `tests/integration/` chưa có ở PR #1, nên tạo nó trước:

```bash
mkdir -p tests/integration
```

Tạo `tests/integration/http-api-smoke.test.ts` với nội dung đầy đủ:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';
import {LocalWorkerRuntime, metricsCaptureKey} from '../../apps/worker/src/runtime/local-worker.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

const BRAND = 'local-brand';
const OWNER_EMAIL = 'smoke-owner@dsm.test';
const OWNER_PASSWORD = 'smoke-owner-password';
const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK'] as const;
const LANDING_URL = 'https://shop.test/dog-brush';

interface CallOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
interface CallResult {
  status: number;
  headers: Headers;
  body: any;
}

function cookiePair(setCookie: string) {
  return setCookie.split(';')[0] ?? '';
}

test('http api smoke journey', async (t) => {
  const originalFetch = globalThis.fetch;
  const externalHosts: string[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== '127.0.0.1') {
      externalHosts.push(url.host);
      throw new Error(`SMOKE_EXTERNAL_FETCH_BLOCKED:${url.host}`);
    }
    return originalFetch(input, init);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const env = {
    DEV_OWNER_EMAIL: OWNER_EMAIL,
    DEV_OWNER_PASSWORD: OWNER_PASSWORD,
    CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    JWT_ACCESS_SECRET: `smoke-jwt-${randomBytes(16).toString('hex')}`,
  };
  const app = await createDevelopmentRuntime({env});
  for (const platform of PLATFORMS) app.registry.register(platform, 'API', new FakePublisher());
  const worker = new LocalWorkerRuntime(app.store, app.registry, app.services.media);

  const server = startApiServer(0, app.runtime);
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, path: string, options: CallOptions = {}): Promise<CallResult> {
    const headers: Record<string, string> = {...options.headers};
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    const init: RequestInit = {method, headers, redirect: 'manual'};
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${base}${path}`, init);
    const text = await response.text();
    return {status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null};
  }

  // 1. Health
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);

  // 2. Brand route without a token
  const anonymous = await call('GET', `/brands/${BRAND}/products`);
  assert.equal(anonymous.status, 401);

  // 3. Wrong password
  const wrongPassword = await call('POST', '/auth/login', {body: {email: OWNER_EMAIL, password: 'wrong-password'}});
  assert.equal(wrongPassword.status, 401);

  // 4. Login: access token in body, refresh token only in an HttpOnly cookie
  const login = await call('POST', '/auth/login', {body: {email: OWNER_EMAIL, password: OWNER_PASSWORD}});
  assert.equal(login.status, 200);
  assert.equal(typeof login.body.accessToken, 'string');
  assert.equal('refreshToken' in login.body, false);
  const setCookies = login.headers.getSetCookie();
  const refreshCookie = setCookies.find((cookie) => cookie.startsWith('refresh_token='));
  const csrfCookie = setCookies.find((cookie) => cookie.startsWith('csrf_token='));
  assert.ok(refreshCookie, 'refresh_token cookie is set');
  assert.match(refreshCookie, /;\s*HttpOnly(;|$)/);
  assert.match(refreshCookie, /;\s*SameSite=Lax(;|$)/);
  assert.match(refreshCookie, /;\s*Path=\/auth(;|$)/);
  assert.ok(csrfCookie, 'csrf_token cookie is set');

  // 5. Refresh needs both cookies and a matching x-csrf-token header
  const cookieHeader = `${cookiePair(refreshCookie)}; ${cookiePair(csrfCookie)}`;
  const csrfToken = decodeURIComponent(cookiePair(csrfCookie).slice('csrf_token='.length));
  const refreshWithoutHeader = await call('POST', '/auth/refresh', {headers: {cookie: cookieHeader}});
  assert.equal(refreshWithoutHeader.status, 403);
  assert.equal(refreshWithoutHeader.body.error, 'CSRF_MISMATCH');
  const refreshed = await call('POST', '/auth/refresh', {headers: {cookie: cookieHeader, 'x-csrf-token': csrfToken}});
  assert.equal(refreshed.status, 200);
  assert.equal(typeof refreshed.body.accessToken, 'string');
  assert.equal('refreshToken' in refreshed.body, false);
  const token: string = refreshed.body.accessToken;

  // 6. Product
  const product = await call('POST', `/brands/${BRAND}/products`, {
    token,
    body: {name: 'Dog Brush', slug: 'dog-brush', currency: 'USD', landingUrl: LANDING_URL, cost: '8', sellingPrice: '29'},
  });
  assert.equal(product.status, 201);

  // 7. Media upload (VIDEO)
  const upload = await call('POST', `/brands/${BRAND}/media/uploads`, {token, body: {type: 'VIDEO', mimeType: 'video/mp4'}});
  assert.equal(upload.status, 201);
  assert.equal(typeof upload.body.assetId, 'string');

  // 8. VIDEO content with masterAssetId
  const content = await call('POST', `/brands/${BRAND}/content`, {
    token,
    body: {type: 'VIDEO', title: 'Dog brush demo', productId: product.body.id, body: 'Demo', masterAssetId: upload.body.assetId},
  });
  assert.equal(content.status, 201);
  const contentId: string = content.body.id;

  // 9. Copy master to the four platform variants
  const variants = await call('POST', `/brands/${BRAND}/content/${contentId}/variants/copy`, {token});
  assert.equal(variants.status, 200);
  assert.equal(variants.body.length, 4);

  // 10. Four seeded social accounts
  const accounts = await call('GET', `/brands/${BRAND}/accounts`, {token});
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.length, 4);
  const accountIds: string[] = accounts.body.map((account: {id: string}) => account.id);

  // 11. Validation fails closed while variants are DRAFT
  const blocked = await call('POST', `/brands/${BRAND}/publish/validate`, {token, body: {contentId, socialAccountIds: accountIds}});
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.length, 4);
  for (const target of blocked.body) {
    assert.equal(target.valid, false);
    assert.ok(target.errors.includes('VARIANT_NOT_READY'));
  }

  // 12. Mark the four variants READY
  for (const variant of variants.body) {
    const ready = await call('PATCH', `/brands/${BRAND}/content/${contentId}/variants/${variant.id}`, {token, body: {status: 'READY'}});
    assert.equal(ready.status, 200);
    assert.equal(ready.body.status, 'READY');
  }

  // 13. Store API credentials for the four accounts
  for (const accountId of accountIds) {
    const credential = await call('POST', `/brands/${BRAND}/accounts/${accountId}/credentials`, {
      token,
      body: {accessToken: `smoke-token-${accountId}`},
    });
    assert.equal(credential.status, 200);
    assert.equal(credential.body.status, 'CONNECTED');
  }

  // 14. Validation passes for every target with the API strategy
  const validated = await call('POST', `/brands/${BRAND}/publish/validate`, {token, body: {contentId, socialAccountIds: accountIds}});
  assert.equal(validated.status, 200);
  assert.equal(validated.body.length, 4);
  for (const target of validated.body) {
    assert.equal(target.valid, true);
    assert.equal(target.strategy, 'API');
  }

  // 15. Publish batch
  const publish = await call('POST', `/brands/${BRAND}/publish`, {token, body: {contentId, socialAccountIds: accountIds}});
  assert.equal(publish.status, 201);
  const jobIds = publish.body.results.map((result: {jobId?: string}) => result.jobId).filter((jobId: unknown) => typeof jobId === 'string');
  assert.equal(jobIds.length, 4);

  // 16. Worker processes the four jobs
  assert.equal(await worker.tick(), 4);

  // 17. Batch status
  const batch = await call('GET', `/publish/batches/${publish.body.batchId}`, {token});
  assert.equal(batch.status, 200);
  assert.equal(batch.body.status, 'PUBLISHED');

  // 18. Calendar shows four PUBLISHED jobs
  const calendar = await call('GET', `/brands/${BRAND}/calendar`, {token});
  assert.equal(calendar.status, 200);
  assert.equal(calendar.body.length, 4);
  for (const job of calendar.body) assert.equal(job.status, 'PUBLISHED');

  // 19. Tracked link redirect
  const link = await call('POST', `/brands/${BRAND}/tracked-links`, {
    token,
    body: {targetUrl: LANDING_URL, productId: product.body.id, contentItemId: contentId},
  });
  assert.equal(link.status, 201);
  const redirect = await call('GET', `/r/${link.body.code}`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), LANDING_URL);

  // 20. Metrics sync for the four published posts
  assert.equal(await worker.syncMetrics(metricsCaptureKey()), 4);

  // 21. Analytics overview
  const overview = await call('GET', `/brands/${BRAND}/analytics/overview`, {token});
  assert.equal(overview.status, 200);
  assert.equal(overview.body.posts, 4);
  assert.equal(overview.body.views, 400);

  assert.deepEqual(externalHosts, []);
});
```

Ghi chú:
- Một test duy nhất, tên đúng `'http api smoke journey'`, không subtest; 21 bước theo bảng spec mục 4.9, đánh số trong comment.
- `env` là object truyền vào `createDevelopmentRuntime`, không ghi `process.env`.
- Bước 5: gửi request thiếu `x-csrf-token` **trước** request hợp lệ, vì refresh hợp lệ sẽ thu hồi refresh token cũ.
- Guard `fetch` ghi lại mọi host khác `127.0.0.1` và từ chối luôn request đó (không chuyển tiếp), nên dù có hồi quy nối lại publisher thật thì cũng không request nào rời máy; cuối test assert danh sách rỗng. `fetch` gốc được khôi phục trong `t.after`, kể cả khi test fail.
- Server đóng trong `t.after` (`close` + `closeAllConnections`), nên tiến trình tự thoát mà không cần `--test-force-exit`.
- Không assert các hành vi đã biết là sai (spec mục 4.9 "Cố ý không assert"): 404 cho variant/media không tồn tại, 201 khi mọi đích không hợp lệ, `clicks > 0` qua HTTP, UTM khi redirect.

- [ ] **Step 3: Chứng minh test fail khi thiếu FakePublisher (RED)**

Chạy bản copy đã xóa dòng đăng ký `FakePublisher` (file thật không đổi):

```bash
sed "/new FakePublisher());/d" tests/integration/http-api-smoke.test.ts > tests/integration/red-no-fake.test.ts
grep -c "new FakePublisher" tests/integration/red-no-fake.test.ts
node --experimental-strip-types --test tests/integration/red-no-fake.test.ts; echo "exit=$?"
rm tests/integration/red-no-fake.test.ts
```

Kỳ vọng:

```text
0
✖ http api smoke journey (751.617101ms)
…
✖ failing tests:

test at tests/integration/red-no-fake.test.ts:32:1
✖ http api smoke journey (751.617101ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  500 !== 200

      at TestContext.<anonymous> (file:///…/tests/integration/red-no-fake.test.ts:177:10)
…
exit=1
```

Dòng 177 của bản copy là `assert.equal(validated.status, 200);` (bước 14). `TikTokPublisher` thật gọi `open.tiktokapis.com` khi validate; guard ghi host đó và ném lỗi nên API trả 500 `INTERNAL_ERROR` (đã kiểm: `externalHosts` lúc đó là `["open.tiktokapis.com"]`, không request nào rời máy).

- [ ] **Step 4: Chạy test, cổng đầy đủ và typecheck (GREEN)**

Chạy:

```bash
node --experimental-strip-types --test tests/integration/http-api-smoke.test.ts; echo "exit=$?"
pnpm test 2>&1 | tail -9; echo "exit=${PIPESTATUS[0]}"
grep -E '<!-- (tests|pass|fail|cancelled|skipped|todo) ' test-results/node-tests.xml
grep -o -E 'testcase name="(v1 acceptance harness|http api smoke journey)"' test-results/node-tests.xml
pnpm exec tsc -p tsconfig.json; echo "tsc-exit=$?"
pnpm lint > /dev/null; echo "lint-exit=$?"
git status --short
```

Kỳ vọng (`pnpm test` xong trong khoảng 2 giây, tiến trình tự thoát):

```text
✔ http api smoke journey (644.541071ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 847.355573
exit=0
✔ CTR returns no value without a valid denominator (0.254552ms)
ℹ tests 42
ℹ suites 0
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1035.080179
exit=0
	<!-- tests 42 -->
	<!-- pass 42 -->
	<!-- fail 0 -->
	<!-- cancelled 0 -->
	<!-- skipped 0 -->
	<!-- todo 0 -->
testcase name="v1 acceptance harness"
testcase name="http api smoke journey"
tsc-exit=0
lint-exit=0
?? tests/integration/
```

42 = 38 `tests/web` + 2 `tests/smoke` + 1 harness + 1 HTTP smoke, 0 fail, 0 skipped, đúng tổng kỳ vọng ở spec mục 4.9.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/http-api-smoke.test.ts
git commit -m "test: add HTTP API smoke journey against the real API server" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

### Task 9: Playwright UI E2E tự dựng API và `next start` trên bản build production

Spec: mục 4.10 (và script root `test:e2e` ở mục 4.10/4.13). Commit 9 trong thứ tự ở mục 4.1. Chạy sau Task 1–8. Mọi lệnh chạy từ gốc repo bằng bash. Số giây trong output mẫu là số đo thật, mỗi lần chạy sẽ khác; đường dẫn tuyệt đối được rút gọn thành `…`.

Điều kiện môi trường (kiểm ở Step 1):

- Node 24.x với x ≥ 7 đứng đầu `PATH` (môi trường cloud: `export PATH=$NODE24_HOME/bin:$PATH`, `node -v` in `v24.21.0`). Playwright chạy API bằng chính `process.execPath` của nó, nên Node này cũng là Node của API (hasher argon2 cần ≥ 24.7).
- pnpm 10.17.1. Chromium 1194 (khớp `@playwright/test` 1.56.1 từ Task 2): môi trường cloud đã có sẵn ở `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, **không** chạy `playwright install`; máy khác chạy một lần `pnpm --filter web exec playwright install chromium`.
- **Cổng `127.0.0.1:3000` và `127.0.0.1:4000` phải trống**: tắt `pnpm dev`, mọi `next start`/API cũ và mọi lần chạy E2E khác. Config dùng `reuseExistingServer: false`, nên khi cổng bận Playwright dừng ngay với `Error: http://127.0.0.1:4000/health is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.` (đã đo) thay vì âm thầm test một server khác.
- `export NEXT_TELEMETRY_DISABLED=1` (giống CI) và **không** export `NEXT_PUBLIC_API_BASE_URL` (mục 4.6): bản build phải nhúng URL mặc định `http://127.0.0.1:4000`.
- Trạng thái kế thừa: Task 1 đã xóa dòng `test.skip(...)` khỏi spec E2E; Task 2 đã ghim Playwright và ignore `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `test-results/`, `playwright-report/`; Task 4 đưa mọi `apps/web/**/*.ts` (kể cả `playwright.config.ts` và `apps/web/tests/*.ts`) vào chương trình web, nên ba file của task này bị kiểm bởi `pnpm typecheck` **và** bởi bước TypeScript của `next build`; Task 6 làm `pnpm test` xóa rồi tạo lại `test-results/`.

**Files:**
- Create: `apps/web/tests/e2e-owner.ts`
- Modify (viết lại toàn bộ): `apps/web/tests/v1-critical-journey.spec.ts`
- Modify (viết lại toàn bộ): `apps/web/playwright.config.ts`
- Modify: `package.json` (thêm đúng một script `test:e2e`)

**Interfaces:**
- Produces: `pnpm test:e2e` (root) = `pnpm --filter web test:e2e` = `playwright test` trong `apps/web`.
  - Thiếu `apps/web/.next/BUILD_ID`: ném `E2E cần bản build: chạy "pnpm build" trước`, exit 1.
  - Có build: tự dựng API (`127.0.0.1:4000`, in-memory, owner E2E) và `next start` (`127.0.0.1:3000`), chạy đúng 1 test `v1 critical UI journey`, tắt cả hai server khi xong. Exit 0 chỉ khi test pass (retries 0, flaky cũng là fail).
- Produces cho Task 10 (`scripts/verify-v1.mjs` đọc): `test-results/e2e.json` ở **gốc repo** (reporter JSON của Playwright 1.56.1, `outputFile` tính từ thư mục chứa config).
  - Khóa gốc: `config`, `suites`, `errors`, `stats`. `stats` có `expected`, `unexpected`, `flaky`, `skipped` (cùng `startTime`, `duration`).
  - Độ lồng: `suites[0]` là suite cấp file (`title` = `file` = `v1-critical-journey.spec.ts`), spec nằm ngay ở `suites[0].specs[0]`. Vì spec không dùng `test.describe`, suite cấp file **không có khóa `suites`** (không phải mảng rỗng). `verify-v1` vẫn phải duyệt đệ quy `suites[].suites[]` (mục 4.11) và coi khóa thiếu là mảng rỗng.
  - Spec: `title: 'v1 critical UI journey'`, `ok`, `tests[]`. Mỗi phần tử `tests[]` có `expectedStatus`, `status`, `results[]`; mỗi `results[]` có `status`, `retry`.
  - Khi Playwright dừng trước khi chạy test (ví dụ `forbidOnly` bắt `test.only` lúc `CI=true`), file vẫn được ghi với `stats.expected = 0` và `errors.length = 1` (đã đo). Khi guard BUILD_ID ném lỗi thì không có file nào được ghi; `pnpm test` (Task 6) đã xóa `test-results/` trước đó nên không còn báo cáo cũ.
- Produces cho Task 11 (`ci.yml`): khi test fail, trace ở `apps/web/test-results/<tên test>/trace.zip` (thư mục `outputDir` mặc định, được upload qua đường dẫn `apps/web/test-results/`).
- Consumes: `apps/api/src/entry.ts` → `boot()` trong `apps/api/src/main.ts` (không sửa code production nào); biến môi trường `DEV_IN_MEMORY`, `APP_ENV`, `API_PORT`, `DEV_STORE_FILE`, `S3_ENDPOINT`, `BROWSER_NODE_KEY`, `BROWSER_GATEWAY_HOST`, `DEV_OWNER_EMAIL`, `DEV_OWNER_PASSWORD`, `JWT_ACCESS_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `WEB_ORIGINS`, `COOKIE_SECURE`.
- Ràng buộc thứ tự cho `verify` và `ci.yml`: `pnpm test` → `pnpm build` → `pnpm test:e2e` (test xóa `test-results/`; E2E cần build).
- Task này **không** đổi script `verify` (dạng cuối ở mục 4.13 được đặt ở task viết lại `verify-v1`). Đã đo: `node scripts/verify-v1.mjs` bản cũ vẫn exit 0 ở commit này.

- [ ] **Step 1: Kiểm tra môi trường, xác nhận RED ở cấp root**

```bash
node -v
test -z "${NEXT_PUBLIC_API_BASE_URL:-}" && echo NO_API_OVERRIDE
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
pnpm --filter web exec playwright --version
pnpm test:e2e; echo "EXIT=$?"
```

Expected:

```
v24.21.0
NO_API_OVERRIDE
PORT 3000 FREE
PORT 4000 FREE
Version 1.56.1
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "test:e2e" not found

Did you mean "pnpm test"?
EXIT=254
```

Root chưa có script `test:e2e` (dòng `undefined` do pnpm 10.17.1 tự in). Nếu có dòng `PORT … BUSY`: dừng process đang giữ cổng đó rồi chạy lại vòng `for` cho tới khi cả hai `FREE`. Không tiếp tục khi cổng còn bận.

- [ ] **Step 2: Viết tài khoản E2E và spec mới**

Tạo `apps/web/tests/e2e-owner.ts` với nội dung đầy đủ:

```ts
// Tài khoản owner chỉ dùng cho Playwright E2E. playwright.config.ts truyền nó cho API
// (DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD) và spec dùng nó để đăng nhập.
export const E2E_OWNER = {
  email: 'e2e-owner@dsm.test',
  password: 'dsm-e2e-owner-password',
} as const;
```

File này không khớp mẫu tên test của Playwright (`*.spec.ts`/`*.test.ts`), nên không bị coi là test.

Viết lại toàn bộ `apps/web/tests/v1-critical-journey.spec.ts`, nội dung đầy đủ:

```ts
import {expect, test, type Page, type Response} from '@playwright/test';
import {E2E_OWNER} from './e2e-owner.ts';

const BRAND_API = '/brands/local-brand';
const BRAND_PAGE = '/app/brands/local-brand';

function isOk(apiPath: string) {
  return (response: Response) => new URL(response.url()).pathname === apiPath && response.status() === 200;
}

// Chờ một trang tải xong thật: response 200 từ endpoint chính, đúng tiêu đề, hết loading, không ô lỗi.
// Promise chờ response phải tạo TRƯỚC action, vì trang có thể gọi API ngay khi action còn chưa trả về.
// Mẫu 401 -> /auth/refresh -> 200 là bình thường, nên chỉ chờ lần trả 200.
async function expectLoaded(page: Page, {heading, apiPath}: {heading: string; apiPath: string}, action: () => Promise<unknown>) {
  const loaded = page.waitForResponse(isOk(apiPath));
  await action();
  await loaded;
  await expect(page.getByRole('heading', {name: heading, exact: true})).toBeVisible();
  await expect(page.locator('.page-state[role="status"]')).toHaveCount(0);
  await expect(page.locator('.page-state--error')).toHaveCount(0);
}

test('v1 critical UI journey', async ({page, context}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const nav = page.locator('nav.app-nav');

  // 1. Đăng nhập -> Tổng quan
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
  await expectLoaded(page, {heading: 'Tổng quan', apiPath: `${BRAND_API}/analytics/overview`}, async () => {
    const login = page.waitForResponse(isOk('/auth/login'));
    await page.getByRole('button', {name: 'Đăng nhập'}).click();
    await login;
  });
  await expect(page).toHaveURL(new RegExp(`${BRAND_PAGE}/overview$`));

  // 2. Tải lại trang: phiên được khôi phục qua cookie refresh + CSRF
  await expectLoaded(page, {heading: 'Tổng quan', apiPath: `${BRAND_API}/analytics/overview`}, () => page.reload());
  await expect(page).toHaveURL(new RegExp(`${BRAND_PAGE}/overview$`));

  // 3-6. Điều hướng bằng menu chính
  const journey = [
    {link: 'Sản phẩm', section: 'products', apiPath: `${BRAND_API}/products`},
    {link: 'Nội dung', section: 'content', apiPath: `${BRAND_API}/content`},
    {link: 'Lịch đăng', section: 'calendar', apiPath: `${BRAND_API}/calendar`},
    {link: 'Phân tích', section: 'analytics', apiPath: `${BRAND_API}/analytics/platforms`},
  ];
  for (const step of journey) {
    await expectLoaded(page, {heading: step.link, apiPath: step.apiPath}, () =>
      nav.getByRole('link', {name: step.link, exact: true}).click(),
    );
    await expect(page).toHaveURL(new RegExp(`${BRAND_PAGE}/${step.section}$`));
  }

  // 7. Đăng xuất: API trả 204, về /login, cookie bị xóa
  const logout = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/auth/logout' && response.request().method() === 'POST',
  );
  await page.getByRole('button', {name: 'Đăng xuất khỏi DSM'}).click();
  expect((await logout).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
  expect(await context.cookies()).toEqual([]);

  expect(pageErrors).toEqual([]);
});
```

Đối chiếu với mục 4.10:

| Bước | `action` | Endpoint chờ | Tiêu đề (`exact`) |
|---|---|---|---|
| 1 | điền form, click "Đăng nhập" (trong `action` chờ thêm `/auth/login` 200) | `/brands/local-brand/analytics/overview` 200 | `Tổng quan` |
| 2 | `page.reload()` | `/brands/local-brand/analytics/overview` 200 | `Tổng quan` |
| 3 | link "Sản phẩm" trong `nav.app-nav` | `/brands/local-brand/products` 200 | `Sản phẩm` |
| 4 | link "Nội dung" | `/brands/local-brand/content` 200 | `Nội dung` |
| 5 | link "Lịch đăng" | `/brands/local-brand/calendar` 200 | `Lịch đăng` |
| 6 | link "Phân tích" | `/brands/local-brand/analytics/platforms` 200 | `Phân tích` |
| 7 | click "Đăng xuất khỏi DSM" (không dùng `expectLoaded`) | `POST /auth/logout`, assert 204 | rồi URL `/login`, rồi `context.cookies()` rỗng |

- Bước 7 chờ response `POST /auth/logout` rồi assert status `204`: test fail ngay với thông báo rõ (ví dụ `Expected: 204, Received: 403`) thay vì đợi hết 30 giây. Lọc theo method là phòng hờ: preflight `OPTIONS /auth/logout` cũng trả 204 (`apps/api/src/main.ts:43`). Đã đo: Playwright 1.56.1 với Chromium 1194 không phát sự kiện response cho preflight, nhưng bộ lọc giữ test đúng nếu điều đó thay đổi. Preflight trả 204 nên cũng không bao giờ khớp điều kiện `=== 200` của `expectLoaded`.
- Không dùng `getByRole('alert')`, vì route announcer của Next luôn có một phần tử như vậy. Link menu luôn tìm trong `nav.app-nav`, tránh trùng nút "Mở lịch đăng" ở trang Tổng quan.
- Không có `test.skip`/`test.only`/`test.fail`/`skip:`/`todo:`: luật 2 của `pnpm lint` (Task 1) áp cho `apps/web/tests/`.

- [ ] **Step 3: Chạy spec mới với config cũ, xác nhận RED**

```bash
cat apps/web/playwright.config.ts
pnpm --filter web test:e2e; echo "EXIT=$?"
```

Expected:

```
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:3000'},retries:process.env.CI?1:0});

> web@ test:e2e /…/DSM/apps/web
> playwright test


Running 1 test using 1 worker

  ✘  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (1.2s)


  1) tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey ───────────────────────────────

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3000/login
    Call log:
      - navigating to "http://127.0.0.1:3000/login", waiting until "load"


      27 |
      28 |   // 1. Đăng nhập -> Tổng quan
    > 29 |   await page.goto('/login');
         |              ^
      30 |   await page.getByLabel('Email').fill(E2E_OWNER.email);
      31 |   await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
      32 |   await expectLoaded(page, {heading: 'Tổng quan', apiPath: `${BRAND_API}/analytics/overview`}, async () => {
        at /…/DSM/apps/web/tests/v1-critical-journey.spec.ts:29:14

  1 failed
    tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey ────────────────────────────────
/…/DSM/apps/web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@ test:e2e: `playwright test`
Exit status 1
EXIT=1
```

Config cũ không dựng server nào và không có reporter JSON: test fail thật ngay ở bước đầu (không còn tự skip như trước Task 1).

Playwright 1.56.1 in vị trí test là `tests/v1-critical-journey.spec.ts:26:1` dù `test(` nằm ở dòng 23 của file (`grep -n "^test(" apps/web/tests/v1-critical-journey.spec.ts` in `23:`): vị trí khai báo test lệch 3 dòng qua bộ biến đổi TypeScript của Playwright, còn số dòng trong code frame và stack (`29:14`, `18:73`, `40:3`) là dòng thật của file. Đã kiểm lại khi lắp plan bằng `playwright test --list` với đúng config của `apps/web` (lệnh này không dựng webServer): `v1-critical-journey.spec.ts:26:1 › v1 critical UI journey`. Mọi dòng `:26:1` trong Expected của task này là con số đo thật.

- [ ] **Step 4: Viết lại `apps/web/playwright.config.ts`; thêm script root `test:e2e`**

Nội dung đầy đủ của `apps/web/playwright.config.ts`:

```ts
import {existsSync} from 'node:fs';
import {defineConfig} from '@playwright/test';
import {E2E_OWNER} from './tests/e2e-owner.ts';

// Web và API bắt buộc cùng host 127.0.0.1: dùng localhost thì login bị CORS chặn hoặc reload trả 401.
const API_URL = 'http://127.0.0.1:4000';
const WEB_URL = 'http://127.0.0.1:3000';
// Hai server chạy bằng đúng Node đang chạy Playwright (Node >=24.7 vì API cần crypto.argon2Sync).
const NODE = `"${process.execPath}"`;

if (!existsSync(new URL('./.next/BUILD_ID', import.meta.url))) {
  throw new Error('E2E cần bản build: chạy "pnpm build" trước');
}

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 0,
  failOnFlakyTests: true,
  workers: 1,
  reporter: [['list'], ['json', {outputFile: '../../test-results/e2e.json'}]],
  use: {baseURL: WEB_URL, trace: 'retain-on-failure'},
  webServer: [
    {
      name: 'api',
      command: `${NODE} --experimental-strip-types src/entry.ts`,
      cwd: '../api',
      url: `${API_URL}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      // Không nạp .env. Server vẫn kế thừa biến môi trường của shell, nên mọi biến làm đổi hành vi
      // đều được ghi đè tường minh ở đây (chuỗi rỗng = tắt).
      env: {
        DEV_IN_MEMORY: '1',
        APP_ENV: 'test',
        API_PORT: '4000',
        DEV_STORE_FILE: '',
        S3_ENDPOINT: '',
        BROWSER_NODE_KEY: '',
        BROWSER_GATEWAY_HOST: '',
        DEV_OWNER_EMAIL: E2E_OWNER.email,
        DEV_OWNER_PASSWORD: E2E_OWNER.password,
        JWT_ACCESS_SECRET: 'dsm-e2e-only-jwt-access-secret',
        // base64 của 32 byte ASCII 'dsm-e2e-credential-key-32-bytes!'
        CREDENTIAL_ENCRYPTION_KEY: 'ZHNtLWUyZS1jcmVkZW50aWFsLWtleS0zMi1ieXRlcyE=',
        WEB_ORIGINS: WEB_URL,
        COOKIE_SECURE: 'false',
      },
    },
    {
      name: 'web',
      command: `${NODE} node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000`,
      url: `${WEB_URL}/login`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
```

Ghi chú (đã kiểm trong mã nguồn Playwright 1.56.1, `lib/plugins/webServerPlugin.js` và `lib/reporters/base.js`):

- `cwd` và `outputFile` của reporter được resolve từ thư mục chứa config (`apps/web`): API chạy trong `apps/api`, báo cáo JSON nằm ở `test-results/e2e.json` của gốc repo. `webServer[1]` không có `cwd` nên chạy trong `apps/web`, nơi có `node_modules/next`.
- `command` chạy qua shell, nên `process.execPath` được bọc trong dấu nháy kép.
- Môi trường của server = biến mặc định của Playwright + `process.env` của shell + `env` ở trên (ghi đè sau cùng). Chuỗi rỗng là falsy trong `main.ts`/`dev-runtime.ts`: `DEV_STORE_FILE=''` tắt ghi file, `S3_ENDPOINT=''` dùng storage trong bộ nhớ, `BROWSER_NODE_KEY=''`/`BROWSER_GATEWAY_HOST=''` không đăng ký Browser Node.
- `CREDENTIAL_ENCRYPTION_KEY` phải giải mã base64 ra đúng 32 byte (`dev-runtime.ts` kiểm). Kiểm nhanh: `node -p "Buffer.from('ZHNtLWUyZS1jcmVkZW50aWFsLWtleS0zMi1ieXRlcyE=','base64').length"` in `32`.
- `name: 'api'`/`'web'` chỉ là nhãn cho dòng stderr của từng server (`[api] …`, `[web] …`) trong log CI; không đổi hành vi.
- Guard dùng `import.meta.url` (`apps/web/package.json` có `"type": "module"`), nên đúng dù Playwright được gọi từ thư mục nào.

Sửa `package.json` (chỉ thêm một dòng):

```diff
--- a/package.json
+++ b/package.json
@@ -11,6 +11,7 @@
     "test:integration": "node scripts/run-tests.mjs",
     "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json",
     "build": "pnpm --filter web build",
+    "test:e2e": "pnpm --filter web test:e2e",
     "lint": "node scripts/lint.mjs",
     "verify": "npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs",
     "dev": "corepack pnpm --parallel --filter api --filter web dev",
```

`apps/web/package.json` giữ nguyên `"test:e2e": "playwright test"`.

- [ ] **Step 5: Chạy khi chưa có build, xác nhận guard (RED)**

```bash
rm -rf apps/web/.next
pnpm test:e2e; echo "EXIT=$?"
```

Expected:

```
> dropship-social-v1@1.0.0 test:e2e /…/DSM
> pnpm --filter web test:e2e


> web@ test:e2e /…/DSM/apps/web
> playwright test

Error: E2E cần bản build: chạy "pnpm build" trước
    at file:///…/DSM/apps/web/playwright.config.ts:12:9
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at node:internal/modules/esm/loader:647:26
    at requireOrImport (/…/DSM/node_modules/.pnpm/playwright@1.56.1/node_modules/playwright/lib/transform/transform.js:214:12)
    …
/…/DSM/apps/web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@ test:e2e: `playwright test`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
EXIT=1
```

Không server nào được khởi động, không có `test-results/e2e.json` mới.

- [ ] **Step 6: Typecheck và lint ba file mới**

```bash
pnpm --filter web exec tsc -p tsconfig.json; echo "EXIT=$?"
pnpm --filter web exec tsc -p tsconfig.json --listFilesOnly | grep -E "playwright\.config\.ts|/tests/"
pnpm typecheck > /dev/null; echo "EXIT=$?"
pnpm lint
```

Lệnh đầu tương đương `cd apps/web && tsc -p tsconfig.json` (chạy `tsc` của `apps/web` trong thư mục `apps/web`).

Expected:

```
EXIT=0
/…/DSM/apps/web/tests/e2e-owner.ts
/…/DSM/apps/web/playwright.config.ts
/…/DSM/apps/web/tests/v1-critical-journey.spec.ts
EXIT=0
…
lint: ok (183 files: 134 .ts, 44 .tsx, 5 .mjs)
```

Ba file nằm trong chương trình web (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) và không có lỗi. Lint đếm thêm `e2e-owner.ts`. Con số `183 files: 134 .ts` tính cả `apps/web/next-env.d.ts` do build ở Task 4 sinh ra (Step 5 chỉ xóa `apps/web/.next`); trên cây chưa từng build thì là `182 files: 133 .ts, 44 .tsx, 5 .mjs` (cả hai đã đo).

- [ ] **Step 7: Build rồi chạy E2E, xác nhận GREEN**

```bash
pnpm build > build.log 2>&1; echo "EXIT=$?"
grep -E "Running TypeScript|Finished TypeScript" build.log
grep -cE '(○|ƒ) /' build.log
test -s apps/web/.next/BUILD_ID && echo HAS_BUILD_ID
rm build.log
pnpm test:e2e; echo "EXIT=$?"
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
```

Expected:

```
EXIT=0
  Running TypeScript ...
  Finished TypeScript in … ...
14
HAS_BUILD_ID

> dropship-social-v1@1.0.0 test:e2e /…/DSM
> pnpm --filter web test:e2e


> web@ test:e2e /…/DSM/apps/web
> playwright test


Running 1 test using 1 worker

  ✓  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (1.8s)

  1 passed (4.3s)
EXIT=0
PORT 3000 FREE
PORT 4000 FREE
```

Bước TypeScript của `next build` cũng kiểm ba file của task này. Sau khi chạy, cả hai cổng trống lại: Playwright đã tắt API và `next start`.

- [ ] **Step 8: Kiểm tra báo cáo JSON (hợp đồng cho Task 10)**

```bash
ls test-results
node -e '
const report = JSON.parse(require("node:fs").readFileSync("test-results/e2e.json", "utf8"));
const {expected, unexpected, flaky, skipped} = report.stats;
console.log(JSON.stringify({expected, unexpected, flaky, skipped}));
const specs = [];
const walk = (suites, depth) => {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      specs.push({depth, file: suite.file, title: spec.title, ok: spec.ok,
        tests: spec.tests.map((t) => [t.expectedStatus, t.status, t.results.at(-1)?.status])});
    }
    walk(suite.suites, depth + 1);
  }
};
walk(report.suites, 0);
console.log(JSON.stringify(specs));
'
```

Expected:

```
e2e.json
node-tests.xml
{"expected":1,"unexpected":0,"flaky":0,"skipped":0}
[{"depth":0,"file":"v1-critical-journey.spec.ts","title":"v1 critical UI journey","ok":true,"tests":[["passed","expected","passed"]]}]
```

- `node-tests.xml` còn đó (nếu đã chạy `pnpm test` trước): Playwright chỉ dọn `apps/web/test-results/` (`outputDir`), không đụng `test-results/` ở gốc.
- Đúng một spec `v1 critical UI journey`, ở độ sâu 0 (`suites[0].specs[0]`); suite cấp file không có khóa `suites`. `tests[0]`: `expectedStatus` `'passed'`, `status` `'expected'`, kết quả cuối `'passed'`. Đây đúng là các điều kiện mà `verify-v1` (mục 4.11) kiểm.

- [ ] **Step 9: Chứng minh test bắt lỗi thật (RED có chủ đích), rồi khôi phục**

Đổi tiêu đề chờ ở bước reload thành tiền tố `'Tổng'`. Nếu locator không `exact`, `'Tổng'` vẫn khớp `Tổng quan` và test xanh giả; với `exact: true` test phải fail.

```bash
sed -i "/page.reload()/s/heading: 'Tổng quan'/heading: 'Tổng'/" apps/web/tests/v1-critical-journey.spec.ts
grep -n "page.reload()" apps/web/tests/v1-critical-journey.spec.ts
pnpm test:e2e; echo "EXIT=$?"
node -p 'JSON.stringify(require("./test-results/e2e.json").stats)'
ls apps/web/test-results/v1-critical-journey-v1-critical-UI-journey
```

Expected:

```
40:  await expectLoaded(page, {heading: 'Tổng', apiPath: `${BRAND_API}/analytics/overview`}, () => page.reload());
…
Running 1 test using 1 worker

  ✘  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (5.9s)


  1) tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey ───────────────────────────────

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('heading', { name: 'Tổng', exact: true })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
…
      16 |   await action();
      17 |   await loaded;
    > 18 |   await expect(page.getByRole('heading', {name: heading, exact: true})).toBeVisible();
         |                                                                         ^
…
        at expectLoaded (/…/DSM/apps/web/tests/v1-critical-journey.spec.ts:18:73)
        at /…/DSM/apps/web/tests/v1-critical-journey.spec.ts:40:3

    Error Context: test-results/v1-critical-journey-v1-critical-UI-journey/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/v1-critical-journey-v1-critical-UI-journey/trace.zip
…
  1 failed
    tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey ────────────────────────────────
/…/DSM/apps/web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@ test:e2e: `playwright test`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
EXIT=1
{"startTime":"…","duration":8909.831,"expected":0,"skipped":0,"unexpected":1,"flaky":0}
error-context.md
trace.zip
```

Fail đúng ở bước 2 (dòng 40), trace được giữ (`trace: 'retain-on-failure'`). Khôi phục và kiểm:

```bash
sed -i "/page.reload()/s/heading: 'Tổng'/heading: 'Tổng quan'/" apps/web/tests/v1-critical-journey.spec.ts
grep -c "heading: 'Tổng quan'" apps/web/tests/v1-critical-journey.spec.ts
pnpm test:e2e 2>&1 | grep -E "passed|failed"
```

Expected: `2`, rồi `  1 passed (…s)`.

- [ ] **Step 10: Ổn định qua 3 lần chạy liên tiếp và độc lập với biến môi trường của shell**

```bash
for i in 1 2 3; do pnpm test:e2e 2>&1 | grep -E "✓|✘|passed|failed|flaky"; echo "RUN $i EXIT=${PIPESTATUS[0]}"; done
STORE_DIR="$(mktemp -d)"
DEV_IN_MEMORY=0 APP_ENV=production API_PORT=4999 DEV_STORE_FILE="$STORE_DIR/store.json" \
  S3_ENDPOINT=http://203.0.113.1:9000 S3_REGION=x S3_ACCESS_KEY=x S3_SECRET_KEY=x S3_BUCKET=x \
  BROWSER_NODE_KEY=k BROWSER_GATEWAY_HOST=203.0.113.1 \
  DEV_OWNER_EMAIL=other@x.test DEV_OWNER_PASSWORD=other JWT_ACCESS_SECRET=other CREDENTIAL_ENCRYPTION_KEY=bad \
  WEB_ORIGINS=http://localhost:3000 COOKIE_SECURE=true \
  pnpm test:e2e 2>&1 | grep -E "✓|✘|passed|failed"; echo "HOSTILE_ENV EXIT=${PIPESTATUS[0]}"
ls "$STORE_DIR" | wc -l
rm -rf "$STORE_DIR"
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
```

Expected:

```
  ✓  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (1.7s)
  1 passed (3.5s)
RUN 1 EXIT=0
  ✓  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (2.1s)
  1 passed (4.3s)
RUN 2 EXIT=0
  ✓  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (1.7s)
  1 passed (4.4s)
RUN 3 EXIT=0
  ✓  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (1.9s)
  1 passed (4.2s)
HOSTILE_ENV EXIT=0
0
PORT 3000 FREE
PORT 4000 FREE
```

Lần chạy thứ tư đặt mọi biến làm đổi hành vi API sang giá trị sai (sai cổng, `APP_ENV=production` vốn làm `DEV_IN_MEMORY` bị cấm, file store, S3, Browser Node, owner, khóa, origin `localhost`, cookie `Secure`) mà vẫn pass, và không có file store nào được ghi (`0`): các ghi đè tường minh trong `webServer[0].env` có hiệu lực.

- [ ] **Step 11: Kiểm tra cây làm việc và commit**

```bash
git status --porcelain --ignored | grep -v node_modules
git add apps/web/playwright.config.ts apps/web/tests/e2e-owner.ts apps/web/tests/v1-critical-journey.spec.ts package.json
git commit -m "test(e2e): run the Playwright UI journey against the real API and production build" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git status --porcelain | wc -l
```

Expected trước commit:

```
 M apps/web/playwright.config.ts
 M apps/web/tests/v1-critical-journey.spec.ts
 M package.json
?? apps/web/tests/e2e-owner.ts
!! apps/web/.next/
!! apps/web/next-env.d.ts
!! apps/web/test-results/
!! apps/web/tsconfig.tsbuildinfo
!! test-results/
!! tests/web/tsconfig.tsbuildinfo
```

Mọi file do build, Playwright và runner sinh ra đều là `!!` (đã ignore từ Task 2), không có `??` nào ngoài `e2e-owner.ts`. Có thể có thêm dòng `!!` của thư mục đã ignore từ trước PR #1 (ví dụ `.data/` nếu từng chạy `pnpm dev`); điều kiện là không có `??` nào khác. Sau commit: `0`.

- [ ] **Step 12: Kiểm tra commit 9 trên clone sạch**

Trước khi chạy, kiểm lại hai cổng trống (vòng `for` ở Step 1).

```bash
CLEAN_DIR="$(mktemp -d)"
git clone -q . "$CLEAN_DIR/dsm"
(cd "$CLEAN_DIR/dsm" && git log --oneline -1 && pnpm install --frozen-lockfile 2>&1 | tail -1 && pnpm lint 2>&1 | tail -1 && pnpm typecheck > /dev/null && echo TYPECHECK_OK && pnpm test 2>&1 | grep -E "^ℹ (pass|fail)" && pnpm build > build.log 2>&1 && echo BUILD_OK && rm build.log && pnpm test:e2e 2>&1 | grep -E "✓|✘|passed|failed" && node -p 'JSON.stringify(require("./test-results/e2e.json").stats)' && echo "PORCELAIN_LINES=$(git status --porcelain | wc -l)")
rm -rf "$CLEAN_DIR"
```

Expected:

```
<sha> test(e2e): run the Playwright UI journey against the real API and production build
Done in 1.3s using pnpm v10.17.1
lint: ok (182 files: 133 .ts, 44 .tsx, 5 .mjs)
TYPECHECK_OK
ℹ pass 42
ℹ fail 0
BUILD_OK
  ✓  1 tests/v1-critical-journey.spec.ts:26:1 › v1 critical UI journey (1.8s)
  1 passed (3.5s)
{"startTime":"…","duration":3513.502,"expected":1,"skipped":0,"unexpected":0,"flaky":0}
PORCELAIN_LINES=0
```

Đây là điều kiện "nhất quán" sau commit 9 (mục 4.1): trên checkout sạch, `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` pass, theo đúng thứ tự của `verify`/`ci.yml`, và cây vẫn sạch.

### Task 10: `scripts/verify-v1.mjs` kiểm báo cáo test và cú pháp bằng chứng; viết lại `docs/verification/v1-acceptance.md`

Spec: mục 4.11 (và dạng cuối của script `verify` ở mục 4.13). Commit 10 trong thứ tự ở mục 4.1. Chạy sau Task 1–9. Mọi lệnh chạy từ gốc repo bằng bash, với môi trường của Task 0 Step 1. Cổng `127.0.0.1:3000` và `127.0.0.1:4000` phải trống (kiểm bằng vòng `for` ở Task 9 Step 1).

**Files:**
- Modify (viết lại toàn bộ): `scripts/verify-v1.mjs`
- Modify (viết lại toàn bộ): `docs/verification/v1-acceptance.md`
- Modify: `package.json` (chỉ script `verify`)

**Interfaces:**
- Consumes:
  - `test-results/node-tests.xml` (Task 6): mỗi test là `<testcase name="…" …/>`; cuối file có các comment đếm, mỗi comment một dòng thụt tab: `<!-- tests N -->`, `<!-- pass N -->`, `<!-- fail N -->`, `<!-- cancelled N -->`, `<!-- skipped N -->`, `<!-- todo N -->`.
  - Testcase `v1 acceptance harness` (Task 7) và `http api smoke journey` (Task 8). Một test có subtest được JUnit ghi thành `<testsuite name=…>` chứ không phải `<testcase>`, nên sẽ bị coi là thiếu (spec yêu cầu không subtest).
  - `test-results/e2e.json` (Task 9): khóa `stats` (`expected`, `unexpected`, `flaky`, `skipped`), `suites[]` với `specs[]` và `suites[]` lồng (có thể thiếu khóa); spec `v1 critical UI journey` có `ok`, `tests[]` (`expectedStatus`, `status`, `results[]` với `status`).
- Produces: `node scripts/verify-v1.mjs` (chỉ đọc file, không gọi mạng; root repo tính từ vị trí script nên chạy từ thư mục nào cũng được).
  - Hằng số: `MIN_NODE_TESTS = 42`. Tăng khi thêm test Node.
  - OK, khi `GITHUB_ACTIONS=true`: in `verify-v1: OK (<pass> node tests, <stats.expected> e2e) — CI run <GITHUB_SERVER_URL>/<GITHUB_REPOSITORY>/actions/runs/<GITHUB_RUN_ID> @ <GITHUB_SHA>`, ghi thêm đúng dòng đó vào `$GITHUB_STEP_SUMMARY` nếu biến này có; thiếu một trong bốn biến `GITHUB_*` thì FAIL.
  - OK, khi chạy máy: in `verify-v1: OK (<pass> node tests, <stats.expected> e2e) — LOCAL @ <git rev-parse HEAD> (clean|dirty) — không phải bằng chứng CI` (`dirty` khi `git status --porcelain` không rỗng); không đọc được git thì FAIL.
  - FAIL: in ra stderr `verify-v1: FAIL (<K> problem(s))` rồi mỗi lỗi một dòng `  - <lỗi>`, exit 1. Mọi lỗi được gom và in cùng lúc. Các thông báo cố định mà Task 12 dựa vào: `required test not executed: <tên>`, `required e2e not executed: "v1 critical UI journey" (tìm thấy <n> spec, cần đúng 1)`, `test-results/node-tests.xml: pass = <n> < MIN_NODE_TESTS = 42`, `test-results/e2e.json: stats.skipped = <n> (cần 0)`, `…: tests[0].expectedStatus = '<x>' (cần 'passed')`, `docs/verification/v1-acceptance.md: mục "<tên>": Status PASS thiếu dòng "Evidence: …"`.
- Produces: `docs/verification/v1-acceptance.md` có mục `CI baseline (SP1)` ở dòng ``Status: NOT_VERIFIED — no `pnpm verify` evidence has been recorded for the SP1 gate yet.`` (Task 12 red-check 4 và Task 13 sửa đúng dòng này).
- Produces: `pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs` (thứ tự bắt buộc: `pnpm test` xóa `test-results/`, E2E cần bản build). Đổi `verify` ngay ở task này để commit 10 "nhất quán": `verify-v1` mới cần `test-results/e2e.json`, mà `verify` cũ không chạy E2E.

- [ ] **Step 1: Ghi nhận cổng cũ nói dối (RED)**

```bash
rm -rf test-results
node scripts/verify-v1.mjs; echo "exit=$?"
grep -c '103/103' docs/verification/v1-acceptance.md
node -p "require('./package.json').scripts.verify"
```

Expected:

```
verify-v1: implementation evidence PASS; external/local blocked gates: 6
exit=0
1
npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs
```

`verify-v1` cũ báo PASS dù không có báo cáo test nào; tài liệu vẫn ghi "103/103" không có SHA; `verify` không chạy E2E.

- [ ] **Step 2: Viết lại `scripts/verify-v1.mjs`**

Nội dung đầy đủ:

```js
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

// Số test Node tối thiểu phải pass. Tăng khi thêm test; xóa bớt test thì cổng đỏ.
const MIN_NODE_TESTS = 42;
const REQUIRED_NODE_TESTS = ['v1 acceptance harness', 'http api smoke journey'];
const REQUIRED_E2E_TITLE = 'v1 critical UI journey';
const REQUIRED_SECTIONS = ['Automated implementation gate', 'Critical journey', 'CI baseline (SP1)'];
const NODE_COUNT_KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const NODE_ZERO_KEYS = ['fail', 'cancelled', 'skipped', 'todo'];
const E2E_ZERO_KEYS = ['unexpected', 'flaky', 'skipped'];

const STATUS_LINE = /^Status: (PASS|LOCAL|CI|NOT_VERIFIED|BLOCKED_EXTERNAL|BLOCKED_LOCAL_ENV)(?: — .+)?$/;
const PASS_EVIDENCE = /^Evidence: https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+ @ [0-9a-f]{40}$/;
const LOCAL_EVIDENCE = /^Evidence: local pnpm verify @ [0-9a-f]{40} \(\d{4}-\d{2}-\d{2}, [^,)]+, node v?24\.\d+\.\d+\)$/;

const NODE_REPORT = 'test-results/node-tests.xml';
const E2E_REPORT = 'test-results/e2e.json';
const ACCEPTANCE_DOC = 'docs/verification/v1-acceptance.md';

const root = join(import.meta.dirname, '..');
const problems = [];

function readRepoFile(relativePath, hint) {
  const file = join(root, relativePath);
  if (!existsSync(file)) {
    problems.push(`${relativePath}: không tìm thấy file (${hint})`);
    return undefined;
  }
  return readFileSync(file, 'utf8');
}

function unescapeXml(value) {
  const entities = {quot: '"', apos: "'", lt: '<', gt: '>', amp: '&'};
  return value.replace(/&(quot|apos|lt|gt|amp);/g, (_, name) => entities[name]);
}

function checkNodeReport() {
  const xml = readRepoFile(NODE_REPORT, 'chạy "pnpm test" trước');
  if (xml === undefined) return undefined;
  const counts = {};
  for (const key of NODE_COUNT_KEYS) {
    const found = [...xml.matchAll(new RegExp(`^\\s*<!-- ${key} (\\d+) -->\\s*$`, 'gm'))];
    if (found.length !== 1) {
      problems.push(`${NODE_REPORT}: cần đúng một comment "<!-- ${key} N -->", tìm thấy ${found.length}`);
      continue;
    }
    counts[key] = Number(found[0][1]);
  }
  for (const key of NODE_ZERO_KEYS) {
    if (counts[key] !== undefined && counts[key] !== 0) problems.push(`${NODE_REPORT}: ${key} = ${counts[key]} (cần 0)`);
  }
  if (counts.pass !== undefined && counts.pass < MIN_NODE_TESTS) {
    problems.push(`${NODE_REPORT}: pass = ${counts.pass} < MIN_NODE_TESTS = ${MIN_NODE_TESTS}`);
  }
  const executed = new Set([...xml.matchAll(/<testcase\b[^>]*?\bname="([^"]*)"/g)].map((match) => unescapeXml(match[1])));
  for (const name of REQUIRED_NODE_TESTS) {
    if (!executed.has(name)) problems.push(`required test not executed: ${name}`);
  }
  return counts.pass;
}

function collectSpecs(suites, out) {
  for (const suite of Array.isArray(suites) ? suites : []) {
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) out.push(spec);
    collectSpecs(suite.suites, out);
  }
  return out;
}

function checkE2eReport() {
  const text = readRepoFile(E2E_REPORT, 'chạy "pnpm test:e2e" sau "pnpm test"');
  if (text === undefined) return undefined;
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    problems.push(`${E2E_REPORT}: JSON không hợp lệ (${error.message})`);
    return undefined;
  }
  const stats = report.stats ?? {};
  if (!Number.isInteger(stats.expected) || stats.expected < 1) {
    problems.push(`${E2E_REPORT}: stats.expected = ${stats.expected} (cần ≥ 1)`);
  }
  for (const key of E2E_ZERO_KEYS) {
    if (stats[key] !== 0) problems.push(`${E2E_REPORT}: stats.${key} = ${stats[key]} (cần 0)`);
  }
  const specs = collectSpecs(report.suites, []).filter((spec) => spec.title === REQUIRED_E2E_TITLE);
  if (specs.length !== 1) {
    problems.push(`required e2e not executed: "${REQUIRED_E2E_TITLE}" (tìm thấy ${specs.length} spec, cần đúng 1)`);
    return stats.expected;
  }
  const spec = specs[0];
  const where = `${E2E_REPORT}: spec "${REQUIRED_E2E_TITLE}"`;
  if (spec.ok !== true) problems.push(`${where}: ok = ${spec.ok} (cần true)`);
  const tests = Array.isArray(spec.tests) ? spec.tests : [];
  if (tests.length === 0) problems.push(`${where}: tests[] rỗng`);
  tests.forEach((test, index) => {
    if (test.expectedStatus !== 'passed') {
      problems.push(`${where}: tests[${index}].expectedStatus = '${test.expectedStatus}' (cần 'passed')`);
    }
    if (test.status !== 'expected') problems.push(`${where}: tests[${index}].status = '${test.status}' (cần 'expected')`);
    const last = Array.isArray(test.results) ? test.results.at(-1) : undefined;
    if (last?.status !== 'passed') {
      problems.push(`${where}: tests[${index}].results[cuối].status = '${last?.status}' (cần 'passed')`);
    }
  });
  return stats.expected;
}

function checkAcceptanceDoc() {
  const text = readRepoFile(ACCEPTANCE_DOC, 'tài liệu nghiệm thu');
  if (text === undefined) return;
  const preamble = [];
  const sections = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) sections.push({title: line.slice(3).trim(), lines: []});
    else (sections.at(-1)?.lines ?? preamble).push(line);
  }
  for (const line of preamble) {
    if (/^(Status|Evidence):/.test(line)) problems.push(`${ACCEPTANCE_DOC}: phần mở đầu không được có dòng "${line}"`);
  }
  for (const section of sections) {
    const where = `${ACCEPTANCE_DOC}: mục "${section.title}"`;
    const statusLines = section.lines.filter((line) => line.startsWith('Status:'));
    if (statusLines.length !== 1) {
      problems.push(`${where}: cần đúng một dòng Status, tìm thấy ${statusLines.length}`);
      continue;
    }
    const match = STATUS_LINE.exec(statusLines[0]);
    if (!match) {
      problems.push(`${where}: dòng Status sai cú pháp: "${statusLines[0]}"`);
      continue;
    }
    const status = match[1];
    if (status === 'PASS' && !section.lines.some((line) => PASS_EVIDENCE.test(line))) {
      problems.push(`${where}: Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"`);
    }
    if (status === 'LOCAL' && !section.lines.some((line) => LOCAL_EVIDENCE.test(line))) {
      problems.push(`${where}: Status LOCAL thiếu dòng "Evidence: local pnpm verify @ <sha 40 ký tự> (<YYYY-MM-DD>, <máy>, node v24.x.y)"`);
    }
  }
  const titles = new Set(sections.map((section) => section.title));
  for (const title of REQUIRED_SECTIONS) {
    if (!titles.has(title)) problems.push(`${ACCEPTANCE_DOC}: thiếu mục "## ${title}"`);
  }
}

function runOrigin() {
  const inCi = process.env.GITHUB_ACTIONS === 'true';
  if (inCi) {
    const names = ['GITHUB_SERVER_URL', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_SHA'];
    const missing = names.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      problems.push(`thiếu biến môi trường CI: ${missing.join(', ')}`);
      return undefined;
    }
    const {GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA} = process.env;
    return `CI run ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID} @ ${GITHUB_SHA}`;
  }
  try {
    const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    const sha = git('rev-parse', 'HEAD').trim();
    const tree = git('status', '--porcelain').trim() === '' ? 'clean' : 'dirty';
    return `LOCAL @ ${sha} (${tree}) — không phải bằng chứng CI`;
  } catch (error) {
    problems.push(`không đọc được commit HEAD bằng git: ${error.message.split('\n')[0]}`);
    return undefined;
  }
}

const nodeTests = checkNodeReport();
const e2eTests = checkE2eReport();
checkAcceptanceDoc();
const origin = runOrigin();

if (problems.length > 0) {
  console.error(`verify-v1: FAIL (${problems.length} problem(s))`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const line = `verify-v1: OK (${nodeTests} node tests, ${e2eTests} e2e) — ${origin}`;
console.log(line);
if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
```

Ghi chú:
- Comment đếm được đọc bằng regex neo đầu dòng và phải xuất hiện đúng một lần; tên trong thuộc tính `name` của `<testcase>` được bỏ escape XML (`&quot;`, `&apos;`, `&lt;`, `&gt;`, `&amp;`) trước khi so.
- JUnit không phân biệt được test gắn `expectFailure` (spec mục 4.11); luật 2 của lint (Task 1) chặn ở mã nguồn, red-check 7 (Task 12) chứng minh.
- Spec E2E được tìm đệ quy qua `suites[].specs` và `suites[].suites[]`, khóa thiếu được coi là mảng rỗng; phải có **đúng một** spec tên `v1 critical UI journey`. Với mỗi phần tử `tests[]`: `expectedStatus === 'passed'`, `status === 'expected'`, phần tử cuối của `results[]` có `status === 'passed'`. Kiểm này chặn `test.fail()` (Playwright ghi `ok: true` cho test hỏng thật được đánh dấu `test.fail`, đã đo với 1.56.1).
- Tài liệu được tách theo dòng bắt đầu bằng `## `; mọi dòng bắt đầu bằng `Status:` trong một mục đều được đếm (phải đúng một và phải khớp regex của spec); phần mở đầu không được có dòng bắt đầu bằng `Status:` hoặc `Evidence:`.
- Không có chữ `TODO`/`FIXME`/`HACK` viết hoa (luật 1 của lint quét cả `scripts/`).

- [ ] **Step 3: Chạy `verify-v1` mới với tài liệu cũ và không có báo cáo (RED)**

```bash
rm -rf test-results
node scripts/verify-v1.mjs; echo "exit=$?"
```

Expected (đã đo):

```
verify-v1: FAIL (6 problem(s))
  - test-results/node-tests.xml: không tìm thấy file (chạy "pnpm test" trước)
  - test-results/e2e.json: không tìm thấy file (chạy "pnpm test:e2e" sau "pnpm test")
  - docs/verification/v1-acceptance.md: mục "Automated implementation gate": Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"
  - docs/verification/v1-acceptance.md: mục "Critical journey": Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"
  - docs/verification/v1-acceptance.md: mục "Local-first persistence": Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"
  - docs/verification/v1-acceptance.md: thiếu mục "## CI baseline (SP1)"
exit=1
```

Ba tuyên bố PASS cũ không có Evidence đều bị bắt, cùng với mục bắt buộc còn thiếu.

- [ ] **Step 4: Viết lại `docs/verification/v1-acceptance.md`**

Nội dung đầy đủ (giữ nguyên từng byte sáu mục Facebook, Instagram, Threads, TikTok, GPMLogin, Docker/Node 24 của bản cũ):

```markdown
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

Status: NOT_VERIFIED — no `pnpm verify` evidence has been recorded for the SP1 gate yet.

How this section changes:

- `LOCAL`: after `pnpm install --frozen-lockfile && pnpm verify` passed on a clean clone of the latest code commit; the evidence line points at that commit and is committed afterwards, because a commit cannot contain its own SHA.
- `PASS`: after a successful `CI / verify` run on `main`, with the run URL and the SHA it checked; the annotated tag `gd0-sp1-ci-green` points at the same SHA.

## Local-first persistence

Status: NOT_VERIFIED — no automated test restores business state from `DEV_STORE_FILE` snapshots; sub-project SP2 replaces this runtime.

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
```

Kiểm nhanh sáu mục giữ nguyên:

```bash
diff <(git show HEAD:docs/verification/v1-acceptance.md | sed -n '/^## Facebook live publish/,$p') <(sed -n '/^## Facebook live publish/,$p' docs/verification/v1-acceptance.md) && echo PLATFORM_SECTIONS_UNCHANGED
```

Expected: `PLATFORM_SECTIONS_UNCHANGED`.

- [ ] **Step 5: Đổi script `verify` sang chuỗi cuối của spec mục 4.13**

Áp diff (trạng thái `package.json` sau Task 9: `test:e2e` đã có, `test:integration` còn đó tới Task 11):

```bash
git apply <<'EOF'
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -13,7 +13,7 @@
     "build": "pnpm --filter web build",
     "test:e2e": "pnpm --filter web test:e2e",
     "lint": "node scripts/lint.mjs",
-    "verify": "npm run lint && npm run typecheck && npm test && npm run build && node scripts/verify-v1.mjs",
+    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs",
     "dev": "corepack pnpm --parallel --filter api --filter web dev",
     "dev:gateway": "corepack pnpm --filter browser-gateway dev",
     "dev:worker": "corepack pnpm --filter worker dev",
EOF
node -p "require('./package.json').scripts.verify"
```

Expected: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs`

- [ ] **Step 6: Chạy toàn bộ cổng (GREEN)**

```bash
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
EVID="${TMPDIR:-/tmp}/sp1-evidence"; mkdir -p "$EVID"
pnpm verify > "$EVID/task10-verify.log" 2>&1; echo "exit=$?"
grep -E '^lint: |^ℹ (tests|pass|fail|skipped|todo) |^  [0-9]+ (passed|failed|skipped|flaky)|^verify-v1: ' "$EVID/task10-verify.log"
git status --porcelain
```

Expected:

```
PORT 3000 FREE
PORT 4000 FREE
exit=0
lint: ok (183 files: 134 .ts, 44 .tsx, 5 .mjs)
ℹ tests 42
ℹ pass 42
ℹ fail 0
ℹ skipped 0
ℹ todo 0
  1 passed (…s)
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha commit Task 9> (dirty) — không phải bằng chứng CI
 M docs/verification/v1-acceptance.md
 M package.json
 M scripts/verify-v1.mjs
```

- Số file lint là `182 files: 133 .ts` nếu `apps/web/next-env.d.ts` chưa được sinh (cây chưa build); con số không quan trọng, chỉ cần `lint: ok`.
- `dirty` vì ba file chưa commit; `git status` không có dòng `??`: mọi file do test, build, Playwright sinh ra đều đã được ignore.

- [ ] **Step 7: Kiểm ngược `verify-v1` trên báo cáo thật (RED có chủ đích, không commit)**

Khối lệnh dưới đây sao lưu hai báo cáo vừa sinh và tài liệu, rồi mỗi lần sửa đúng một chỗ, chạy `verify-v1` và khôi phục. Các trường bị sửa trong `e2e.json` đúng là các trường mà Playwright 1.56.1 ghi khi spec dùng `test.fail()` trên test hỏng thật, `test.skip()`, đổi tên hoặc trùng spec (đã đo bằng các lần chạy thật). Chạy trong cùng một shell bash:

```bash
B="$(mktemp -d)"
cp test-results/node-tests.xml test-results/e2e.json docs/verification/v1-acceptance.md "$B/"
restore() { cp "$B/node-tests.xml" "$B/e2e.json" test-results/ && cp "$B/v1-acceptance.md" docs/verification/; }
check() { echo "== $1"; node scripts/verify-v1.mjs; echo "exit=$?"; restore; }
edit_e2e() { node -e '
const fs = require("node:fs");
const file = "test-results/e2e.json";
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const holders = [];
(function walk(suites) { for (const suite of suites ?? []) { if ((suite.specs ?? []).some((s) => s.title === "v1 critical UI journey")) holders.push(suite); walk(suite.suites); } })(report.suites);
const suite = holders[0];
const spec = suite.specs.find((s) => s.title === "v1 critical UI journey");
const test = spec.tests[0];
eval(process.argv[1]);
fs.writeFileSync(file, JSON.stringify(report));
' "$1"; }
sed -i -E 's/<!-- pass [0-9]+ -->/<!-- pass 41 -->/' test-results/node-tests.xml; check "node: pass < MIN_NODE_TESTS"
sed -i 's/<testcase name="http api smoke journey"/<testcase name="http api smoke (renamed)"/' test-results/node-tests.xml; check "node: thiếu testcase bắt buộc"
sed -i 's/<!-- skipped 0 -->/<!-- skipped 1 -->/' test-results/node-tests.xml; check "node: skipped"
edit_e2e 'test.expectedStatus = "failed"; test.results.at(-1).status = "failed";'; check "e2e: test.fail() trên test hỏng thật"
edit_e2e 'report.stats.expected = 0; report.stats.skipped = 1; test.expectedStatus = "skipped"; test.status = "skipped"; test.results.at(-1).status = "skipped";'; check "e2e: skipped"
edit_e2e 'spec.title = "v1 critical UI journey (renamed)";'; check "e2e: thiếu spec"
edit_e2e 'suite.specs.push(structuredClone(spec));'; check "e2e: spec trùng"
sed -i '/^## CI baseline (SP1)$/,/^## /s/^Status: .*/Status: PASS/' docs/verification/v1-acceptance.md; check "doc: PASS không có Evidence"
sed -i '/^## CI baseline (SP1)$/,/^## /s/^Status: .*/Status: LOCAL/' docs/verification/v1-acceptance.md; check "doc: LOCAL không có Evidence"
sed -i "/^## CI baseline (SP1)\$/,/^## /s/^Status: .*/Status: LOCAL\n\nEvidence: local pnpm verify @ $(git rev-parse HEAD) ($(date -u +%F), red-check, node $(node -v))/" docs/verification/v1-acceptance.md; check "doc: LOCAL có Evidence (phải OK)"
sed -i 's/^Evidence rules:$/Status: PASS\n\nEvidence rules:/' docs/verification/v1-acceptance.md; check "doc: Status trong phần mở đầu"
echo "== CI mode"
GITHUB_ACTIONS=true GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=owner/repo GITHUB_RUN_ID=123 GITHUB_SHA=$(git rev-parse HEAD) GITHUB_STEP_SUMMARY="$B/summary.md" node scripts/verify-v1.mjs; echo "exit=$?"
cat "$B/summary.md"
rm -rf "$B"
node scripts/verify-v1.mjs; echo "exit=$?"
```

Expected (đã đo; `<sha>` là `git rev-parse HEAD`, tức commit Task 9):

```
== node: pass < MIN_NODE_TESTS
verify-v1: FAIL (1 problem(s))
  - test-results/node-tests.xml: pass = 41 < MIN_NODE_TESTS = 42
exit=1
== node: thiếu testcase bắt buộc
verify-v1: FAIL (1 problem(s))
  - required test not executed: http api smoke journey
exit=1
== node: skipped
verify-v1: FAIL (1 problem(s))
  - test-results/node-tests.xml: skipped = 1 (cần 0)
exit=1
== e2e: test.fail() trên test hỏng thật
verify-v1: FAIL (2 problem(s))
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].expectedStatus = 'failed' (cần 'passed')
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].results[cuối].status = 'failed' (cần 'passed')
exit=1
== e2e: skipped
verify-v1: FAIL (5 problem(s))
  - test-results/e2e.json: stats.expected = 0 (cần ≥ 1)
  - test-results/e2e.json: stats.skipped = 1 (cần 0)
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].expectedStatus = 'skipped' (cần 'passed')
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].status = 'skipped' (cần 'expected')
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].results[cuối].status = 'skipped' (cần 'passed')
exit=1
== e2e: thiếu spec
verify-v1: FAIL (1 problem(s))
  - required e2e not executed: "v1 critical UI journey" (tìm thấy 0 spec, cần đúng 1)
exit=1
== e2e: spec trùng
verify-v1: FAIL (1 problem(s))
  - required e2e not executed: "v1 critical UI journey" (tìm thấy 2 spec, cần đúng 1)
exit=1
== doc: PASS không có Evidence
verify-v1: FAIL (1 problem(s))
  - docs/verification/v1-acceptance.md: mục "CI baseline (SP1)": Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"
exit=1
== doc: LOCAL không có Evidence
verify-v1: FAIL (1 problem(s))
  - docs/verification/v1-acceptance.md: mục "CI baseline (SP1)": Status LOCAL thiếu dòng "Evidence: local pnpm verify @ <sha 40 ký tự> (<YYYY-MM-DD>, <máy>, node v24.x.y)"
exit=1
== doc: LOCAL có Evidence (phải OK)
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha> (dirty) — không phải bằng chứng CI
exit=0
== doc: Status trong phần mở đầu
verify-v1: FAIL (1 problem(s))
  - docs/verification/v1-acceptance.md: phần mở đầu không được có dòng "Status: PASS"
exit=1
== CI mode
verify-v1: OK (42 node tests, 1 e2e) — CI run https://github.com/owner/repo/actions/runs/123 @ <sha>
exit=0
verify-v1: OK (42 node tests, 1 e2e) — CI run https://github.com/owner/repo/actions/runs/123 @ <sha>
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha> (dirty) — không phải bằng chứng CI
exit=0
```

Dòng `verify-v1: OK … CI run …` thứ hai là nội dung `$GITHUB_STEP_SUMMARY`. Lần chạy cuối (sau khi khôi phục) phải OK: báo cáo và tài liệu đã về nguyên trạng. Các kiểm ngược bằng lần chạy thật (`test.skip`, `test.fail()`, xóa test) nằm ở Task 12.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-v1.mjs docs/verification/v1-acceptance.md package.json
git commit -m "test(verify): check JUnit, Playwright JSON and acceptance evidence in verify-v1" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
node scripts/verify-v1.mjs
git status --porcelain | wc -l
```

Expected: `verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha commit vừa tạo> (clean) — không phải bằng chứng CI`, rồi `0`.

### Task 11: Workflow `CI / verify`, runbook mục 5, bỏ script `test:integration`

Spec: mục 4.3, 4.12, 4.13. Commit 11 trong thứ tự ở mục 4.1. Chạy sau Task 10, cùng môi trường; cổng 3000/4000 trống.

**Files:**
- Modify (viết lại toàn bộ): `.github/workflows/ci.yml`
- Modify: `docs/runbooks/local-development.md` (chỉ mục "5. Verify"; không động vào đoạn dòng 35 mà PR #1 đã sửa)
- Modify: `package.json` (xóa `test:integration`)

**Interfaces:**
- Produces: check `CI / verify` (workflow `CI`, job `verify`) chạy trên `push` vào `main`, mọi `pull_request` và `workflow_dispatch`; các bước theo đúng thứ tự `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` → cài Chromium → `pnpm test:e2e` → `node scripts/verify-v1.mjs` → "Clean tree"; artifact `test-results-<sha>` (luôn upload, kể cả khi fail).
- Consumes: `.node-version` (Task 2), `packageManager` của `package.json` (pnpm 10.17.1; không có `with: version`), `pnpm-lock.yaml` (Task 2), script `test:e2e`/`verify` (Task 9, 10).
- Produces: script root cuối cùng theo spec mục 4.13: `lint`, `typecheck`, `test`, `build`, `test:e2e`, `verify` (cộng các script `dev*` giữ nguyên); không còn `test:integration`.
- `browser-smoke.yml` giữ nguyên.

- [ ] **Step 1: Ghi nhận workflow, script và runbook cũ (RED)**

Lệnh so `ci.yml` với khối YAML trong spec mục 4.3 (file spec đã nằm trong nhánh từ Task 0):

````bash
spec_ci() { sed -n '/^### 4.3/,/^### 4.4/p' docs/superpowers/specs/2026-10-13-dsm-sp1-ci-verification-gate-design.md | sed -n '/^```yaml$/,/^```$/p' | sed '1d;$d'; }
spec_ci | wc -l
diff <(spec_ci) .github/workflows/ci.yml > /dev/null; echo "CI_MATCHES_SPEC=$?"
sed -n 's/^      - run: //p' .github/workflows/ci.yml
grep -c '"test:integration"' package.json
grep -c 'npm run verify' docs/runbooks/local-development.md
````

Expected:

```
45
CI_MATCHES_SPEC=1
pnpm install --no-frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
node scripts/verify-v1.mjs
1
1
```

Workflow cũ cài không frozen, gọi `test:integration` (trùng `test`), không chạy E2E, không kiểm cây sạch, chạy `push` trên mọi nhánh.

- [ ] **Step 2: Viết lại `.github/workflows/ci.yml`**

Nội dung đầy đủ (đúng từng dòng khối YAML ở spec mục 4.3):

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    env:
      NEXT_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm --filter web exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - run: node scripts/verify-v1.mjs
      - name: Clean tree
        run: |
          git status --porcelain
          test -z "$(git status --porcelain)"
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ github.sha }}
          path: |
            test-results/
            apps/web/test-results/
          if-no-files-found: ignore
          retention-days: 30
```

- [ ] **Step 3: Sửa mục 5 của runbook**

Áp diff (chỉ chạm mục "5. Verify" ở cuối file; dòng 1–54, gồm đoạn dòng 35, giữ nguyên):

````bash
git apply <<'EOF'
diff --git a/docs/runbooks/local-development.md b/docs/runbooks/local-development.md
--- a/docs/runbooks/local-development.md
+++ b/docs/runbooks/local-development.md
@@ -55,7 +55,17 @@ The gateway registers/heartbeats to `CORE_API_URL`, starts the configured GPM pr
 ## 5. Verify
 
 ```bash
-npm run verify
+pnpm verify
 ```
 
-The automated gate covers lint, strict typecheck, unit/integration tests, build checks, and V1 artifact verification. Live Facebook/Instagram/Threads/TikTok publishing and GPMLogin smoke tests require real authorized test accounts and are deliberately separate acceptance gates.
+`pnpm verify` runs the same chain as the `CI / verify` job: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (a real `next build`), `pnpm test:e2e` (Playwright starts the API on 127.0.0.1:4000 and `next start` on 127.0.0.1:3000 by itself) and `node scripts/verify-v1.mjs` (checks the test reports and `docs/verification/v1-acceptance.md`).
+
+Requirements:
+
+- Node >=24.7 and <25: the API's argon2id hasher needs `crypto.argon2Sync`, and `pnpm install` refuses other Node versions (`engineStrict`).
+- Ports 127.0.0.1:3000 and 127.0.0.1:4000 must be free: stop `pnpm dev` first.
+- Install Chromium for Playwright once: `pnpm --filter web exec playwright install chromium`.
+- Do not export `NEXT_PUBLIC_API_BASE_URL` when building for the E2E run; the build must keep the default `http://127.0.0.1:4000`.
+- A passing run on your machine ends with `verify-v1: OK (...) — LOCAL @ <sha> (clean|dirty) — không phải bằng chứng CI`. This is `LOCAL` evidence, not CI evidence. Record it in `docs/verification/v1-acceptance.md` only when the line says `(clean)`.
+
+The automated gate covers lint, strict typecheck, Node tests (unit tests, the acceptance harness and the HTTP API smoke), the production build, the Playwright UI journey and the evidence check. Live Facebook/Instagram/Threads/TikTok publishing and GPMLogin smoke tests require real authorized test accounts and are deliberately separate acceptance gates.
EOF
````

- [ ] **Step 4: Xóa script `test:integration`**

```bash
git apply <<'EOF'
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -8,7 +8,6 @@
   },
   "scripts": {
     "test": "node scripts/run-tests.mjs",
-    "test:integration": "node scripts/run-tests.mjs",
     "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json",
     "build": "pnpm --filter web build",
     "test:e2e": "pnpm --filter web test:e2e",
EOF
node -p "JSON.stringify(require('./package.json').scripts, null, 2)"
```

Expected:

```
{
  "test": "node scripts/run-tests.mjs",
  "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json",
  "build": "pnpm --filter web build",
  "test:e2e": "pnpm --filter web test:e2e",
  "lint": "node scripts/lint.mjs",
  "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs",
  "dev": "corepack pnpm --parallel --filter api --filter web dev",
  "dev:gateway": "corepack pnpm --filter browser-gateway dev",
  "dev:worker": "corepack pnpm --filter worker dev",
  "dev:all": "corepack pnpm --parallel --filter api --filter worker --filter web --filter browser-gateway dev"
}
```

Sáu script của spec mục 4.13 có đúng giá trị (thứ tự khóa không quan trọng); các script `dev*` giữ nguyên.

- [ ] **Step 5: Kiểm tĩnh workflow, script và runbook (GREEN)**

YAML được kiểm bằng parser `yaml` và bộ kiểm schema workflow GitHub `@action-validator/cli`, cài vào thư mục tạm (không đụng `package.json`/lockfile của repo):

````bash
spec_ci() { sed -n '/^### 4.3/,/^### 4.4/p' docs/superpowers/specs/2026-10-13-dsm-sp1-ci-verification-gate-design.md | sed -n '/^```yaml$/,/^```$/p' | sed '1d;$d'; }
diff <(spec_ci) .github/workflows/ci.yml && echo CI_MATCHES_SPEC
V="$(mktemp -d)"
npm --prefix "$V" install --no-audit --no-fund --silent yaml@2.8.1 @action-validator/core@0.6.0 @action-validator/cli@0.6.0
"$V/node_modules/.bin/yaml" valid < .github/workflows/ci.yml && echo YAML_OK
"$V/node_modules/.bin/action-validator" .github/workflows/ci.yml && echo SCHEMA_OK
rm -rf "$V"
pnpm run test:integration; echo "exit=$?"
grep -rn 'test:integration' package.json apps/*/package.json packages/*/package.json .github scripts docs/runbooks docs/verification; echo "grep-exit=$?"
grep -c 'npm run verify' docs/runbooks/local-development.md
````

Expected:

```
CI_MATCHES_SPEC
YAML_OK
SCHEMA_OK
 ERR_PNPM_NO_SCRIPT  Missing script: test:integration

Command "test:integration" not found.
exit=1
grep-exit=1
0
```

`grep-exit=1`: không còn chỗ nào (ngoài `docs/superpowers/`) gọi `test:integration`. Đối chứng đã đo cho bộ kiểm schema: đổi `runs-on` thành `runs_on` thì `action-validator` báo lỗi `OneOf conditions are not met` tại `/jobs/verify` và exit 1.

- [ ] **Step 6: Chạy toàn bộ cổng như CI (GREEN), rồi commit**

```bash
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
EVID="${TMPDIR:-/tmp}/sp1-evidence"; mkdir -p "$EVID"
pnpm verify > "$EVID/task11-verify.log" 2>&1; echo "exit=$?"
tail -n 1 "$EVID/task11-verify.log"
git status --porcelain
git add .github/workflows/ci.yml docs/runbooks/local-development.md package.json
git commit -m "ci: run the full verify gate in GitHub Actions and drop test:integration" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git status --porcelain
test -z "$(git status --porcelain)"; echo "clean-tree-exit=$?"
```

Expected:

```
PORT 3000 FREE
PORT 4000 FREE
exit=0
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha commit Task 10> (dirty) — không phải bằng chứng CI
 M .github/workflows/ci.yml
 M docs/runbooks/local-development.md
 M package.json
[claude/dreamy-shannon-416aba <sha>] ci: run the full verify gate in GitHub Actions and drop test:integration
 3 files changed, …
clean-tree-exit=0
```

Hai lệnh cuối là đúng bước "Clean tree" của `ci.yml`: sau toàn bộ `pnpm verify`, chỉ có ba file của task này thay đổi (không có file sinh ra nào lọt khỏi `.gitignore`), và sau commit thì `git status --porcelain` rỗng. Ghi lại SHA của commit này: `git rev-parse HEAD` (Task 13 dùng).

### Task 12: Chạy 10 red-check của spec mục 5 (không commit)

Spec: mục 5. Mỗi lỗi cố ý phải làm cổng fail ở đúng bước. **Không commit gì trong task này**: mỗi red-check sửa tạm, chạy, đối chiếu, rồi khôi phục bằng `git checkout`/`git status`. Kết quả được ghi vào `$EVID/red-checks.md` để dán vào mô tả PR (Task 14).

Điều kiện trước: HEAD là commit Task 11, `git status --porcelain` rỗng, `pnpm verify` vừa xanh ở Task 11 Step 6, cổng 3000/4000 trống, môi trường của Task 0 Step 1. Toàn bộ task mất khoảng 25–35 phút (nhiều red-check chạy trọn `pnpm verify`, gồm `next build` và E2E).

Ba chỗ lệch so với bảng ở spec mục 5 (đã đo, xem ghi chú từng red-check): red-check 1 bị `pnpm lint` (luật 2) chặn trước `verify-v1`, nên phần "`verify-v1` (skipped > 0)" được chứng minh bằng chuỗi bỏ qua lint; red-check 7 phải gắn `expectFailure` cho **cả** harness lẫn HTTP smoke (cả hai dùng `FakePublisher`); red-check 8 phải làm hành trình hỏng thật (nếu không Playwright tự exit 1 với "expected to fail, but passed") và lỗi không được là timeout (`timedOut` ≠ `failed` cũng làm Playwright exit 1).

- [ ] **Step 1: Chuẩn bị file kết quả**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"; mkdir -p "$EVID"
git log -1 --format='%H %s'
git status --porcelain | wc -l
printf '%s\n' '| # | Lỗi cố ý | Bước phải fail (spec) | Kết quả đo |' '|---|---|---|---|' > "$EVID/red-checks.md"
```

Expected: `<sha> ci: run the full verify gate in GitHub Actions and drop test:integration`, rồi `0`.

Quy tắc cho mọi step dưới đây: chỉ chạy lệnh `printf … >> "$EVID/red-checks.md"` ở cuối step khi output khớp Expected. Nếu không khớp: khôi phục bằng lệnh revert của step, dừng và điều tra; không sửa Expected cho khớp.

- [ ] **Step 2: Red-check 1 — thêm `test.skip` vào spec E2E**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
wc -l < apps/web/tests/v1-critical-journey.spec.ts
printf '%s\n' "test.skip(true, 'red-check 1');" >> apps/web/tests/v1-critical-journey.spec.ts
pnpm verify > "$EVID/rc1.log" 2>&1; echo "exit=$?"
grep -A1 '^lint: ' "$EVID/rc1.log"
(pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs) > "$EVID/rc1-nolint.log" 2>&1; echo "nolint-exit=$?"
grep -E '^  [0-9]+ (passed|failed|skipped)|^verify-v1: |^  - [^ ]' "$EVID/rc1-nolint.log"
git checkout -- apps/web/tests/v1-critical-journey.spec.ts; git status --porcelain | wc -l
```

Expected:

```
67
exit=1
lint: 1 problem(s)
  apps/web/tests/v1-critical-journey.spec.ts:68 rule 2 (test marker): test.skip
nolint-exit=1
  1 skipped
verify-v1: FAIL (5 problem(s))
  - test-results/e2e.json: stats.expected = 0 (cần ≥ 1)
  - test-results/e2e.json: stats.skipped = 1 (cần 0)
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].expectedStatus = 'skipped' (cần 'passed')
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].status = 'skipped' (cần 'expected')
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].results[cuối].status = 'skipped' (cần 'passed')
0
```

`pnpm verify` dừng ngay ở `pnpm lint` (luật 2 bắt `test.skip`), sớm hơn bảng spec. Bỏ qua lint thì Playwright exit 0 với `1 skipped` (đúng lỗ hổng spec mục 2 mô tả) và `verify-v1` fail vì `stats.skipped = 1`: đúng bước spec yêu cầu. `test.skip(true, …)` ở cuối file vẫn skip mọi test trong file (đã đo với Playwright 1.56.1). Dòng `67` là số dòng của spec Task 9; nếu khác, số dòng trong thông báo lint là số đó cộng 1.

```bash
printf '%s\n' "| 1 | \`test.skip\` trong spec E2E | \`verify-v1\` (skipped > 0) | \`pnpm verify\` fail ở \`pnpm lint\` (luật 2: \`test.skip\`); bỏ qua lint: Playwright exit 0 (\`1 skipped\`), \`verify-v1\` FAIL \`stats.skipped = 1 (cần 0)\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 3: Red-check 2 — xóa file test harness**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
rm tests/acceptance/v1-acceptance-harness.test.ts
pnpm verify > "$EVID/rc2.log" 2>&1; echo "exit=$?"
grep -c '^lint: ok' "$EVID/rc2.log"
grep -E '^ℹ (pass|fail) |^  [0-9]+ (passed|failed)|^verify-v1: |^  - [^ ]' "$EVID/rc2.log"
git checkout -- tests/acceptance/v1-acceptance-harness.test.ts; git status --porcelain | wc -l
```

Expected:

```
exit=1
1
ℹ pass 41
ℹ fail 0
  1 passed (…s)
verify-v1: FAIL (2 problem(s))
  - test-results/node-tests.xml: pass = 41 < MIN_NODE_TESTS = 42
  - required test not executed: v1 acceptance harness
0
```

Lint (`1` dòng `lint: ok`), typecheck, test, build, E2E đều xanh; chỉ `verify-v1` bắt được test bắt buộc biến mất.

```bash
printf '%s\n' "| 2 | Xóa file test harness | \`verify-v1\` (required test not executed) | \`verify-v1\` FAIL: \`pass = 41 < MIN_NODE_TESTS = 42\`, \`required test not executed: v1 acceptance harness\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 4: Red-check 3 — trả `csrf_token` về `Path=/auth`**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
sed -i 's|SameSite=Lax; Path=/; Max-Age=2592000|SameSite=Lax; Path=/auth; Max-Age=2592000|' apps/api/src/main.ts
git diff --stat
pnpm verify > "$EVID/rc3.log" 2>&1; echo "exit=$?"
grep -E '^ℹ (pass|fail) |^  [0-9]+ (passed|failed)' "$EVID/rc3.log"
grep -c '^verify-v1: ' "$EVID/rc3.log"
grep -c 'Test timeout of 30000ms exceeded' "$EVID/rc3.log"
grep -c 'v1-critical-journey\.spec\.ts:40' "$EVID/rc3.log"
git checkout -- apps/api/src/main.ts; git status --porcelain | wc -l
```

Expected:

```
 apps/api/src/main.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
exit=1
ℹ pass 42
ℹ fail 0
  1 failed
0
<số ≥ 1>
<số ≥ 1>
0
```

- `sed` chỉ khớp cookie `csrf_token` (dòng 21 của `main.ts`); cookie `refresh_token` có sẵn `Path=/auth` và chuỗi `Max-Age=2592000` của nó đứng sau `Path=/auth`, không phải `Path=/`.
- `pnpm test` vẫn xanh (42 pass): HTTP smoke tự ghép header `cookie` và không assert Path của `csrf_token` (đã đo: smoke pass với sửa đổi này).
- E2E fail ở bước 2 (`page.reload()`, dòng 40 của spec): sau khi tải lại, trang không đọc được `csrf_token` (cookie chỉ thuộc `/auth`), `/auth/refresh` trả 403, endpoint Tổng quan không bao giờ trả 200 nên `expectLoaded` chờ tới hết thời gian test. Không có dòng `verify-v1:` vì chuỗi dừng ở `pnpm test:e2e`.
- Phần E2E đã được đo khi viết Task 9 (đúng sửa đổi `sed` này, chạy `pnpm --filter web test:e2e` trên bản build của commit 9): `1 failed` sau khoảng 30 giây, lỗi `Test timeout of 30000ms exceeded` trong `page.waitForResponse`, stack trỏ dòng 40 của spec (bước 2, `page.reload()`), exit 1. Chuỗi `pnpm verify` đầy đủ với sửa đổi này chưa được chạy khi viết plan (cổng 3000/4000 dành cho agent khác). Điều kiện bắt buộc: `exit=1`, `ℹ pass 42`, `  1 failed`, `0` dòng `verify-v1:`. Nếu lỗi E2E hiện ở bước khác bước 2, ghi đúng bước đo được vào bảng và báo lại.

```bash
printf '%s\n' "| 3 | \`csrf_token\` về \`Path=/auth\` (\`apps/api/src/main.ts\`) | E2E, bước tải lại trang | \`pnpm test\` 42 pass; \`pnpm test:e2e\` \`1 failed\` ở bước 2 (\`page.reload()\`, dòng 40) |" >> "$EVID/red-checks.md"
```

- [ ] **Step 5: Red-check 4 — ghi `Status: PASS` không kèm Evidence**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
sed -i '/^## CI baseline (SP1)$/,/^## /s/^Status: .*/Status: PASS/' docs/verification/v1-acceptance.md
git diff -U0 docs/verification/v1-acceptance.md | grep '^[-+]Status'
pnpm verify > "$EVID/rc4.log" 2>&1; echo "exit=$?"
grep -E '^  [0-9]+ (passed|failed)|^verify-v1: |^  - [^ ]' "$EVID/rc4.log"
git checkout -- docs/verification/v1-acceptance.md; git status --porcelain | wc -l
```

Expected:

```
-Status: NOT_VERIFIED — no `pnpm verify` evidence has been recorded for the SP1 gate yet.
+Status: PASS
exit=1
  1 passed (…s)
verify-v1: FAIL (1 problem(s))
  - docs/verification/v1-acceptance.md: mục "CI baseline (SP1)": Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"
0
```

```bash
printf '%s\n' "| 4 | \`Status: PASS\` không kèm Evidence | \`verify-v1\` | \`verify-v1\` FAIL: mục \"CI baseline (SP1)\": Status PASS thiếu dòng Evidence |" >> "$EVID/red-checks.md"
```

- [ ] **Step 6: Red-check 5 — cho `FakePublisher` ném lỗi**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
sed -i 's/if(this.fail)throw this.fail;/throw new Error("RED_CHECK_PUBLISH_FAILED");/' apps/worker/src/testing/fake-publisher.ts
git diff --stat
pnpm verify > "$EVID/rc5.log" 2>&1; echo "exit=$?"
grep -oE '^(✖ v1 acceptance harness|✖ http api smoke journey|ℹ pass [0-9]+|ℹ fail [0-9]+)' "$EVID/rc5.log" | LC_ALL=C sort -u
grep -c '^verify-v1: ' "$EVID/rc5.log"
git checkout -- apps/worker/src/testing/fake-publisher.ts; git status --porcelain | wc -l
```

Expected:

```
 apps/worker/src/testing/fake-publisher.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
exit=1
ℹ fail 2
ℹ pass 40
✖ http api smoke journey
✖ v1 acceptance harness
0
0
```

Đúng hai test dùng `FakePublisher` fail (đã đo); chuỗi dừng ở `pnpm test`, không tới build/E2E/`verify-v1` (`0` dòng `verify-v1:`).

```bash
printf '%s\n' "| 5 | \`FakePublisher\` ném lỗi | \`pnpm test\` (harness và HTTP smoke) | \`pnpm test\`: \`ℹ fail 2\` (\`v1 acceptance harness\`, \`http api smoke journey\`), \`ℹ pass 40\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 7: Red-check 6 — thêm `TODO` vào một file `.tsx`**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
printf '%s\n' '// TODO: red-check 6' >> apps/web/src/app/layout.tsx
pnpm verify > "$EVID/rc6.log" 2>&1; echo "exit=$?"
grep -A1 '^lint: ' "$EVID/rc6.log"
git checkout -- apps/web/src/app/layout.tsx; git status --porcelain | wc -l
```

Expected (`layout.tsx` có 10 dòng, nên dòng thêm vào là dòng 11; đã đo):

```
exit=1
lint: 1 problem(s)
  apps/web/src/app/layout.tsx:11 rule 1 (placeholder): TODO
0
```

```bash
printf '%s\n' "| 6 | \`TODO\` trong \`apps/web/src/app/layout.tsx\` | \`pnpm lint\` | \`pnpm lint\` FAIL: \`apps/web/src/app/layout.tsx:11 rule 1 (placeholder): TODO\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 8: Red-check 7 — `expectFailure` cộng `FakePublisher` ném lỗi**

Spec ghi "gắn `{ expectFailure: true }` vào test harness". Vì HTTP smoke cũng đăng bài qua `FakePublisher`, chỉ gắn cho harness thì `pnpm test` vẫn đỏ ở HTTP smoke (đã đo: `ℹ fail 1`), không chứng minh được điều spec muốn. Vì vậy gắn cho cả hai test:

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
sed -i "s/^test('v1 acceptance harness', async () => {/test('v1 acceptance harness', {expectFailure: true}, async () => {/" tests/acceptance/v1-acceptance-harness.test.ts
sed -i "s/^test('http api smoke journey', async (t) => {/test('http api smoke journey', {expectFailure: true}, async (t) => {/" tests/integration/http-api-smoke.test.ts
sed -i 's/if(this.fail)throw this.fail;/throw new Error("RED_CHECK_PUBLISH_FAILED");/' apps/worker/src/testing/fake-publisher.ts
git diff --stat | tail -n 1
pnpm verify > "$EVID/rc7.log" 2>&1; echo "exit=$?"
grep -A2 '^lint: ' "$EVID/rc7.log"
pnpm test > "$EVID/rc7-test.log" 2>&1; echo "test-exit=$?"
grep -E '# EXPECTED FAILURE$' "$EVID/rc7-test.log" | sed -E 's/ \([0-9.]+m?s\)//' | LC_ALL=C sort
grep -E '^ℹ (pass|fail) ' "$EVID/rc7-test.log"
grep -E '<!-- (pass|fail) ' test-results/node-tests.xml | tr -d '\t'
git checkout -- tests/acceptance/v1-acceptance-harness.test.ts tests/integration/http-api-smoke.test.ts apps/worker/src/testing/fake-publisher.ts; git status --porcelain | wc -l
```

Expected:

```
 3 files changed, 3 insertions(+), 3 deletions(-)
exit=1
lint: 2 problem(s)
  tests/acceptance/v1-acceptance-harness.test.ts:5 rule 2 (test marker): expectFailure
  tests/integration/http-api-smoke.test.ts:32 rule 2 (test marker): expectFailure
test-exit=0
✔ http api smoke journey # EXPECTED FAILURE
✔ v1 acceptance harness # EXPECTED FAILURE
ℹ pass 42
ℹ fail 0
<!-- pass 42 -->
<!-- fail 0 -->
```

rồi `0`. Bỏ qua lint, `pnpm test` xanh và JUnit ghi 42 pass dù publish hỏng thật: `verify-v1` không thể phân biệt, nên luật 2 là cần thiết (đã đo trên Node 24.21).

```bash
printf '%s\n' "| 7 | \`{expectFailure: true}\` trên harness **và** HTTP smoke, \`FakePublisher\` ném lỗi | \`pnpm lint\` (luật 2) | \`pnpm lint\` FAIL (2 dòng \`expectFailure\`); bỏ qua lint: \`pnpm test\` exit 0, JUnit \`pass 42\`, \`fail 0\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 9: Red-check 8 — đổi E2E thành `test.fail(...)`**

Phần (a) chỉ đổi khai báo test. Phần (b) bỏ qua lint và cho hành trình hỏng thật bằng một `beforeEach` ném lỗi: nếu hành trình vẫn pass, Playwright tự exit 1 ("expected to fail, but passed"); nếu hỏng do timeout (như red-check 3), kết quả là `timedOut` ≠ `failed` và Playwright cũng exit 1 (cả hai đã đo với 1.56.1), nên `verify-v1` không được chạy tới.

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
perl -0pi -e "s/\btest\(\s*'v1 critical UI journey'/test.fail('v1 critical UI journey'/" apps/web/tests/v1-critical-journey.spec.ts
grep -n "test.fail('v1 critical UI journey'" apps/web/tests/v1-critical-journey.spec.ts
pnpm verify > "$EVID/rc8.log" 2>&1; echo "exit=$?"
grep -A1 '^lint: ' "$EVID/rc8.log"
printf '%s\n' "test.beforeEach(() => { throw new Error('red-check 8: hành trình hỏng thật'); });" >> apps/web/tests/v1-critical-journey.spec.ts
(pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs) > "$EVID/rc8-nolint.log" 2>&1; echo "nolint-exit=$?"
grep -E '✘|^  [0-9]+ (passed|failed)|^verify-v1: |^  - [^ ]' "$EVID/rc8-nolint.log"
git checkout -- apps/web/tests/v1-critical-journey.spec.ts; git status --porcelain | wc -l
```

Expected:

```
23:test.fail('v1 critical UI journey', async ({page, context}) => {
exit=1
lint: 1 problem(s)
  apps/web/tests/v1-critical-journey.spec.ts:23 rule 2 (test marker): test.fail
nolint-exit=1
  ✘  1 tests/v1-critical-journey.spec.ts:26:6 › v1 critical UI journey (…ms)
  1 passed (…s)
verify-v1: FAIL (2 problem(s))
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].expectedStatus = 'failed' (cần 'passed')
  - test-results/e2e.json: spec "v1 critical UI journey": tests[0].results[cuối].status = 'failed' (cần 'passed')
0
```

Playwright báo `1 passed` và exit 0 cho một test hỏng thật được đánh dấu `test.fail` (`ok: true` trong JSON); `verify-v1` bắt bằng `expectedStatus` (đã đo với đúng nội dung spec Task 9 trên Playwright 1.56.1). Lint không bắt `test.beforeEach` (không thuộc danh sách luật 2). Dấu `✘` màu xanh là kết quả `failed` đúng như mong đợi của `test.fail`. Vị trí `:26:6` (không phải `:23:6`): Playwright lệch 3 dòng như ở Task 9 Step 3; đã kiểm khi lắp plan bằng `playwright test --list` với config thật của `apps/web` trên đúng nội dung file của red-check này (`zz-asm-probe.spec.ts:26:6 › v1 critical UI journey`, file probe đã xóa).

```bash
printf '%s\n' "| 8 | Đổi E2E thành \`test.fail(...)\` (bỏ qua lint: hành trình hỏng thật qua \`beforeEach\` ném lỗi) | \`pnpm lint\`; bỏ qua lint thì \`verify-v1\` (expectedStatus) | \`pnpm lint\` FAIL (\`test.fail\`, dòng 23); bỏ qua lint: Playwright \`1 passed\`, exit 0; \`verify-v1\` FAIL \`tests[0].expectedStatus = 'failed'\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 10: Red-check 9 — xóa một file trong `tests/web`**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
rm tests/web/navigation.test.ts
pnpm verify > "$EVID/rc9.log" 2>&1; echo "exit=$?"
grep -E '^ℹ (pass|fail) |^  [0-9]+ (passed|failed)|^verify-v1: |^  - [^ ]' "$EVID/rc9.log"
git checkout -- tests/web/navigation.test.ts; git status --porcelain | wc -l
```

Expected (`navigation.test.ts` có 2 test):

```
exit=1
ℹ pass 40
ℹ fail 0
  1 passed (…s)
verify-v1: FAIL (1 problem(s))
  - test-results/node-tests.xml: pass = 40 < MIN_NODE_TESTS = 42
0
```

```bash
printf '%s\n' "| 9 | Xóa \`tests/web/navigation.test.ts\` | \`verify-v1\` (pass < \`MIN_NODE_TESTS\`) | \`verify-v1\` FAIL: \`pass = 40 < MIN_NODE_TESTS = 42\` |" >> "$EVID/red-checks.md"
```

- [ ] **Step 11: Red-check 10 — bỏ `next-env.d.ts` khỏi `.gitignore`**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
sed -i '/^next-env\.d\.ts$/d' .gitignore
rm -f apps/web/next-env.d.ts
pnpm build > "$EVID/rc10-build.log" 2>&1; echo "build-exit=$?"
test -f apps/web/next-env.d.ts && echo BUILD_GENERATED_NEXT_ENV
git status --porcelain
test -z "$(git status --porcelain)"; echo "clean-tree-exit=$?"
git checkout -- .gitignore; git status --porcelain | wc -l
```

Expected:

```
build-exit=0
BUILD_GENERATED_NEXT_ENV
 M .gitignore
?? apps/web/next-env.d.ts
clean-tree-exit=1
0
```

Hai lệnh `git status --porcelain` / `test -z` là đúng bước "Clean tree" của `ci.yml`. `apps/web/next-env.d.ts` đã có sẵn từ các lần build ở Task 4, 9, 11; nếu không xóa trước thì `?? apps/web/next-env.d.ts` hiện ra ngay khi bỏ dòng khỏi `.gitignore`, chưa cần build (đã đo khi dry-run), nên red-check không chứng minh được gì về build. Vì vậy lệnh `rm -f` xóa file trước khi build, và `BUILD_GENERATED_NEXT_ENV` xác nhận chính `next build` sinh lại nó. Dòng quyết định là `?? apps/web/next-env.d.ts`: `next build` sinh file này và nó lọt khỏi `.gitignore`. Build đã sinh lại file, nên các task sau không bị ảnh hưởng.

```bash
printf '%s\n' "| 10 | Bỏ \`next-env.d.ts\` khỏi \`.gitignore\`, xóa \`apps/web/next-env.d.ts\`, build, chạy bước Clean tree | \`test -z \"\$(git status --porcelain)\"\` | \`?? apps/web/next-env.d.ts\`, \`test -z\` exit 1 |" >> "$EVID/red-checks.md"
```

- [ ] **Step 12: Xác nhận không có gì bị commit hay sót lại**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
git log -1 --format='%s'
git status --porcelain | wc -l
grep -c '^| [0-9]' "$EVID/red-checks.md"
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
```

Expected:

```
ci: run the full verify gate in GitHub Actions and drop test:integration
0
10
PORT 3000 FREE
PORT 4000 FREE
```

HEAD vẫn là commit Task 11, cây sạch, đủ 10 dòng kết quả, Playwright đã tắt mọi server.

### Task 13: Ghi bằng chứng `LOCAL` cho commit Task 11

Spec: mục 4.1 (commit 12) và 4.11. Bằng chứng được tạo trên **clone sạch** của commit Task 11, rồi ghi vào tài liệu ở một commit sau (một commit không chứa được SHA của chính nó). Nếu sau task này có commit không phải tài liệu (sửa theo review, merge `main`), làm lại toàn bộ task này cho commit code mới nhất.

**Files:**
- Modify: `docs/verification/v1-acceptance.md` (chỉ dòng `Status:` của mục `CI baseline (SP1)`, thêm một dòng `Evidence:`)

**Interfaces:**
- Consumes: commit Task 11 (HEAD sau Task 12), `verify-v1` (Task 10).
- Produces: `$EVID/local-verify.log` (log đầy đủ của `pnpm verify` trên clone sạch) và dòng Evidence dạng `Evidence: local pnpm verify @ <sha 40 ký tự> (<YYYY-MM-DD>, <máy>, node v24.x.y)`; Task 14 dán cả hai vào mô tả PR.

- [ ] **Step 1: Chạy `pnpm verify` trên clone sạch của commit Task 11**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"; mkdir -p "$EVID"
CODE_SHA="$(git rev-parse HEAD)"; git log -1 --format='%s'
for p in 3000 4000; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "PORT $p BUSY" || echo "PORT $p FREE"; done
rm -rf "$EVID/clean"; git clone -q . "$EVID/clean"
test "$(git -C "$EVID/clean" rev-parse HEAD)" = "$CODE_SHA" && echo SAME_COMMIT
(cd "$EVID/clean" && node -v && pnpm install --frozen-lockfile && pnpm verify) > "$EVID/local-verify.log" 2>&1; echo "exit=$?"
tail -n 1 "$EVID/local-verify.log"
git -C "$EVID/clean" status --porcelain | wc -l
```

Expected:

```
ci: run the full verify gate in GitHub Actions and drop test:integration
PORT 3000 FREE
PORT 4000 FREE
SAME_COMMIT
exit=0
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <CODE_SHA> (clean) — không phải bằng chứng CI
0
```

Dòng cuối của log phải chứa đúng `<CODE_SHA>` và `(clean)`; nếu là `(dirty)` thì không được ghi bằng chứng. `head -n 1 "$EVID/local-verify.log"` in phiên bản Node dùng cho Evidence.

- [ ] **Step 2: Xác nhận `verify-v1` từ chối `LOCAL` thiếu Evidence (RED)**

Lấy báo cáo của clone sạch về cây làm việc (`test-results/` đã được ignore), rồi đổi trạng thái mà chưa thêm Evidence:

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
mkdir -p test-results && cp "$EVID/clean/test-results/node-tests.xml" "$EVID/clean/test-results/e2e.json" test-results/
sed -i '/^## CI baseline (SP1)$/,/^## /s/^Status: .*/Status: LOCAL — `pnpm verify` passed on a clean clone; no `CI \/ verify` run has passed yet./' docs/verification/v1-acceptance.md
node scripts/verify-v1.mjs; echo "exit=$?"
git checkout -- docs/verification/v1-acceptance.md
```

Expected:

```
verify-v1: FAIL (1 problem(s))
  - docs/verification/v1-acceptance.md: mục "CI baseline (SP1)": Status LOCAL thiếu dòng "Evidence: local pnpm verify @ <sha 40 ký tự> (<YYYY-MM-DD>, <máy>, node v24.x.y)"
exit=1
```

- [ ] **Step 3: Ghi `Status: LOCAL` kèm Evidence**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
CODE_SHA="$(git rev-parse HEAD)"
NODE_V="$(head -n 1 "$EVID/local-verify.log")"
EVIDENCE="Evidence: local pnpm verify @ ${CODE_SHA} ($(date -u +%F), $(hostname), node ${NODE_V})"
echo "$EVIDENCE"
EVIDENCE="$EVIDENCE" node -e '
const fs = require("node:fs");
const file = "docs/verification/v1-acceptance.md";
const before = "Status: NOT_VERIFIED — no `pnpm verify` evidence has been recorded for the SP1 gate yet.";
const after = "Status: LOCAL — `pnpm verify` passed on a clean clone; no `CI / verify` run has passed yet.\n\n" + process.env.EVIDENCE;
const text = fs.readFileSync(file, "utf8");
if (text.split(before).length !== 2) { console.error("không tìm thấy đúng một dòng Status NOT_VERIFIED của mục CI baseline (SP1)"); process.exit(1); }
fs.writeFileSync(file, text.replace(before, after));
'
git diff
```

Expected:

```
Evidence: local pnpm verify @ <CODE_SHA> (<YYYY-MM-DD>, <hostname>, node v24.21.0)
diff --git a/docs/verification/v1-acceptance.md b/docs/verification/v1-acceptance.md
--- a/docs/verification/v1-acceptance.md
+++ b/docs/verification/v1-acceptance.md
@@ -50,7 +50,9 @@ Scope limits:
 
 ## CI baseline (SP1)
 
-Status: NOT_VERIFIED — no `pnpm verify` evidence has been recorded for the SP1 gate yet.
+Status: LOCAL — `pnpm verify` passed on a clean clone; no `CI / verify` run has passed yet.
+
+Evidence: local pnpm verify @ <CODE_SHA> (<YYYY-MM-DD>, <hostname>, node v24.21.0)
 
 How this section changes:
 
```

(Thêm một dòng `index …` sau dòng `diff --git`.) `hostname` không được chứa dấu phẩy hay dấu ngoặc (regex Evidence của spec). Trong môi trường cloud đã đo: `vm`.

- [ ] **Step 4: Kiểm tài liệu (GREEN), commit, kiểm lại**

```bash
node scripts/verify-v1.mjs; echo "exit=$?"
git add docs/verification/v1-acceptance.md
git commit -m "docs: record local SP1 verification evidence" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
node scripts/verify-v1.mjs; echo "exit=$?"
git show --stat --format='%s' HEAD | tail -n 2
git status --porcelain | wc -l
```

Expected:

```
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <CODE_SHA> (dirty) — không phải bằng chứng CI
exit=0
[claude/dreamy-shannon-416aba <sha>] docs: record local SP1 verification evidence
 1 file changed, 3 insertions(+), 1 deletion(-)
verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha commit vừa tạo> (clean) — không phải bằng chứng CI
exit=0
 docs/verification/v1-acceptance.md | 4 +++-
 1 file changed, 3 insertions(+), 1 deletion(-)
0
```

Commit này chỉ đổi tài liệu, nên Evidence (trỏ commit Task 11) vẫn đúng cho toàn bộ code của nhánh. Giữ `$EVID/local-verify.log` cho Task 14; xóa clone: `rm -rf "${TMPDIR:-/tmp}/sp1-evidence/clean"`.

### Task 14: Push và mở PR SP1 vào `ui-vietnamese-recovery`

Spec: mục 4.1 (PR SP1, cổng merge) và mục 9. Repo: `luongdo03x-byte/DSM`. PR #1 là `ui-vietnamese-recovery` → `main`; PR này xếp chồng lên nó.

**Files:** không có (chỉ push và tạo PR).

**Interfaces:**
- Consumes: `$EVID/red-checks.md` (Task 12), `$EVID/local-verify.log` và dòng Evidence trong `docs/verification/v1-acceptance.md` (Task 13).
- Produces: PR `claude/dreamy-shannon-416aba` → `ui-vietnamese-recovery`, chờ chủ repo review và merge bằng **merge commit**.

- [ ] **Step 1: Kiểm tra trước khi push**

```bash
git status --porcelain | wc -l
git fetch origin
git log --format='%s' --first-parent --reverse origin/ui-vietnamese-recovery..HEAD
git merge-base --is-ancestor origin/claude/dreamy-shannon-416aba HEAD; echo "FAST_FORWARD=$?"
git diff --name-status origin/ui-vietnamese-recovery HEAD | grep -v 'docs/superpowers/'
```

Expected:

```
0
docs: add DSM social growth platform roadmap design
docs: add image and album posting to DSM roadmap spec
docs: record roadmap approval and keep Threads/Browser Gateway as-is
docs: add SP1 CI and verification gate design spec
docs: revise SP1 spec after adversarial review against PR #1 code
<subject của commit thêm plan này, đúng như dòng cuối Task 0 Step 2 đã in>
Merge branch 'ui-vietnamese-recovery' into claude/dreamy-shannon-416aba
chore(lint): scan tsx and tests, skip dot dirs, forbid test markers
build: pin Node >=24.7 <25, engineStrict, Playwright 1.56.1 and commit pnpm lockfile
build(typecheck): check Node apps and tests without type shims
build(web): commit strict web tsconfig and run real next build
build(typecheck): typecheck tests/web against the web tsconfig
test: harden node test runner with Node 24.7 gate, JUnit report and timeout
test: run v1 acceptance harness as a regression test
test: add HTTP API smoke journey against the real API server
test(e2e): run the Playwright UI journey against the real API and production build
test(verify): check JUnit, Playwright JSON and acceptance evidence in verify-v1
ci: run the full verify gate in GitHub Actions and drop test:integration
docs: record local SP1 verification evidence
FAST_FORWARD=0
M	.github/workflows/ci.yml
M	.gitignore
A	.node-version
M	apps/api/src/modules/accounts/credential-crypto.service.ts
M	apps/web/package.json
M	apps/web/playwright.config.ts
M	apps/web/src/features/browser-nodes/node-card.tsx
M	apps/web/src/features/overview/overview-model.ts
A	apps/web/tests/e2e-owner.ts
M	apps/web/tests/v1-critical-journey.spec.ts
A	apps/web/tsconfig.json
M	docs/runbooks/local-development.md
M	docs/verification/v1-acceptance.md
M	package.json
A	pnpm-lock.yaml
M	pnpm-workspace.yaml
D	scripts/build.mjs
M	scripts/lint.mjs
M	scripts/run-tests.mjs
M	scripts/verify-v1.mjs
A	tests/acceptance/v1-acceptance-harness.test.ts
A	tests/integration/http-api-smoke.test.ts
A	tests/web/tsconfig.json
M	tsconfig.json
D	types/node-shim.d.ts
D	types/web-shim.d.ts
```

`FAST_FORWARD=0`: nhánh trên GitHub là tổ tiên của HEAD, push không cần force. Nếu là `1` (có người đẩy thêm lên nhánh): dừng, merge nhánh đó bằng lệnh dưới đây (không rebase), chạy lại Task 13 nếu có thay đổi code, rồi làm lại Step 1; không bao giờ force-push.

```bash
git merge --no-edit origin/claude/dreamy-shannon-416aba -m "Merge remote-tracking branch 'origin/claude/dreamy-shannon-416aba' into claude/dreamy-shannon-416aba" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

Danh sách cuối (ngoài `docs/superpowers/`) là phạm vi file của SP1: đúng 26 đường dẫn của bảng spec mục 10, không thêm, không thiếu. Trong `apps/` và `packages/` chỉ có 3 file production sửa kiểu (`credential-crypto.service.ts`, `node-card.tsx`, `overview-model.ts`), cộng `apps/web/package.json`, `apps/web/tsconfig.json`, cấu hình và test Playwright; `apps/api/src/main.ts` không có mặt (spec mục 6, tiêu chí 9). Danh sách này đo khi lắp plan, trên cây ghép từ các commit thử của Task 1–9 cộng các khối của Task 10–11; Task 13 chỉ sửa lại `docs/verification/v1-acceptance.md` đã có trong danh sách.

- [ ] **Step 2: Push**

```bash
git push -u origin claude/dreamy-shannon-416aba
```

Expected: dòng `   c6d6748..<sha>  claude/dreamy-shannon-416aba -> claude/dreamy-shannon-416aba` (hoặc SHA cũ khác nếu plan được commit sau c6d6748), không có `forced update`. Nếu push lỗi mạng, thử lại tối đa 4 lần, chờ 2s, 4s, 8s, 16s.

- [ ] **Step 3: Soạn mô tả PR từ kết quả đã đo**

````bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
EVIDENCE_LINE="$(grep -E '^Evidence: local pnpm verify @ [0-9a-f]{40} ' docs/verification/v1-acceptance.md)"
CODE_SHA="$(echo "$EVIDENCE_LINE" | awk '{print $6}')"
{
  cat <<'EOF'
## Tóm tắt

SP1: khôi phục CI và cổng nghiệm thu (spec `docs/superpowers/specs/2026-10-13-dsm-sp1-ci-verification-gate-design.md`, plan trong `docs/superpowers/plans/`). PR này xếp chồng lên PR #1: base là `ui-vietnamese-recovery`, nhánh đã merge `ui-vietnamese-recovery` @ 4f1ea10 bằng merge commit.

Cổng mới chạy từ checkout sạch: `pnpm install --frozen-lockfile && pnpm verify` = `pnpm lint` → `pnpm typecheck` (3 chương trình) → `pnpm test` (42 test Node, JUnit) → `pnpm build` (`next build` thật) → `pnpm test:e2e` (Playwright với API thật và `next start`) → `node scripts/verify-v1.mjs` (kiểm báo cáo test và tài liệu nghiệm thu). Workflow `CI / verify` chạy đúng chuỗi này, cộng bước "Clean tree".

Code production chỉ đổi 3 chỗ thuần về kiểu (`credential-crypto.service.ts`, `node-card.tsx`, `overview-model.ts`); `apps/api/src/main.ts` không đổi.

## Commit

EOF
  git log --format='- `%h` %s' --first-parent --reverse origin/ui-vietnamese-recovery..HEAD
  cat <<'EOF'

## Bằng chứng LOCAL

GitHub Actions của repo chưa được cấp runner (mọi run từ 02/10 fail sau 2–3 giây, `runner_id: 0`), nên PR này dùng bằng chứng `LOCAL` theo cổng merge ở spec mục 4.1.

EOF
  echo "- Commit code được kiểm: \`$CODE_SHA\`"
  echo "- Lệnh: \`pnpm install --frozen-lockfile && pnpm verify\` trên clone sạch, pnpm 10.17.1"
  echo "- Dòng cuối: \`$(tail -n 1 "$EVID/local-verify.log")\`"
  echo "- \`docs/verification/v1-acceptance.md\`, mục \`CI baseline (SP1)\`: \`Status: LOCAL\`, \`$EVIDENCE_LINE\`"
  echo
  echo '<details><summary>Log <code>pnpm verify</code> (40 dòng cuối)</summary>'
  echo
  echo '```text'
  tail -n 40 "$EVID/local-verify.log"
  echo '```'
  echo
  echo '</details>'
  cat <<'EOF'

## Red-check (spec mục 5; chạy tại chỗ trên commit Task 11, không commit)

EOF
  cat "$EVID/red-checks.md"
  cat <<'EOF'

Lệch so với bảng spec (đã đo): red-check 1 bị `pnpm lint` (luật 2) chặn sớm hơn, phần `verify-v1` được chứng minh bằng chuỗi bỏ qua lint; red-check 7 gắn `expectFailure` cho cả harness lẫn HTTP smoke vì cả hai dùng `FakePublisher`; red-check 8 cần hành trình hỏng thật (không phải timeout) để Playwright exit 0 và `verify-v1` được chạy tới.

## Merge

- Merge bằng **merge commit** (không squash, không rebase) để SHA trong bằng chứng còn trong lịch sử.
- Cổng merge (spec mục 4.1): `CI / verify` xanh trên PR này; hoặc, khi Actions còn bị chặn, bằng chứng LOCAL và kết quả red-check ở trên.
- Sau PR này, PR #1 (`ui-vietnamese-recovery` → `main`) merge theo cùng quy tắc. SP1 chỉ **đóng** khi có run `CI / verify` xanh trên `main`, mục `CI baseline (SP1)` chuyển sang `PASS` với URL run và SHA, và tag `gd0-sp1-ci-green` trỏ vào SHA đó.

## Việc của chủ repo (spec mục 9)

1. Mở một run CI đã fail để đọc annotation, sửa ở Settings → Actions (cho phép Actions) và Settings → Billing and plans; chạy lại một run để xác nhận job được cấp runner.
2. Review và merge PR này vào `ui-vietnamese-recovery`; sau đó merge PR #1 vào `main`. Cả hai bằng merge commit (tắt squash/rebase cho hai PR này).
3. Không merge gì khác vào `main` cho tới khi PR #1 vào.
4. Sau run xanh trên `main`: review/merge PR đóng SP1, rồi `git tag -a gd0-sp1-ci-green <SHA> -m "<URL run>"` và đẩy tag.
5. (Tùy chọn) Bật branch protection trên `main`, bắt buộc check `CI / verify`.

## Giới hạn đã biết

- Harness và HTTP smoke đăng bài qua `FakePublisher`; E2E chỉ đăng nhập, điều hướng, tải lại, đăng xuất trên bản build production, không đăng bài. Wiring publisher Meta/TikTok thật chưa có test.
- Cảnh báo pnpm "Ignored build scripts" (prisma, msgpackr-extract) giữ nguyên; SP2 xử lý.
- Các action vẫn ở major `@v4`; chỉ nâng nếu annotation báo lỗi khi runner được cấp.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx
EOF
} > "$EVID/pr-body.md"
grep -c '^| [0-9]' "$EVID/pr-body.md"
grep -c "$CODE_SHA" "$EVID/pr-body.md"
````

Expected: `10` (đủ 10 red-check), rồi một số ≥ 2 (SHA xuất hiện ở dòng commit được kiểm, dòng cuối của log và dòng Evidence). Đọc lại `$EVID/pr-body.md` một lượt trước khi tạo PR. Mô tả kết thúc bằng dòng attribution của phiên (Global Constraints).

- [ ] **Step 4: Tạo PR**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"
gh pr create --repo luongdo03x-byte/DSM --base ui-vietnamese-recovery --head claude/dreamy-shannon-416aba \
  --title "SP1: khôi phục CI và cổng nghiệm thu (xếp chồng lên PR #1)" \
  --body-file "$EVID/pr-body.md"
gh pr view claude/dreamy-shannon-416aba --repo luongdo03x-byte/DSM --json number,url,baseRefName,headRefName,state --jq '"\(.number) \(.baseRefName) <- \(.headRefName) \(.state) \(.url)"'
```

Expected: URL của PR mới, rồi `<số> ui-vietnamese-recovery <- claude/dreamy-shannon-416aba OPEN https://github.com/luongdo03x-byte/DSM/pull/<số>`.

Nếu không có `gh`: dùng công cụ GitHub của phiên (`create_pull_request`) với owner `luongdo03x-byte`, repo `DSM`, base `ui-vietnamese-recovery`, head `claude/dreamy-shannon-416aba`, cùng title và nội dung `$EVID/pr-body.md`.

- [ ] **Step 5: Theo dõi check, không tự merge**

```bash
gh pr checks claude/dreamy-shannon-416aba --repo luongdo03x-byte/DSM; echo "exit=$?"
```

- Nếu `CI / verify` chạy và xanh: ghi URL run vào một comment của PR; vẫn để chủ repo merge.
- Nếu run fail sau vài giây và không có log (job không được cấp runner): đó là lỗi tài khoản/repo ở spec mục 2, không phải lỗi code; cổng merge dùng bằng chứng LOCAL và red-check trong mô tả.
- Nếu run fail ở một bước thật (lint, test, E2E…): sửa trên nhánh bằng commit mới, chạy lại Task 13 cho commit code mới nhất (Evidence mới), cập nhật mô tả PR (Step 3 và lệnh `gh pr edit claude/dreamy-shannon-416aba --repo luongdo03x-byte/DSM --body-file "$EVID/pr-body.md"`), push lại.
- Không merge PR này, không đổi base, không squash/rebase.

## Sau khi merge (bước đóng SP1)

Spec: mục 4.1 (bước đóng), mục 6 (điều kiện đóng SP1), mục 9. Các bước này chạy **sau** khi chủ repo đã merge PR SP1 vào `ui-vietnamese-recovery` và PR #1 vào `main` (cả hai bằng merge commit) và Actions đã được cấp runner. Trước đó SP1 ở trạng thái `LOCAL`, không phải PASS.

- [ ] **Step 1: Tìm run `CI / verify` xanh trên `main`**

```bash
MERGE_SHA="$(gh pr view 1 --repo luongdo03x-byte/DSM --json mergeCommit --jq .mergeCommit.oid)"; echo "$MERGE_SHA"
gh run list --repo luongdo03x-byte/DSM --workflow ci.yml --branch main --event push --limit 20 --json databaseId,headSha,conclusion,url --jq '.[] | "\(.conclusion) \(.headSha) \(.url)"'
```

Chọn run có `conclusion` là `success` và `headSha` bằng `MERGE_SHA` (merge commit của PR #1 trên `main`). Được phép chạy lại run (`gh run rerun <id> --repo luongdo03x-byte/DSM`). Nếu run fail vì lỗi thật cần sửa: sửa trên một nhánh mới, PR vào `main` bằng merge commit, và dùng SHA đầu tiên của `main` chứa bản sửa có run xanh. Ghi lại:

```bash
RUN_URL="https://github.com/luongdo03x-byte/DSM/actions/runs/<id run xanh>"
MAIN_SHA="<headSha 40 ký tự của run đó>"
```

- [ ] **Step 2: Merge `main` vào nhánh SP1**

```bash
git checkout claude/dreamy-shannon-416aba
git fetch origin main
git merge --no-edit origin/main -m "Merge remote-tracking branch 'origin/main' into claude/dreamy-shannon-416aba" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git merge-base --is-ancestor "$MAIN_SHA" HEAD; echo "MAIN_SHA_IN_BRANCH=$?"
pnpm install --frozen-lockfile
```

Expected: merge không xung đột (nhánh SP1 đã nằm trọn trong `main`, nên thường là fast-forward và hai `-m` bị bỏ qua; nếu git tạo merge commit thì message có hai dòng trailer), `MAIN_SHA_IN_BRANCH=0`, install `Done`. Không rebase.

- [ ] **Step 3: Chuyển `CI baseline (SP1)` sang `PASS` với URL run và SHA**

```bash
RUN_URL="$RUN_URL" MAIN_SHA="$MAIN_SHA" node -e '
const fs = require("node:fs");
const file = "docs/verification/v1-acceptance.md";
const text = fs.readFileSync(file, "utf8");
const start = text.indexOf("## CI baseline (SP1)\n");
const end = text.indexOf("\n## ", start + 1);
if (start < 0 || end < 0) { console.error("không tìm thấy mục CI baseline (SP1)"); process.exit(1); }
const section = text.slice(start, end);
if (!/^Status: LOCAL/m.test(section) || !/^Evidence: /m.test(section)) { console.error("mục CI baseline (SP1) chưa ở trạng thái LOCAL có Evidence"); process.exit(1); }
const updated = section
  .replace(/^Status: .*$/m, "Status: PASS — `CI / verify` succeeded on `main`; the annotated tag `gd0-sp1-ci-green` points at the same SHA.")
  .replace(/^Evidence: .*$/m, `Evidence: ${process.env.RUN_URL} @ ${process.env.MAIN_SHA}`);
fs.writeFileSync(file, text.slice(0, start) + updated + text.slice(end));
'
git diff -U0 docs/verification/v1-acceptance.md | grep '^[-+][SE]'
```

Expected:

```
-Status: LOCAL — `pnpm verify` passed on a clean clone; no `CI / verify` run has passed yet.
+Status: PASS — `CI / verify` succeeded on `main`; the annotated tag `gd0-sp1-ci-green` points at the same SHA.
-Evidence: local pnpm verify @ <CODE_SHA> (<YYYY-MM-DD>, <hostname>, node v24.21.0)
+Evidence: https://github.com/luongdo03x-byte/DSM/actions/runs/<id> @ <MAIN_SHA>
```

- [ ] **Step 4: Kiểm bằng cổng đầy đủ, commit, mở PR đóng vào `main`**

```bash
EVID="${TMPDIR:-/tmp}/sp1-evidence"; mkdir -p "$EVID"
pnpm verify > "$EVID/close-verify.log" 2>&1; echo "exit=$?"
tail -n 1 "$EVID/close-verify.log"
git add docs/verification/v1-acceptance.md
git commit -m "docs: record CI evidence for the SP1 gate" \
  --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  --trailer "Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
git push origin claude/dreamy-shannon-416aba
gh pr create --repo luongdo03x-byte/DSM --base main --head claude/dreamy-shannon-416aba \
  --title "SP1: ghi bằng chứng CI xanh và đóng SP1" \
  --body "Chuyển mục \`CI baseline (SP1)\` của \`docs/verification/v1-acceptance.md\` sang \`Status: PASS\` với run $RUN_URL @ \`$MAIN_SHA\` (spec SP1 mục 4.1, bước đóng). Merge bằng merge commit. Sau khi merge, chủ repo tạo tag: \`git tag -a gd0-sp1-ci-green $MAIN_SHA -m \"$RUN_URL\"\` rồi \`git push origin gd0-sp1-ci-green\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx"
```

Expected: `exit=0`; dòng cuối `verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha> (dirty) — không phải bằng chứng CI` (dirty vì tài liệu chưa commit; `verify-v1` chấp nhận PASS có Evidence đúng dạng); commit và push thành công; URL PR mới. PR này cũng phải merge bằng merge commit.

- [ ] **Step 5: Tag (chủ repo) và kiểm tra điều kiện đóng**

Chủ repo, sau khi PR đóng được merge:

```bash
git fetch origin
git tag -a gd0-sp1-ci-green "$MAIN_SHA" -m "$RUN_URL"
git push origin gd0-sp1-ci-green
```

Kiểm tra (ai cũng chạy được):

```bash
git fetch origin --tags
git cat-file -p gd0-sp1-ci-green | sed -n '1p;6p'
git show origin/main:docs/verification/v1-acceptance.md | grep -A2 '^Status: PASS — `CI / verify`'
```

Expected:

```
object <MAIN_SHA>
https://github.com/luongdo03x-byte/DSM/actions/runs/<id>
Status: PASS — `CI / verify` succeeded on `main`; the annotated tag `gd0-sp1-ci-green` points at the same SHA.

Evidence: https://github.com/luongdo03x-byte/DSM/actions/runs/<id> @ <MAIN_SHA>
```

SP1 đóng khi cả ba điều kiện của spec mục 6 đúng: run `CI / verify` xanh trên `MAIN_SHA`, mục `CI baseline (SP1)` ở `PASS` với đúng URL run và SHA đó, tag `gd0-sp1-ci-green` trỏ vào SHA đó. (Tùy chọn, chủ repo: bật branch protection trên `main`, bắt buộc check `CI / verify`.)

## Self-review

### Độ phủ spec

| Mục spec | Nội dung | Task thực hiện | Bằng chứng trong plan |
|---|---|---|---|
| 4.1 | Nhánh thực thi, merge PR #1 bằng merge commit, thứ tự 12 commit, cổng merge, bất biến, bước đóng | Task 0; Task 1–11 (commit 1–11); Task 13 (commit 12); Task 14; "Sau khi merge" | Task 0 Step 4 (`PR1_IN_BRANCH=0`, cha thứ hai 4f1ea10); clone sạch sau commit 5 và 9 (Task 5 Step 6, Task 9 Step 12); Task 14 Step 1 (danh sách commit, `FAST_FORWARD=0`) |
| 4.2 | Lockfile, Playwright 1.56.1, `engineStrict`, `engines` `>=24.7 <25`, `.node-version`, `.gitignore`; pnpm chỉ ghim ở `packageManager`; giữ cảnh báo "Ignored build scripts" | Task 2 (bỏ `with: version` ở Task 11) | Task 2 Step 3 (mã băm lockfile, hai bản playwright), Step 6 (Node 22 bị từ chối, `Version 1.56.1`, revision 1194) |
| 4.3 | `.github/workflows/ci.yml`; `browser-smoke.yml` giữ nguyên | Task 11 | Task 11 Step 1 và 5 (`CI_MATCHES_SPEC` so từng dòng với khối YAML của spec, `YAML_OK`, `SCHEMA_OK`) |
| 4.4 | Lint: gốc quét, bỏ `node_modules`/thư mục chấm, `.ts`/`.tsx`/`.mjs`, luật 1, luật 2 | Task 1 | Task 1 Step 2 (RED), Step 4 (ba probe bị bắt), Step 6 (GREEN); Task 12 red-check 1, 6, 7, 8 |
| 4.5a | Root `tsconfig.json`, xóa hai shim, sửa kiểu `credential-crypto` | Task 3 | Task 3 Step 3 (đúng 1 lỗi TS2749), Step 5 (0 lỗi, `--listFilesOnly`) |
| 4.5b | `apps/web/tsconfig.json`, sửa kiểu `node-card` | Task 4 | Task 4 Step 2 (đúng 1 lỗi TS2375, `next build` fail), Step 4 (GREEN, `TSCONFIG_UNCHANGED`) |
| 4.5c | `tests/web/tsconfig.json`, nới kiểu `overview-model`, script `typecheck` ba chương trình | Task 5 | Task 5 Step 2 (đúng 2 lỗi), Step 4 (13 file `tests/web`, 0 lỗi) |
| 4.6 | `build` = `next build` thật, xóa `scripts/build.mjs`, không export `NEXT_PUBLIC_API_BASE_URL` | Task 4 (xóa `test:integration` ở Task 11 theo mục 4.13); Global Constraints | Task 4 Step 4 (14 route, `Running TypeScript`), Task 9 Step 7 |
| 4.7 | Test runner: cổng phiên bản, dọn `test-results/`, `NO_TESTS_FOUND`, reporter `spec` + `junit`, `TIMEOUT` 300 s, không `--test-force-exit` | Task 6 | Task 6 Step 1 (RED), Step 3, Step 4 (timeout thật 300 s) |
| 4.8 | Harness `v1 acceptance harness`, 10 assert | Task 7 | Task 7 Step 3 (hai lần phá `FakePublisher` đều fail), Step 4 |
| 4.9 | HTTP smoke 21 bước, `env` dạng object, guard `fetch`, đóng server, tổng 42 | Task 8 | Task 8 Step 3 (thiếu `FakePublisher` thì fail ở bước 14), Step 4 (42 pass, JUnit) |
| 4.10 | `playwright.config.ts` tự dựng API + `next start`, guard BUILD_ID, `e2e-owner.ts`, spec 7 bước, root `test:e2e` | Task 9 (Task 1 xóa sớm dòng `test.skip`) | Task 9 Step 3, 5 (RED), 7, 8 (GREEN, hợp đồng JSON), 9 (tiêu đề `exact`), 10 (3 lần liên tiếp, env thù địch), 12 (clone sạch) |
| 4.11 | `verify-v1.mjs` viết lại; `v1-acceptance.md` viết lại; trạng thái `CI baseline (SP1)` qua các commit | Task 10; Task 13 (`LOCAL`); "Sau khi merge" (`PASS`) | Task 10 Step 3 (bản tài liệu cũ bị bắt), Step 6, Step 7 (12 kiểm ngược trên báo cáo thật, chế độ CI); Task 13 Step 2 |
| 4.12 | Runbook mục 5 | Task 11 | Task 11 Step 3 (diff chỉ chạm mục 5), Step 5 (`npm run verify` còn `0` lần) |
| 4.13 | Script root dạng cuối, xóa `test:integration` ở commit 11, `dev*` giữ nguyên | Task 4, 5, 9, 10, 11 | Task 11 Step 4 (in toàn bộ khối `scripts`), Step 5 (`ERR_PNPM_NO_SCRIPT`, `grep-exit=1`) |
| 5 | 10 red-check, không commit, kết quả vào mô tả PR | Task 12 (kiểm sớm: Task 1 Step 4, Task 7 Step 3, Task 8 Step 3, Task 9 Step 9, Task 10 Step 7) | Task 12 Step 2–12; bảng `$EVID/red-checks.md` dán vào PR ở Task 14 Step 3 |
| 6.1 | Clone sạch: `pnpm install --frozen-lockfile && pnpm verify` exit 0, dòng cuối `LOCAL @ <sha> (clean)` | Task 13 | Task 13 Step 1 (`SAME_COMMIT`, `(clean)`) |
| 6.2 | Node 22 thất bại ở `pnpm install` | Task 2 | Task 2 Step 6 (`ERR_PNPM_UNSUPPORTED_ENGINE`) |
| 6.3 | Lint quét `.tsx` và `tests/`, không vào `node_modules`/`.next`, chặn dấu đánh dấu test | Task 1 | Task 1 Step 4 và 6; Task 12 red-check 1, 6, 7, 8 |
| 6.4 | Ba chương trình typecheck 0 lỗi, `types/*.d.ts` đã xóa | Task 3, 4, 5 | Task 5 Step 4; Task 3 Step 2 (`ls types` báo không tồn tại) |
| 6.5 | `next build` thật từ checkout sạch, 14 route; cây sạch sau `pnpm verify` | Task 4, 9, 11 | Task 4 Step 4, Task 9 Step 12, Task 11 Step 6 (`clean-tree-exit=0`) |
| 6.6 | 42 pass, 0 fail, 0 skipped, JUnit; HTTP smoke không ra ngoài loopback, tự thoát | Task 6, 7, 8 | Task 8 Step 4 |
| 6.7 | E2E tự dựng, 1 passed, response 200, hết loading, không ô lỗi, không `pageerror`, reload giữ phiên, logout 204 xóa cookie | Task 9 | Task 9 Step 7–10 |
| 6.8 | Cả 10 red-check fail đúng bước | Task 12 | Task 12 Step 12 (đủ 10 dòng) |
| 6.9 | Code production chỉ đổi 3 chỗ thuần kiểu; `apps/api/src/main.ts` không đổi | Task 3, 4, 5 | Task 14 Step 1 (danh sách 26 đường dẫn) |
| 6.10 | Tài liệu không còn PASS thiếu Evidence; rút lại "103/103" kèm ngày | Task 10 | Task 10 Step 3, 4, 6 |
| 6 (điều kiện đóng) | Run `CI / verify` xanh trên `main`, `CI baseline (SP1)` ở `PASS` đúng URL và SHA, tag `gd0-sp1-ci-green` | "Sau khi merge" | Step 1–5 (`git cat-file -p gd0-sp1-ci-green`) |

### Bản đồ file (spec mục 10)

Mỗi đường dẫn của bảng spec mục 10 do đúng task của commit tương ứng trong thứ tự ở mục 4.1 tạo, sửa hoặc xóa; không task nào chạm file ngoài bảng (trừ sửa tạm có khôi phục ở Task 7 Step 3 và Task 12):

- Task 1 (commit 1): `scripts/lint.mjs`; xóa một dòng ở `apps/web/tests/v1-critical-journey.spec.ts` (lệch 1 bên dưới).
- Task 2 (commit 2): `.gitignore`, `.node-version`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/web/package.json`, `package.json` (`engines.node`).
- Task 3 (commit 3): `tsconfig.json`, xóa `types/node-shim.d.ts` và `types/web-shim.d.ts`, `apps/api/src/modules/accounts/credential-crypto.service.ts`.
- Task 4 (commit 4): `apps/web/tsconfig.json`, `apps/web/src/features/browser-nodes/node-card.tsx`, xóa `scripts/build.mjs`, `package.json` (`typecheck`, `build`).
- Task 5 (commit 5): `tests/web/tsconfig.json`, `apps/web/src/features/overview/overview-model.ts`, `package.json` (`typecheck`).
- Task 6 (commit 6): `scripts/run-tests.mjs`.
- Task 7 (commit 7): `tests/acceptance/v1-acceptance-harness.test.ts`.
- Task 8 (commit 8): `tests/integration/http-api-smoke.test.ts`.
- Task 9 (commit 9): `apps/web/playwright.config.ts`, `apps/web/tests/e2e-owner.ts`, `apps/web/tests/v1-critical-journey.spec.ts`, `package.json` (`test:e2e`).
- Task 10 (commit 10): `scripts/verify-v1.mjs`, `docs/verification/v1-acceptance.md`, `package.json` (`verify`).
- Task 11 (commit 11): `.github/workflows/ci.yml`, `docs/runbooks/local-development.md`, `package.json` (xóa `test:integration`).
- Task 13 (commit 12) và bước đóng: chỉ `docs/verification/v1-acceptance.md`.

Task 14 Step 1 kiểm lại đúng 26 đường dẫn này bằng `git diff --name-status`.

### Rà từng bước

- [x] Mỗi task có code đi theo TDD: kiểm tra thất bại (RED, Expected có lỗi cụ thể) → sửa → chạy lại (GREEN, Expected cụ thể) → commit với subject cố định và hai dòng trailer. Task 0 (RED: lệnh kiểm từ chối Node 22, PR #1 chưa nằm trong nhánh), Task 12, 13, 14 là kiểm ngược, ghi bằng chứng và mở PR.
- [x] Mọi file mới hoặc viết lại có nội dung đầy đủ; mọi sửa đổi là diff unified áp được lên đúng trạng thái task trước, hoặc thay một chuỗi xuất hiện đúng một lần (`node-card.tsx`, có lệnh `grep -c` kiểm). Không có "tương tự như" trong nội dung file.
- [x] Chỗ phụ thuộc thông tin chưa có khi viết plan chỉ nằm trong Expected: SHA, URL run, hostname, thời gian, và subject của commit thêm plan này (dòng cuối Task 0 Step 2, được Task 14 Step 1 dùng lại).
- [x] Mọi lệnh chạy từ gốc repo; mọi lệnh E2E có kiểm cổng 3000/4000 trước; không lệnh nào chạy `playwright install` trong môi trường cloud.
- [x] Không lệnh nào dùng `git add -A`, `git commit -a`, `git stash`, rebase hay force-push.

### Kiểm chứng khi lắp plan (13/10/2026)

- So tự động 201 khối code của plan với 200 khối của bốn phần do builder viết và đã chạy: 176 khối giống từng byte; 1 khối mới (lệnh merge phục hồi ở Task 14 Step 1); 24 khối khác đều là chỉnh có chủ đích liệt kê ở "Hòa giải": 13 khối có lệnh `git commit` (thêm trailer; khối của bước đóng Step 4 còn thêm attribution PR), 2 lệnh merge, Task 0 Step 2 (lệnh và Expected), Expected của Task 1 Step 6, Task 2 Step 1, Task 9 Step 6 và red-check 8, Task 14 Step 1 (lệnh và Expected), Task 14 Step 3 (attribution PR).
- Ghép toàn bộ plan trên một clone sạch của 4f1ea10 (Node 24.21.0, pnpm 10.17.1): áp đúng các khối file và diff của Task 1–11 theo thứ tự, mỗi task một commit.
  - Commit 1–11: `lint: ok`, cây sạch sau mỗi commit.
  - Commit 2: lockfile sha256 `0c305d2ca2498f109d51e56f38f958fda62849fe8aebfd3f6dc78ef2d3557c9c`; `Version 1.56.1`; Node 22 bị `pnpm install --frozen-lockfile` từ chối; Node 24 cài frozen thành công.
  - Commit 3: typecheck RED (exit 2) rồi GREEN.
  - Commit 4: typecheck 0 lỗi, `next build` 14 route, `TSCONFIG_UNCHANGED`.
  - `pnpm test`: 40 (commit 5–6), 41 (commit 7), 42 (commit 8 trở đi), 0 fail; typecheck 0 lỗi ở commit 3, 4, 5, 7, 8, 9 và 11 (commit 6, 10 không đổi file TypeScript).
  - Cây cuối: 23 file giống từng byte commit của các builder (Task 1–9 so với commit thử của Task 9, Task 10–11 so với commit thử của Task 11); `git diff --name-status 4f1ea10` đúng danh sách Task 14 Step 1; `pnpm typecheck`, `pnpm test` (42/42), `pnpm build` (14 route) pass; `node scripts/verify-v1.mjs` với báo cáo E2E thật do builder Task 9 sinh in `verify-v1: OK (42 node tests, 1 e2e) — LOCAL @ <sha> (clean) — không phải bằng chứng CI`.
- `bash -n` trên cả 108 khối bash: 0 lỗi; mọi fence đóng đúng.
- Chưa chạy khi viết plan (cổng 3000/4000 dành cho agent E2E và agent dry-run): `pnpm test:e2e` và `pnpm verify` trên cây ghép đầy đủ (Task 10 Step 6, Task 11 Step 6, phần lớn Task 12, Task 13). E2E đã xanh nhiều lần trên commit 9 của builder với cùng nội dung file, và `verify-v1` đã được kiểm trên báo cáo thật.

### Hòa giải giữa các phần (đã áp vào plan)

1. Thứ tự: Task 0 (chuẩn bị nhánh) trước Task 1; Task 1–11 theo đúng thứ tự commit ở spec mục 4.1; Task 12 không commit; Task 13 là commit 12; rồi Task 14 và bước đóng.
2. Trailer: thêm hai cờ `--trailer` cho cả 13 lệnh `git commit`; thêm `-m` thứ hai (và `--no-edit`) cho hai lệnh merge; thêm attribution của phiên vào cuối hai mô tả PR. Cả ba cách đã chạy thử trên git 2.43.
3. `package.json` đi qua một chuỗi diff duy nhất (Task 2, 4, 5, 9, 10, 11), mỗi diff áp lên đúng trạng thái task trước (đã kiểm bằng lần ghép ở trên). `verify` đổi ở Task 10: part-1 và part-3 đều để lại cho task viết lại `verify-v1`, và commit 10 chỉ nhất quán khi `verify` chạy E2E (verify-v1 mới cần `test-results/e2e.json`). `test:integration` xóa ở Task 11 (spec mục 4.13).
4. Task 9 không làm lại điều kiện của Task 2 và 4 (ghim Playwright, `.gitignore`, `apps/web/tsconfig.json`), chỉ dựa vào chúng.
5. Task 1 Step 6 và Task 2 Step 1: Expected chuyển sang trạng thái thật của luồng tuần tự (có `node_modules` và `pnpm-lock.yaml` untracked từ Task 0 Step 5), đo lại khi lắp plan; biến thể clone chưa cài vẫn được ghi kèm.
6. Task 9 Step 6: số file lint chính là `183 files: 134 .ts` (có `next-env.d.ts` do Task 4 sinh), khớp số đo khi ghép; `182/133` cho cây chưa build.
7. Vị trí test của Playwright: part-4 cho rằng `:26:1` của part-3 sai và dùng `:23:6` cho red-check 8. Kiểm lại bằng `playwright test --list` với config thật của `apps/web`: Playwright 1.56.1 báo `:26:1` (và `:26:6` khi đổi thành `test.fail`) dù `test(` ở dòng 23 của file. Giữ số của part-3 (đo trong lần chạy thật), sửa red-check 8 thành `:26:6`, thêm ghi chú ở Task 9 Step 3 và red-check 8.
8. Red-check 3: part-4 ghi phần E2E là suy ra từ code; part-3 đã đo đúng sửa đổi đó (timeout 30 giây ở `page.waitForResponse`, stack trỏ dòng 40). Ghi chú cập nhật thành "đã đo".
9. Task 14 Step 1: dòng giữ chỗ của part-4 trỏ về danh sách mà Task 0 Step 2 in ra; thêm lệnh kiểm phạm vi file với Expected là 26 đường dẫn đo khi ghép; lệnh merge phục hồi (khi nhánh trên GitHub có commit mới) được viết đầy đủ, kèm trailer.

### Sai lệch so với spec (đã đo; quyết định của spec giữ nguyên)

1. Task 1 xóa dòng `test.skip(!process.env.E2E_SEEDED, …)` ở commit 1 thay vì commit 9: luật 2 có từ commit 1, và quy tắc "nhất quán" (mục 4.1) bắt `pnpm lint` pass từ commit 1. Hệ quả: từ commit 1 tới 9, `pnpm --filter web test:e2e` fail thật thay vì tự skip; bước này chưa thuộc cổng trước Task 9 (root chưa có `test:e2e`, `verify` cũ không chạy E2E). Task 9 vẫn viết lại toàn bộ file.
2. Task 6: khi `TIMEOUT`, SIGKILL chỉ tới tiến trình `node --test`; tiến trình con chạy file test bị treo còn sống với PPID 1 (đo hai lần, mỗi lần 300 giây). Thông báo `TIMEOUT` nói rõ điều này và Step 4 chỉ cách dọn; không đổi thiết kế (kill cả nhóm tiến trình cần child `detached`, làm hỏng Ctrl+C).
3. Task 8: guard `fetch` ghi lại **và từ chối** mọi host khác `127.0.0.1` (chặt hơn spec: không request nào rời máy); thêm vài assert cho hành vi hiện có (status 200 của copy, validate, credentials, accounts; `READY`; `assetId`; refresh không trả `refreshToken`). Không chạm danh sách "Cố ý không assert".
4. Task 9: bước 7 chờ response `POST /auth/logout` rồi mới assert `204` (spec đặt 204 trong điều kiện chờ; kết quả như nhau nhưng lỗi hiện ngay và rõ); mỗi `webServer` có `name` (`api`/`web`) chỉ để gắn nhãn log; thêm `toHaveURL` sau mỗi bước.
5. Task 10: `verify-v1` chặt hơn chứ không trái spec 4.11 (mọi dòng bắt đầu bằng `Status:` trong một mục đều được đếm; `tests[]` rỗng là FAIL; trong CI thiếu biến `GITHUB_*` là FAIL; chạy máy mà không đọc được git là FAIL; mọi lỗi được gom và in cùng lúc). Danh sách file bắt buộc và các mục nền tảng bắt buộc của bản cũ bị bỏ vì spec 4.11 định nghĩa đủ danh sách kiểm; các mục nền tảng vẫn giữ nguyên từng byte trong tài liệu.
6. Task 12: red-check 1 bị `pnpm lint` (luật 2) chặn trước `verify-v1`, nên phần "`verify-v1` (skipped > 0)" được chứng minh bằng chuỗi bỏ qua lint; red-check 7 gắn `expectFailure` cho cả harness lẫn HTTP smoke (cả hai đăng bài qua `FakePublisher`; chỉ gắn harness thì `pnpm test` vẫn đỏ ở HTTP smoke); red-check 8 thêm `test.beforeEach` ném lỗi để hành trình hỏng thật với status `failed` (hành trình pass hoặc hỏng do timeout thì Playwright tự exit 1 và chuỗi không tới được `verify-v1`).

### Sai lệch phát hiện khi dry-run (đã áp vào plan)

1. Task 12 Step 11 (red-check 10): `apps/web/next-env.d.ts` đã có từ các lần build ở Task 4, 9, 11, nên `?? apps/web/next-env.d.ts` hiện ra ngay khi bỏ dòng khỏi `.gitignore`, trước cả `pnpm build` (đo khi dry-run). Thêm `rm -f apps/web/next-env.d.ts` trước build và `test -f apps/web/next-env.d.ts && echo BUILD_GENERATED_NEXT_ENV` sau build; Expected thêm dòng `BUILD_GENERATED_NEXT_ENV` sau `build-exit=0`; dòng bảng của red-check 10 ghi thêm bước xóa file. Build sinh lại file nên các task sau không đổi.
2. Task 7 Step 2 và Task 8 Step 2: `tests/acceptance/` và `tests/integration/` chưa có ở 4f1ea10 (`git ls-tree --name-only 4f1ea10 tests/` chỉ in `tests/smoke` và `tests/web`). Thêm khối `mkdir -p tests/acceptance` và `mkdir -p tests/integration` ở đầu mỗi step, để ghi file bằng redirect của shell không lỗi `No such file or directory`.
3. Task 2 Step 6: Expected của lần `pnpm install --frozen-lockfile` bằng Node 24 thêm dòng `Scope: all 10 workspace projects` (giữa `EXIT=1` và `Lockfile is up to date, resolution step is skipped`), khớp output thật và khớp Expected của Step 4.

Sau khi áp: mọi fence đóng đúng, `bash -n` trên mọi khối bash (thêm 2 khối `mkdir`) vẫn 0 lỗi; số task (0–14), danh sách **Files:** và bản đồ file không đổi.
