# SP1 — Khôi phục CI và cổng nghiệm thu

Ngày: 2026-10-13
Trạng thái: Thiết kế đã duyệt từng phần (13/10/2026); bản viết đã qua rà soát đối kháng với code thật (mục 11), chờ duyệt trước khi lập implementation plan
Thuộc: sub-project SP1 trong `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 13, giai đoạn GĐ0)
Sub-project kế tiếp: SP2 — runtime bền vững (PostgreSQL + BullMQ), ngoài phạm vi tài liệu này

---

## 1. Mục tiêu

Có một cổng kiểm tra **không tự nói dối**: chỉ xanh khi code thật sự cài được, kiểm tra kiểu được, build được và chạy đúng ba lớp test; mọi trạng thái PASS truy được về một commit SHA và một run CI.

Cụ thể, sau SP1:

1. `pnpm install --frozen-lockfile && pnpm verify` chạy xanh trên checkout sạch với Node ≥ 24.7 (dưới 25).
2. Bộ test hồi quy gồm ba lớp: harness nghiệm thu, HTTP smoke với API thật, Playwright UI E2E.
3. Workflow GitHub Actions chạy đúng chuỗi trên và không thể xanh khi test bị bỏ qua, chập chờn hoặc cây làm việc bị bẩn.
4. Tài liệu nghiệm thu không còn tuyên bố PASS nào thiếu bằng chứng.

## 2. Hiện trạng (đo ngày 13/10/2026)

| Hạng mục | Thực tế | Nguồn |
|---|---|---|
| GitHub Actions | Mọi run CI từ 02/10 fail sau 2–3 giây, `runner_id: 0`, log 404 — job chưa từng được cấp runner. Repo public. Lỗi cấp tài khoản/repo | API Actions, run 38195830287 |
| Lockfile | Không có `pnpm-lock.yaml`; CI cài bằng `--no-frozen-lockfile`. Sinh lại bằng pnpm 10.17.1 trên Node 24 cho kết quả giống hệt từng byte | Thử nghiệm worktree main |
| Lint | `scripts/lint.mjs` chỉ tìm TODO/FIXME/HACK, đi vào `apps/*/node_modules` nên luôn fail sau khi cài; bỏ qua `.tsx` và `tests/` | `scripts/lint.mjs:2-3` |
| Typecheck | 4 lỗi: top-level await ở 3 file `entry.ts`, `Uint8Array`→`BufferSource` ở `credential-crypto.service.ts:6`. Root chỉ include `*.ts`, nên mọi `.tsx` chưa từng được kiểm tra. Hai file `types/*-shim.d.ts` khai báo `node:*`, react, next là `any` | `tsc -p tsconfig.json` |
| Build | Script `build` chạy lại `tsc --noEmit`; `next build` chưa từng chạy. Checkout sạch không build được vì thiếu `apps/web/tsconfig.json` | `scripts/build.mjs` |
| Test | `main` có 2 test, PR #1 có 40 (38 `tests/web` + 2 `tests/smoke`). 103 test cũ không khôi phục được: mọi archive trong lịch sử git bị cắt trước thư mục `tests/`. `test` và `test:integration` là cùng một lệnh | `scripts/run-tests.mjs`, lịch sử git |
| Harness | `runV1CriticalJourney()` chạy trọn luồng trong process và pass (khoảng 15 ms), nhưng không test nào gọi nó | `apps/api/src/testing/v1-acceptance-harness.ts` |
| E2E | Spec bị skip nếu thiếu `E2E_SEEDED` (Playwright vẫn exit 0). Trên PR #1, luồng login → điều hướng → reload → logout PASS với API thật và `next start` sau 2 sửa: locator tiêu đề `exact`, và phiên bản Playwright khớp Chromium. Trên `main`, E2E trung thực fail vì cookie `csrf_token` ở `Path=/auth` làm mất phiên mỗi lần tải trang | Thử nghiệm worktree ui |
| Bằng chứng | `verify-v1.mjs` chỉ kiểm tra file tồn tại và tìm chữ `Status: PASS`; không phát hiện được FAIL nếu một mục khác ghi PASS. `v1-acceptance.md` ghi "103/103" từ sandbox, không SHA | `scripts/verify-v1.mjs:13` |

## 3. Quyết định đã chốt (13/10/2026)

1. Bộ test hồi quy gồm harness, HTTP smoke và **cả** Playwright UI E2E.
2. Hướng A: bản thiết kế gọn nhất, cộng các điểm vá chỗ hở (mục 4).
3. **Xếp chồng lên PR #1**: SP1 đi vào nhánh `ui-vietnamese-recovery`, sau đó PR #1 merge vào `main` một lần, mang cả UI tiếng Việt lẫn cổng kiểm tra.
4. Ghim `@playwright/test` **1.56.1** (khớp Chromium 1194 cài sẵn trong môi trường cloud).
5. Khi CI GitHub còn bị chặn: chủ repo tự sửa; trong lúc chờ, chấp nhận bằng chứng `LOCAL` gắn SHA. SP1 chỉ **đóng** khi CI GitHub xanh. Cách hiểu áp dụng trong spec này (mục 4.1): cả PR SP1 và PR #1 được phép merge trên bằng chứng `LOCAL` cộng kết quả red-check; run CI xanh trên `main` là điều kiện đóng.
6. Threads và Browser Gateway giữ nguyên (quyết định ở spec roadmap).
7. Ba phần thiết kế (nhánh/CI, lint/typecheck/build, test/E2E/bằng chứng) được duyệt riêng từng phần.

## 4. Thiết kế

### 4.1. Nhánh và trình tự merge

- **Nhánh thực thi:** `claude/dreamy-shannon-416aba` (nhánh của phiên làm việc). Trước khi code, merge `origin/ui-vietnamese-recovery` (4f1ea10) vào nhánh này bằng merge commit; không xung đột vì `main` là merge-base và nhánh chỉ có commit tài liệu.
- **PR SP1:** từ `claude/dreamy-shannon-416aba` vào base `ui-vietnamese-recovery`. PR này mang theo hai spec tài liệu và các commit SP1.
- **Cổng merge:**
  - PR SP1 merge vào `ui-vietnamese-recovery` khi có bằng chứng: `CI / verify` xanh trên PR, hoặc, nếu Actions còn bị chặn, bằng chứng `LOCAL` cộng kết quả red-check (mục 5) trong mô tả PR.
  - PR #1 merge vào `main` theo cùng quy tắc.
  - Cả hai PR merge bằng **merge commit** (không squash, không rebase), để SHA mà bằng chứng trỏ tới vẫn nằm trong lịch sử. Chủ repo tắt squash/rebase cho hai PR này.
- **Bất biến trong lúc làm SP1:** không commit thẳng vào `main` hay `ui-vietnamese-recovery`. Nếu bắt buộc có hotfix trên `main`, merge `main` vào nhánh SP1 (không rebase).
- **Thứ tự commit.** "Nhất quán" nghĩa là: mọi bước của cổng đã tồn tại tới commit đó đều pass trên Node ≥ 24.7 (ví dụ sau commit 4, `pnpm lint && pnpm typecheck && pnpm build` pass).
  1. lint (gồm luật cấm đánh dấu test trong thư mục test, mục 4.4)
  2. toolchain (lockfile, Playwright 1.56.1, engineStrict, engines `>=24.7 <25`, `.node-version`, `.gitignore`)
  3. typecheck root + xóa shim + sửa kiểu `credential-crypto`
  4. web tsconfig + `next build` + sửa kiểu `node-card`
  5. typecheck `tests/web` + nới kiểu `overview-model`
  6. test runner
  7. test harness
  8. HTTP smoke
  9. E2E
  10. `verify-v1` + tài liệu nghiệm thu (mục `CI baseline (SP1)` ở `Status: NOT_VERIFIED`)
  11. `ci.yml` + runbook + xóa script `test:integration`
  12. bằng chứng: trên clone sạch, chạy `pnpm verify` ở commit 11, rồi chuyển `CI baseline (SP1)` sang `Status: LOCAL` với Evidence trỏ SHA commit 11. Nếu sau đó có commit không phải tài liệu (sửa theo review, merge `main`), lặp lại bước này cho commit code mới nhất.
- **Bước đóng (sau khi PR #1 vào `main` và có run xanh):** implementer merge `main` vào `claude/dreamy-shannon-416aba`, chuyển `CI baseline (SP1)` sang `Status: PASS` với URL run và SHA, mở PR vào `main` (merge commit). Chủ repo tạo và đẩy tag annotated `gd0-sp1-ci-green` lên đúng SHA đó, nội dung tag là URL run.

### 4.2. Toolchain cố định

| Thay đổi | Chi tiết |
|---|---|
| `pnpm-lock.yaml` | Sinh bằng pnpm 10.17.1 trên Node 24 sau khi ghim Playwright; commit vào repo |
| `apps/web/package.json` | `"@playwright/test": "1.56.1"` (bỏ dấu `^`). `apps/browser-gateway` giữ `playwright ^1.55.0`, nên lockfile có hai bản `playwright-core`; chấp nhận |
| `pnpm-workspace.yaml` | Thêm `engineStrict: true`. Đã kiểm chứng trên pnpm 10.17.1: Node 22 bị từ chối (`ERR_PNPM_UNSUPPORTED_ENGINE`), Node 24 cài frozen thành công |
| `package.json` `engines.node` | Đổi thành `">=24.7 <25"`: `crypto.argon2Sync` (hasher thật của API) chỉ có từ Node 24.7.0; trên 24.0–24.6 API báo `NODE24_ARGON2_REQUIRED` |
| `.node-version` | Nội dung `24`; CI đọc qua `node-version-file` (lấy bản 24.x mới nhất) |
| `.gitignore` | Thêm `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `test-results/`, `playwright-report/` |
| pnpm phiên bản | Chỉ ghim ở `packageManager`; bỏ `with: version` khỏi workflow |

Cảnh báo "Ignored build scripts" (prisma, msgpackr-extract) giữ nguyên; SP2 xử lý.

### 4.3. Workflow `.github/workflows/ci.yml`

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

- Tên workflow `CI` và job `verify` giữ nguyên, nên check hiển thị là `CI / verify`.
- `push` chỉ chạy trên `main`; nhánh tính năng được kiểm qua `pull_request`, tránh chạy trùng.
- Bước "Clean tree" bắt buộc: phát hiện file sinh ra chưa được gitignore, hoặc Next tự ghi lại `apps/web/tsconfig.json`.
- `browser-smoke.yml` giữ nguyên.
- Các action giữ major `@v4`; nâng lên bản chạy Node 24 nằm ngoài phạm vi, chỉ làm nếu annotation báo lỗi.

### 4.4. Lint

`scripts/lint.mjs` giữ dạng quét văn bản, với các thay đổi:

- Gốc quét: `apps`, `packages`, `scripts`, `tests`.
- Bỏ qua mọi thư mục tên `node_modules` hoặc bắt đầu bằng `.` (`.next`, `.data`…).
- Đuôi file: `.ts`, `.tsx`, `.mjs`. Vẫn bỏ qua chính `scripts/lint.mjs`.
- Luật 1 (mọi file quét): cấm `TODO`/`FIXME`/`HACK`.
- Luật 2 (chỉ file trong `tests/` và `apps/web/tests/`): cấm mọi cách đánh dấu làm test hỏng trông như pass hoặc bị bỏ qua. Regex:
  - `\bexpectFailure\b`
  - `\b(skip|todo)\s*:`
  - `\b(test|it|describe)\.(skip|only|todo|fail|fixme)\b`

  Lý do (đã tái hiện trên Node 24.21): test gắn `{ expectFailure: true }` mà fail thật vẫn được JUnit ghi là pass; Playwright `test.fail()` cũng làm báo cáo JSON ghi `ok: true`.

Không thêm ESLint hay Biome: đo được 50–140 lỗi tùy bộ luật trên code rất dày, sẽ làm ở sub-project khác.

### 4.5. Typecheck: ba chương trình, xóa type shim

Xóa `types/node-shim.d.ts` và `types/web-shim.d.ts` (đo được: không phát sinh lỗi mới).

**(a) Root — `tsconfig.json`**

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

- `moduleDetection: "force"` xử lý 3 lỗi top-level await mà không đổi code `entry.ts`.
- Với cấu hình mới (lib ES2024, không DOM), lỗi duy nhất còn lại là TS2749 tại `credential-crypto.service.ts:4` (`CryptoKey` chỉ là giá trị trong @types/node). Lỗi `BufferSource` ở dòng 6 (mục 2) chỉ xuất hiện với cấu hình cũ.
- Sửa kiểu duy nhất: trong `apps/api/src/modules/accounts/credential-crypto.service.ts` thêm `import type {webcrypto} from 'node:crypto'` và khai báo khóa là `webcrypto.CryptoKey | undefined`.
- Mọi file test Node dưới `tests/` (trừ `tests/web`, có chương trình riêng) lần đầu được typecheck, nên test thêm ở thư mục con mới cũng được kiểm.

**(b) Web — `apps/web/tsconfig.json` (file mới, được commit)**

Nội dung đầy đủ (bản Next 16.4 tự sinh, cộng các tùy chọn nghiêm ngặt). Giữ đủ mọi khóa; thiếu khóa Next yêu cầu thì `next build` sẽ ghi lại file và bước "Clean tree" fail.

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

- Không dùng `extends` (Next bỏ qua bước tự kiểm tra cấu hình khi có `extends`). Đã kiểm chứng: với file này `next build` không ghi lại tsconfig.
- Chương trình này thay phần `apps/web/src/**/*.ts` trước đây nằm trong root, và giữ nguyên mức nghiêm ngặt `exactOptionalPropertyTypes` mà root đang áp.
- Lỗi duy nhất báo tại `node-registration-manager.tsx:18` (`lastSeenAt: number | undefined` truyền vào prop tùy chọn). Kiểu nhận nằm ở `apps/web/src/features/browser-nodes/node-card.tsx:5`. Sửa kiểu duy nhất: đổi prop thành `lastSeenAt?: number | undefined` trong `node-card.tsx`. Chỉ đổi kiểu, không đổi hành vi Browser Nodes.
- Với `exactOptionalPropertyTypes` bật, `api-client.ts` không còn lỗi (đã đo).

**(c) Test web — `tests/web/tsconfig.json` (file mới)**

- `extends: "../../apps/web/tsconfig.json"`, `compilerOptions.types: ["node"]`, `lib: ["dom", "dom.iterable", "esnext"]`, `include: ["./**/*.ts"]`.
- Hai lỗi ở `tests/web/overview-model.test.ts:6,18` được xử lý bằng cách nới kiểu các thuộc tính tùy chọn của `AnalyticsSnapshot` trong `apps/web/src/features/overview/overview-model.ts` thành `… | undefined`. Không đổi logic.

Script: `"typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json"`.

### 4.6. Build

- `"build": "pnpm --filter web build"` chạy `next build` thật; `next build` tự có cổng TypeScript theo `apps/web/tsconfig.json` (đã chứng minh: thiếu sửa kiểu thì build fail).
- Xóa `scripts/build.mjs` và script `test:integration`.
- Build dùng giá trị mặc định `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000` để E2E dùng chung bản build; không export biến này khi build cho E2E.

### 4.7. Test runner `scripts/run-tests.mjs`

1. Kiểm tra phiên bản Node: ngoài khoảng `>=24.7 <25` thì in `run-tests: cần Node >=24.7 <25, đang dùng <phiên bản>` và exit 1.
2. Xóa rồi tạo lại thư mục `test-results/` (không bao giờ đọc nhầm báo cáo cũ).
3. Gom `tests/**/*.test.ts`; không có file nào thì in `NO_TESTS_FOUND` và exit 1.
4. Chạy `process.execPath --experimental-strip-types --test --test-timeout=60000` với hai reporter: `spec` ra stdout và `junit` ra `test-results/node-tests.xml`.
5. `spawnSync` có `timeout: 300000`, `killSignal: 'SIGKILL'`; quá giờ thì in `TIMEOUT` và exit 1.
6. Không dùng `--test-force-exit` (nó che handle bị rò).

### 4.8. Test harness — `tests/acceptance/v1-acceptance-harness.test.ts`

- Một test, tên chính xác `'v1 acceptance harness'`, không subtest.
- Gọi `await runV1CriticalJourney()` từ `apps/api/src/testing/v1-acceptance-harness.ts`, không đổi source.
- Assert:

  | Trường | Giá trị mong đợi |
  |---|---|
  | `loginOk` | `true` |
  | `variants` | `4` |
  | `jobs` | `4` |
  | `publishedPosts` | `4` |
  | trạng thái batch | `'PUBLISHED'` |
  | `redirect` | `'https://shop.test/dog-brush'` |
  | `analytics.posts` | `4` |
  | `analytics.views` | `400` |
  | `analytics.clicks` | `1` |
  | `analytics.platforms.length` | `4` |

### 4.9. HTTP smoke — `tests/integration/http-api-smoke.test.ts`

- Một test, tên chính xác `'http api smoke journey'`, không subtest.
- **Không đổi code production.**

**Dựng môi trường trong test** (đã chạy thử trọn 21 bước, pass khoảng 0,8 giây):
- Truyền `env` dạng object (không ghi `process.env`): email/mật khẩu owner riêng cho smoke, `CREDENTIAL_ENCRYPTION_KEY` là 32 byte ngẫu nhiên dạng base64, `JWT_ACCESS_SECRET` riêng.
- `const app = await createDevelopmentRuntime({env})` (`apps/api/src/runtime/dev-runtime.ts`). Hàm trả về object bọc `{store, runtime, registry, services, ids}`, không phải runtime trực tiếp. Hasher argon2id là thật, nên cần Node ≥ 24.7.
- Với mỗi nền tảng FACEBOOK, INSTAGRAM, THREADS, TIKTOK: `app.registry.register(platform, 'API', new FakePublisher())`, với `FakePublisher` từ `apps/worker/src/testing/fake-publisher.ts` (constructor không tham số). Registry là một `Map`, nên đăng ký lại sẽ ghi đè publisher thật.
- `const worker = new LocalWorkerRuntime(app.store, app.registry, app.services.media)` (`apps/worker/src/runtime/local-worker.ts`). Bước 16 gọi `worker.tick()`; bước 20 gọi `worker.syncMetrics(metricsCaptureKey())`, với `metricsCaptureKey` export từ cùng file.
- `const server = startApiServer(0, app.runtime)` (`apps/api/src/main.ts`), rồi `await once(server, 'listening')` (từ `node:events`) vì `listen` bất đồng bộ; lấy cổng từ `server.address().port`. Đóng server trong `t.after`.
- Bọc `globalThis.fetch` để ghi mọi host khác `127.0.0.1`; cuối test assert danh sách rỗng, rồi khôi phục `fetch`.

**Chuỗi 21 bước** (brand `local-brand`):

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `GET /health` | 200 |
| 2 | Gọi brand route khi chưa có token | 401 |
| 3 | Đăng nhập sai mật khẩu | 401 |
| 4 | `POST /auth/login` | 200; có `accessToken`; body không có `refreshToken`; cookie `refresh_token` có `HttpOnly`, `SameSite=Lax`, `Path=/auth`; có cookie `csrf_token` (không assert Path của nó) |
| 5 | `POST /auth/refresh` kèm cookie và `x-csrf-token` | 200; thiếu header thì 403 `CSRF_MISMATCH` |
| 6 | Tạo sản phẩm | 201 |
| 7 | `POST …/media/uploads` (VIDEO) | 201 |
| 8 | Tạo nội dung VIDEO với `masterAssetId` | 201 |
| 9 | `POST …/content/:id/variants/copy` | 4 biến thể |
| 10 | `GET …/accounts` | 4 tài khoản |
| 11 | `POST …/publish/validate` | mọi đích có lỗi `VARIANT_NOT_READY` (fail-closed) |
| 12 | `PATCH` 4 biến thể sang READY | 200 |
| 13 | `POST …/accounts/:id/credentials` cho 4 tài khoản | CONNECTED |
| 14 | validate lại | mọi đích hợp lệ, strategy `API` |
| 15 | `POST …/publish` | 201, 4 `jobId` |
| 16 | `worker.tick()` | xử lý 4 job |
| 17 | `GET /publish/batches/:id` | `PUBLISHED` |
| 18 | `GET …/calendar` | 4 mục PUBLISHED |
| 19 | Tạo tracked link, `GET /r/:code` (`redirect: 'manual'`) | 302, đúng `location` |
| 20 | `worker.syncMetrics(...)` | 4 bài được đồng bộ |
| 21 | `GET …/analytics/overview` | `posts: 4`, `views: 400` |

**Cố ý không assert** (hành vi hiện có, ghi vào danh sách sửa sau):
- 404 cho variant/media không tồn tại (hiện trả 500).
- 201 khi mọi đích đều không hợp lệ.
- `clicks > 0` qua HTTP (không có route gắn link vào bài đã đăng).
- Tham số UTM khi redirect.

**Tổng kỳ vọng của `pnpm test`:** 42 pass (38 `tests/web`, 2 `tests/smoke`, 1 harness, 1 HTTP smoke), 0 fail, 0 skipped, khoảng 2 giây.

### 4.10. Playwright UI E2E

**`apps/web/playwright.config.ts` (viết lại): tự dựng mọi thứ, không cần biến môi trường**

- Hằng số:
  - `API_URL = 'http://127.0.0.1:4000'`;
  - `WEB_URL = 'http://127.0.0.1:3000'`;
  - tài khoản E2E lấy từ file mới `apps/web/tests/e2e-owner.ts`.
- **Guard:** nếu thiếu `apps/web/.next/BUILD_ID` thì ném lỗi `E2E cần bản build: chạy "pnpm build" trước`.
- Cấu hình chung:
  - `testDir: './tests'`;
  - `forbidOnly: !!process.env.CI`;
  - `retries: 0`;
  - `failOnFlakyTests: true`;
  - `workers: 1`;
  - reporter `list` và `json` ghi ra `../../test-results/e2e.json`;
  - `use: { baseURL: WEB_URL, trace: 'retain-on-failure' }`.
- `webServer[0]` — **API:**
  - Lệnh: `"<process.execPath>" --experimental-strip-types src/entry.ts`, `cwd: '../api'`.
  - Chờ `API_URL/health`, timeout 60 giây, `reuseExistingServer: false`.
  - Biến môi trường:
    - `DEV_IN_MEMORY=1`, `APP_ENV=test`, `API_PORT=4000`;
    - để rỗng `DEV_STORE_FILE`, `S3_ENDPOINT`, `BROWSER_NODE_KEY`;
    - tài khoản owner E2E;
    - `JWT_ACCESS_SECRET` riêng cho E2E;
    - `CREDENTIAL_ENCRYPTION_KEY` cố định 32 byte;
    - `WEB_ORIGINS=WEB_URL`, `COOKIE_SECURE=false`.
  - Không nạp `.env`. Playwright vẫn cho server kế thừa biến môi trường của shell, nên mọi biến làm đổi hành vi đều được ghi đè tường minh như trên; thêm `BROWSER_GATEWAY_HOST=''`. CI không đặt biến nào khác.
- `webServer[1]` — **Web:**
  - Lệnh: `"<process.execPath>" node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000`.
  - Chờ `WEB_URL/login`, timeout 60 giây, `reuseExistingServer: false`.
- **Web và API bắt buộc cùng host `127.0.0.1`.** Đã chứng minh: dùng `localhost` thì login bị CORS chặn, hoặc mọi lần reload trả 401.

**`apps/web/tests/v1-critical-journey.spec.ts` (bản PR #1, sửa)**

- Xóa `test.skip(!process.env.E2E_SEEDED, …)`; tên test giữ `'v1 critical UI journey'`.
- Đăng nhập bằng tài khoản trong `e2e-owner.ts`.
- Thu `page.on('pageerror')` suốt test; cuối test assert rỗng.
- Helper `expectLoaded(page, { heading, apiPath }, action: () => Promise<unknown>)`:
  1. Tạo promise `page.waitForResponse(r => new URL(r.url()).pathname === apiPath && r.status() === 200)` **trước** khi gọi `action()`. Mẫu 401 → refresh → 200 là bình thường.
  2. Gọi `await action()` (click đăng nhập, `page.reload()`, hoặc click link điều hướng), rồi chờ promise ở bước 1.
  3. Chờ `getByRole('heading', { name: heading, exact: true })` hiển thị.
  4. Chờ `.page-state[role="status"]` (trạng thái loading) về 0.
  5. Assert `.page-state--error` bằng 0. Không dùng `getByRole('alert')`, vì route announcer của Next luôn có một phần tử như vậy.

  Lý do phải truyền `action` (đã tái hiện): sau khi đăng nhập, Next chuyển trang phía client và gọi `analytics/overview` ngay; nếu đăng ký chờ response sau bước đăng nhập thì response đã về và lệnh chờ luôn hết giờ.
- Link điều hướng giới hạn trong `nav.app-nav`, tránh trùng với "Mở lịch đăng".
- Hành trình (endpoint lấy theo feature manager thật của từng trang, đã đối chiếu: `overview-dashboard.tsx:22`, `products-manager.tsx:27`, `content-manager.tsx:31`, `calendar-dashboard.tsx:16`, `analytics-dashboard.tsx:15`; `brand-section-client.tsx` là code không còn được dùng):

  | Bước | Trang và thao tác (`action`) | Endpoint chính (status chờ) |
  |---|---|---|
  | 1 | Điền form, click "Đăng nhập" → URL `/app/brands/*/overview`, trang Tổng quan | `/brands/local-brand/analytics/overview` (200); đồng thời `/auth/login` (200) |
  | 2 | `page.reload()`, vẫn Tổng quan (chứng minh refresh qua cookie/CSRF) | `/brands/local-brand/analytics/overview` (200) |
  | 3 | Link "Sản phẩm" | `/brands/local-brand/products` (200) |
  | 4 | Link "Nội dung" | `/brands/local-brand/content` (200) |
  | 5 | Link "Lịch đăng" | `/brands/local-brand/calendar` (200) |
  | 6 | Link "Phân tích" | `/brands/local-brand/analytics/platforms` (200) |
  | 7 | Click "Đăng xuất khỏi DSM" | `/auth/logout` (**204**) |

  Bước 7 không dùng `expectLoaded`: chờ response `/auth/logout` status 204, rồi URL `/login`, rồi `context.cookies()` rỗng.

**Phạm vi E2E:** chỉ đăng nhập, điều hướng, reload, đăng xuất trên production build. Không đăng bài qua UI, vì dev runtime chỉ có publisher thật và SP1 không thêm switch giả lập.

Scripts: root `"test:e2e": "pnpm --filter web test:e2e"`; `apps/web` giữ `"test:e2e": "playwright test"`.

### 4.11. Bằng chứng: `scripts/verify-v1.mjs` (viết lại) và `docs/verification/v1-acceptance.md`

**`verify-v1.mjs`** chỉ đọc file, không gọi mạng. Bất kỳ điều kiện nào sai thì in lý do và exit 1.

1. **`test-results/node-tests.xml`**
   - Thiếu file thì FAIL.
   - Đọc các comment đếm `tests`/`pass`/`fail`/`cancelled`/`skipped`/`todo` mà reporter JUnit của Node 24 ghi ra (đã kiểm chứng định dạng).
   - Yêu cầu `fail`, `cancelled`, `skipped`, `todo` đều bằng 0, và `pass ≥ MIN_NODE_TESTS`. `MIN_NODE_TESTS` là hằng số trong `verify-v1.mjs`, bằng 42 ở SP1; tăng khi thêm test. Xóa bớt test thì cổng đỏ.
   - Yêu cầu có testcase `v1 acceptance harness` và `http api smoke journey`; thiếu thì báo `required test not executed: <tên>`.
   - JUnit không phân biệt được test gắn `expectFailure`; việc này do luật 2 của lint (mục 4.4) chặn ở mã nguồn.
2. **`test-results/e2e.json`**
   - Yêu cầu `stats.expected ≥ 1`, `unexpected = 0`, `flaky = 0`, `skipped = 0`.
   - Duyệt đệ quy `suites[].specs` và `suites[].suites[]`; phải tìm thấy **đúng một** spec có title `v1 critical UI journey`, nếu không thì FAIL `required e2e not executed`.
   - Với spec đó: `ok: true`; mọi phần tử `tests[]` có `expectedStatus === 'passed'` và `status === 'expected'`; phần tử cuối của `results[]` có `status === 'passed'`. Điều này chặn `test.fail()` ngay cả khi lint bị vượt qua.
3. **`docs/verification/v1-acceptance.md`**
   - Tách theo dòng bắt đầu bằng `## `. Phần mở đầu (trước mục `## ` đầu tiên) không được chứa dòng nào khớp `^(Status|Evidence):`.
   - Mỗi mục có đúng một dòng khớp `^Status: (PASS|LOCAL|CI|NOT_VERIFIED|BLOCKED_EXTERNAL|BLOCKED_LOCAL_ENV)(?: — .+)?$` (cho phép phần giải thích sau dấu " — ", như các mục giữ nguyên đang dùng).
   - `PASS` bắt buộc có, trong cùng mục, dòng khớp `^Evidence: https://github\.com/[^/\s]+/[^/\s]+/actions/runs/\d+ @ [0-9a-f]{40}$`.
   - `LOCAL` bắt buộc có, trong cùng mục, dòng khớp `^Evidence: local pnpm verify @ [0-9a-f]{40} \(\d{4}-\d{2}-\d{2}, [^,)]+, node v?24\.\d+\.\d+\)$`.
   - Bắt buộc có các mục `Automated implementation gate`, `Critical journey`, `CI baseline (SP1)`.
4. **Dòng kết quả**
   - Khi `GITHUB_ACTIONS=true`: in `verify-v1: OK (<N> node tests, <M> e2e) — CI run <server>/<repo>/actions/runs/<id> @ <GITHUB_SHA>` và ghi thêm vào `$GITHUB_STEP_SUMMARY` nếu có.
   - Khi chạy máy: in `verify-v1: OK (...) — LOCAL @ <git rev-parse HEAD> (<clean|dirty>) — không phải bằng chứng CI`. Bằng chứng `LOCAL` chỉ được ghi khi cây sạch.

**`v1-acceptance.md`** (giữ đường dẫn, viết lại)

- **Phần mở đầu:**
  - Quy tắc bằng chứng và danh sách trạng thái hợp lệ.
  - Các cổng tự động được kiểm bởi `CI / verify` trên head của mỗi PR và mỗi push vào `main` (commit trung gian không được kiểm riêng); không ghi PASS thủ công cho chúng.
  - Ghi chú lịch sử, ngày 2026-10-13: rút lại các tuyên bố PASS ngày 2026-10-01 ("103/103 tests", "covered by automated tests"). Các tuyên bố đó tạo trong sandbox, không phải CI, không có SHA, và các test không khôi phục được.
- **`## Automated implementation gate`** — `Status: CI`, liệt kê các bước trong `ci.yml`.
- **`## Critical journey`** — `Status: CI`, nêu ba test bắt buộc kèm đường dẫn và tên, và giới hạn phạm vi: harness/HTTP smoke dùng FakePublisher; E2E không đăng bài; publisher Meta/TikTok thật chưa được phủ.
- **`## CI baseline (SP1)`**
  - Ở commit 10–11: `Status: NOT_VERIFIED`.
  - Commit 12: `Status: LOCAL` kèm bằng chứng `pnpm verify` trên SHA commit 11, chạy trên clone sạch. Dòng Evidence nằm ở commit sau, vì một commit không chứa được SHA của chính nó.
  - Bước đóng (mục 4.1): `Status: PASS` kèm URL run và SHA của run `CI / verify` thành công, cộng tag `gd0-sp1-ci-green`.
- **`## Local-first persistence`** — `Status: NOT_VERIFIED` (chưa có test snapshot; SP2 thay runtime).
- **Các mục Facebook, Instagram, Threads, TikTok, GPMLogin, Docker/Node 24:** giữ nguyên.

### 4.12. Runbook `docs/runbooks/local-development.md`

- Chỉ sửa mục "5. Verify": dùng `pnpm verify` thay cho `npm run verify`.
- Ghi chú các yêu cầu:
  - Node ≥ 24.7 (dưới 25);
  - cổng 127.0.0.1:3000 và :4000 phải trống (tắt `pnpm dev` trước);
  - cài Chromium một lần bằng `pnpm --filter web exec playwright install chromium`;
  - không export `NEXT_PUBLIC_API_BASE_URL` khi build để chạy E2E;
  - kết quả chạy máy là `LOCAL`, không phải bằng chứng CI.
- Không động vào đoạn PR #1 đã sửa (dòng 35).

### 4.13. Script `package.json` (root)

```json
{
  "lint": "node scripts/lint.mjs",
  "typecheck": "tsc -p tsconfig.json && tsc -p apps/web/tsconfig.json && tsc -p tests/web/tsconfig.json",
  "test": "node scripts/run-tests.mjs",
  "build": "pnpm --filter web build",
  "test:e2e": "pnpm --filter web test:e2e",
  "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && node scripts/verify-v1.mjs"
}
```

Các script `dev*` giữ nguyên. Xóa `test:integration` ở commit 11, cùng lúc viết lại `ci.yml` (workflow cũ còn gọi script này). Script `test`/`build` ở cấp từng app (đã hỏng từ trước khi chạy trong thư mục app) giữ nguyên; cổng chỉ chạy từ thư mục gốc.

## 5. Kiểm tra ngược (red-check)

Chạy tại chỗ trước khi mở PR, không commit; ghi kết quả vào mô tả PR. Mỗi lỗi cố ý dưới đây phải làm `pnpm verify` fail ở đúng bước:

| # | Lỗi cố ý | Bước phải fail |
|---|---|---|
| 1 | Thêm `test.skip` vào spec E2E | `verify-v1` (skipped > 0) |
| 2 | Xóa file test harness | `verify-v1` (required test not executed) |
| 3 | Trả `csrf_token` về `Path=/auth` ở `apps/api/src/main.ts` | E2E, bước tải lại trang |
| 4 | Ghi `Status: PASS` không kèm Evidence vào tài liệu nghiệm thu | `verify-v1` |
| 5 | Cho `FakePublisher` ném lỗi | `pnpm test` (harness và HTTP smoke) |
| 6 | Thêm `TODO` vào một file `.tsx` | `pnpm lint` |
| 7 | Gắn `{ expectFailure: true }` vào test harness và cho `FakePublisher` ném lỗi | `pnpm lint` (luật 2); bỏ qua lint thì `pnpm test` vẫn xanh, chứng minh luật 2 là cần thiết |
| 8 | Đổi E2E thành `test.fail(...)` | `pnpm lint`; bỏ qua lint thì `verify-v1` fail (expectedStatus) |
| 9 | Xóa một file trong `tests/web` | `verify-v1` (pass < `MIN_NODE_TESTS`) |
| 10 | Bỏ `next-env.d.ts` khỏi `.gitignore`, chạy build rồi hai lệnh của bước "Clean tree" | `test -z "$(git status --porcelain)"` fail |

## 6. Tiêu chí thành công

1. Trên clone sạch của head SP1 (Node 24.7+, pnpm 10.17.1): `pnpm install --frozen-lockfile && pnpm verify` exit 0, dòng cuối là `verify-v1: OK (...) — LOCAL @ <sha> (clean) …`.
2. Cài bằng Node 22 thất bại ngay ở `pnpm install` với lỗi engine.
3. `pnpm lint` exit 0, quét cả `.tsx` và `tests/`, không vào `node_modules`/`.next`, và chặn được các dấu đánh dấu test ở luật 2.
4. `pnpm typecheck` chạy ba chương trình, cả ba 0 lỗi; `types/*.d.ts` đã bị xóa.
5. `pnpm build` chạy `next build` thật từ checkout sạch: TypeScript pass, 14 route. Sau toàn bộ `pnpm verify`, `git status --porcelain` rỗng.
6. `pnpm test` báo 42 pass, 0 fail, 0 skipped; ghi `test-results/node-tests.xml`. HTTP smoke không gửi request ra ngoài loopback và process tự thoát.
7. `pnpm test:e2e` tự dựng API và web, 1 passed, không cần biến môi trường; mỗi trang có response 200 từ endpoint chính, hết loading, không ô lỗi, không `pageerror`; reload giữ phiên; logout trả 204 và xóa cookie.
8. Cả 10 red-check ở mục 5 đều fail đúng bước.
9. Code production chỉ đổi 3 chỗ thuần về kiểu (`credential-crypto.service.ts`, `node-card.tsx`, `overview-model.ts`). `apps/api/src/main.ts` không đổi.
10. `v1-acceptance.md` không còn PASS nào thiếu Evidence; tuyên bố "103/103" được rút lại kèm ghi chú có ngày.

**Điều kiện đóng SP1:** có một run `CI / verify` thành công (cho phép chạy lại) trên SHA merge của PR #1 ở `main`, hoặc, nếu cần sửa thêm, trên SHA đầu tiên của `main` chứa bản sửa. Mục `CI baseline (SP1)` chuyển sang PASS với đúng URL run và SHA đó, và tag `gd0-sp1-ci-green` trỏ vào SHA đó. Trước đó SP1 ở trạng thái `LOCAL`, không phải PASS.

## 7. Ngoài phạm vi

- SP2: repository interface, PostgreSQL/Prisma, BullMQ, tách worker, test snapshot JSON, `onlyBuiltDependencies` cho prisma.
- Các hạng mục GĐ0 khác: staging, domain/HTTPS/backup, trang chính sách.
- Linter thật (ESLint/Biome), formatter.
- Refactor `apps/api/src/main.ts`/`boot()`, sửa log cổng.
- Sửa hành vi API đã biết: 500 thay vì 404, 201 khi mọi đích không hợp lệ, UTM khi redirect, route gắn tracked link vào bài.
- E2E đăng bài qua UI, switch fake publisher trong dev runtime.
- Threads, Browser Gateway/GPMLogin, `browser-smoke.yml`, live smoke Meta/TikTok (giữ nguyên).
- Nâng major các GitHub Action, matrix, tách job E2E.
- Kiểm tra URL/SHA bằng chứng qua GitHub API; kiểm tra SHA bằng chứng là tổ tiên của HEAD.
- Gỡ các dependency NestJS/Prisma/BullMQ khai báo mà không dùng.
- Khôi phục 103 test cũ (không thể).
- Sửa tài khoản/repo GitHub để Actions được cấp runner (việc của chủ repo).

## 8. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Actions bị chặn ở cấp tài khoản; không thay đổi code nào giúp CI xanh | Chủ repo sửa song song từ ngày đầu; trong lúc chờ dùng trạng thái `LOCAL`; SP1 chỉ đóng khi CI xanh |
| SP1 chỉ vào được `main` khi UI của PR #1 (71 file) được chấp nhận | Đã chốt chấp nhận; nếu đổi ý, phương án dự phòng là làm từ `main`, port sửa cookie csrf, viết E2E tiếng Anh và chịu 2 xung đột |
| Commit khác vào `main` trước khi PR #1 merge | Bất biến "không commit thẳng vào main"; nếu bắt buộc thì merge `main` vào nhánh SP1 |
| Playwright 1.56.1 cũ hơn bản mới nhất; CI tải trình duyệt mỗi run (ước tính 30–90 giây) | Chấp nhận để môi trường cloud chạy được E2E; nâng phiên bản là việc riêng |
| E2E dùng cố định cổng 3000/4000 và URL API nhúng lúc build | Fail rõ ràng (không âm thầm) khi cổng bận hoặc build sai URL; ghi trong runbook |
| Handle bị rò làm test treo | Đóng server trong `t.after`, timeout 300 giây ở runner, timeout job 20 phút; không dùng `--test-force-exit` |
| Next tự ghi lại `apps/web/tsconfig.json` | Không dùng `extends`, copy nguyên include Next sinh; bước "Clean tree" trong CI phát hiện |
| Wiring publisher Meta/TikTok thật không có test | Ghi rõ giới hạn trong tài liệu nghiệm thu; thuộc SP4/SP6 |
| HTTP smoke và API cần Node ≥ 24.7 (argon2) | `engines` `>=24.7 <25` + `engineStrict` và kiểm tra phiên bản trong runner báo lỗi sớm, rõ ràng |
| Test bị đánh dấu `expectFailure`/`test.fail()` trông như pass | Luật 2 của lint chặn ở mã nguồn; `verify-v1` kiểm `expectedStatus` của E2E; red-check 7 và 8 |
| Các action `@v4` chạy runtime Node 20 đang bị khai tử | Theo dõi annotation khi runner được cấp; nâng major nếu bị ép |

## 9. Việc của chủ repo

1. Mở một run CI đã fail để đọc annotation, rồi sửa theo đó ở Settings → Actions (cho phép Actions) và Settings → Billing and plans. Chạy lại một run để xác nhận job được cấp runner.
2. Review và merge PR SP1 vào `ui-vietnamese-recovery`; sau đó merge PR #1 vào `main`. Cả hai bằng merge commit, theo cổng merge ở mục 4.1.
3. Không merge gì khác vào `main` cho tới khi PR #1 vào.
4. Sau run xanh trên `main`: review/merge PR đóng SP1 (chuyển `CI baseline (SP1)` sang PASS), rồi tạo và đẩy tag `git tag -a gd0-sp1-ci-green <SHA> -m "<URL run>"`.
5. (Tùy chọn) Bật branch protection trên `main`, bắt buộc check `CI / verify`.

## 10. Bản đồ file

| File | Thay đổi |
|---|---|
| `.github/workflows/ci.yml` | Viết lại (mục 4.3) |
| `.gitignore` | Thêm 5 mẫu |
| `.node-version` | Mới |
| `pnpm-workspace.yaml` | Thêm `engineStrict: true` |
| `pnpm-lock.yaml` | Mới |
| `package.json` | Sửa scripts (mục 4.13), `engines.node` `>=24.7 <25` |
| `apps/web/package.json` | Ghim `@playwright/test` 1.56.1 |
| `tsconfig.json` | Viết lại (mục 4.5a) |
| `types/node-shim.d.ts`, `types/web-shim.d.ts` | Xóa |
| `apps/web/tsconfig.json` | Mới (mục 4.5b) |
| `tests/web/tsconfig.json` | Mới (mục 4.5c) |
| `apps/api/src/modules/accounts/credential-crypto.service.ts` | Sửa kiểu |
| `apps/web/src/features/browser-nodes/node-card.tsx` | Nới kiểu prop `lastSeenAt` (dòng 5) |
| `apps/web/src/features/overview/overview-model.ts` | Nới kiểu `AnalyticsSnapshot` |
| `scripts/lint.mjs` | Sửa, thêm luật 2 (mục 4.4) |
| `scripts/build.mjs` | Xóa |
| `scripts/run-tests.mjs` | Sửa (mục 4.7) |
| `scripts/verify-v1.mjs` | Viết lại (mục 4.11) |
| `tests/acceptance/v1-acceptance-harness.test.ts` | Mới |
| `tests/integration/http-api-smoke.test.ts` | Mới |
| `apps/web/playwright.config.ts` | Viết lại (mục 4.10) |
| `apps/web/tests/e2e-owner.ts` | Mới |
| `apps/web/tests/v1-critical-journey.spec.ts` | Sửa (mục 4.10) |
| `docs/verification/v1-acceptance.md` | Viết lại (mục 4.11) |
| `docs/runbooks/local-development.md` | Sửa mục 5 |

## 11. Rà soát đối kháng (13/10/2026)

Bản viết đầu tiên được 3 reviewer độc lập rà soát trên code thật của PR #1 (áp thử toàn bộ phần toolchain trong một worktree riêng, chạy trọn HTTP smoke 21 bước và E2E). Một agent phản biện kiểm lại từng phát hiện: 31 phát hiện, 5 bị bác, 6 trùng; 20 phát hiện được xác nhận và đã sửa vào bản này. Các điểm chính:

- **Blocker:** test gắn `expectFailure` (Node) hoặc `test.fail()` (Playwright) mà fail thật vẫn được báo là pass → thêm luật 2 cho lint, kiểm `expectedStatus` trong `verify-v1`, red-check 7 và 8.
- E2E: logout trả 204 chứ không phải 200; `expectLoaded` phải nhận thao tác điều hướng để chờ response đúng lúc; endpoint lấy theo feature manager thật.
- HTTP smoke: ghi rõ cách nối `createDevelopmentRuntime`, `FakePublisher`, `LocalWorkerRuntime`, `metricsCaptureKey`, `once(server,'listening')`.
- Sửa kiểu Browser Nodes đặt đúng chỗ (`node-card.tsx:5`); `apps/web/tsconfig.json` ghi đầy đủ; root typecheck bao toàn bộ `tests/` (trừ `tests/web`).
- Node ≥ 24.7 cho argon2; ngưỡng `MIN_NODE_TESTS`; tìm spec E2E đệ quy và đúng một lần.
- Quy tắc bằng chứng: cú pháp dòng Status/Evidence, trạng thái `CI baseline (SP1)` qua từng commit, cổng merge khi Actions còn bị chặn, merge commit cho cả hai PR, bước đóng và người gắn tag, điều kiện đóng cho phép chạy lại; CI kiểm head PR và `main` chứ không phải mọi commit.
- Thêm red-check cho bước "Clean tree" và cho việc xóa bớt test.
