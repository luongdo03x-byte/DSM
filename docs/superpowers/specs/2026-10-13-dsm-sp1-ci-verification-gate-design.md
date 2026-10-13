# SP1 — Khôi phục CI và cổng nghiệm thu

Ngày: 2026-10-13
Trạng thái: Thiết kế đã duyệt từng phần (13/10/2026), chờ duyệt bản viết trước khi lập implementation plan
Thuộc: sub-project SP1 trong `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 13, giai đoạn GĐ0)
Sub-project kế tiếp: SP2 — runtime bền vững (PostgreSQL + BullMQ), ngoài phạm vi tài liệu này

---

## 1. Mục tiêu

Có một cổng kiểm tra **không tự nói dối**: chỉ xanh khi code thật sự cài được, kiểm tra kiểu được, build được và chạy đúng ba lớp test; mọi trạng thái PASS truy được về một commit SHA và một run CI.

Cụ thể, sau SP1:

1. `pnpm install --frozen-lockfile && pnpm verify` chạy xanh trên checkout sạch với Node 24.
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
5. Khi CI GitHub còn bị chặn: chủ repo tự sửa; trong lúc chờ, chấp nhận bằng chứng `LOCAL` gắn SHA. SP1 chỉ **đóng** khi CI GitHub xanh.
6. Threads và Browser Gateway giữ nguyên (quyết định ở spec roadmap).
7. Ba phần thiết kế (nhánh/CI, lint/typecheck/build, test/E2E/bằng chứng) được duyệt riêng từng phần.

## 4. Thiết kế

### 4.1. Nhánh và trình tự merge

- **Nhánh thực thi:** `claude/dreamy-shannon-416aba` (nhánh của phiên làm việc). Trước khi code, merge `origin/ui-vietnamese-recovery` (4f1ea10) vào nhánh này bằng merge commit; không xung đột vì `main` là merge-base và nhánh chỉ có commit tài liệu.
- **PR SP1:** từ `claude/dreamy-shannon-416aba` vào base `ui-vietnamese-recovery`. PR này mang theo hai spec tài liệu và các commit SP1.
- **Sau khi PR SP1 xanh và được merge:** đánh dấu PR #1 ready, merge PR #1 vào `main` bằng **merge commit** (không squash, không rebase) để giữ nguyên SHA đã có CI.
- **Bất biến trong lúc làm SP1:** không commit thẳng vào `main` hay `ui-vietnamese-recovery`. Nếu bắt buộc có hotfix trên `main`, merge `main` vào nhánh SP1 (không rebase).
- **Thứ tự commit** (mỗi commit giữ cây nhất quán):
  1. lint
  2. toolchain (lockfile, Playwright 1.56.1, engineStrict, `.node-version`, `.gitignore`)
  3. typecheck root + xóa shim + sửa kiểu `credential-crypto`
  4. web tsconfig + `next build` + sửa kiểu `node-registration-manager`
  5. typecheck `tests/web` + nới kiểu `overview-model`
  6. test runner
  7. test harness
  8. HTTP smoke
  9. E2E
  10. `verify-v1` + tài liệu nghiệm thu
  11. `ci.yml` + runbook

### 4.2. Toolchain cố định

| Thay đổi | Chi tiết |
|---|---|
| `pnpm-lock.yaml` | Sinh bằng pnpm 10.17.1 trên Node 24 sau khi ghim Playwright; commit vào repo |
| `apps/web/package.json` | `"@playwright/test": "1.56.1"` (bỏ dấu `^`). `apps/browser-gateway` giữ `playwright ^1.55.0`, nên lockfile có hai bản `playwright-core`; chấp nhận |
| `pnpm-workspace.yaml` | Thêm `engineStrict: true`. Đã kiểm chứng trên pnpm 10.17.1: Node 22 bị từ chối (`ERR_PNPM_UNSUPPORTED_ENGINE`), Node 24 cài frozen thành công |
| `.node-version` | Nội dung `24`; CI đọc qua `node-version-file` |
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

`scripts/lint.mjs` vẫn chỉ cấm `TODO`/`FIXME`/`HACK`, với ba thay đổi:

- Gốc quét: `apps`, `packages`, `scripts`, `tests`.
- Bỏ qua mọi thư mục tên `node_modules` hoặc bắt đầu bằng `.` (`.next`, `.data`…).
- Đuôi file: `.ts`, `.tsx`, `.mjs`. Vẫn bỏ qua chính `scripts/lint.mjs`.

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
    "tests/smoke/**/*.ts",
    "tests/acceptance/**/*.ts",
    "tests/integration/**/*.ts"
  ],
  "exclude": ["**/node_modules/**"]
}
```

- `moduleDetection: "force"` xử lý 3 lỗi top-level await mà không đổi code `entry.ts`.
- Sửa kiểu duy nhất: trong `apps/api/src/modules/accounts/credential-crypto.service.ts` thêm `import type {webcrypto} from 'node:crypto'` và khai báo khóa là `webcrypto.CryptoKey | undefined`.
- Các file test Node (`tests/smoke`, `tests/acceptance`, `tests/integration`) lần đầu được typecheck.

**(b) Web — `apps/web/tsconfig.json` (file mới, được commit)**

- Lấy nguyên nội dung Next 16.4 tự sinh (`jsx: react-jsx`, plugin `next`, `isolatedModules`, `moduleResolution: bundler`, include `next-env.d.ts`, `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`, `**/*.mts`, `**/*.ts`, `**/*.tsx`).
- Đổi/thêm: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `allowImportingTsExtensions: true`, `noEmit: true`.
- Không dùng `extends` (Next bỏ qua bước tự kiểm tra cấu hình khi có `extends`).
- Chương trình này thay phần `apps/web/src/**/*.ts` trước đây nằm trong root, và giữ nguyên mức nghiêm ngặt `exactOptionalPropertyTypes` mà root đang áp.
- Sửa kiểu duy nhất: `apps/web/src/features/browser-nodes/node-registration-manager.tsx:18`, thuộc tính `lastSeenAt` (`number | undefined` truyền vào prop tùy chọn). Chỉ đổi kiểu, không đổi hành vi Browser Nodes.
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

1. Kiểm tra Node major: khác 24 thì in `run-tests: cần Node 24, đang dùng <phiên bản>` và exit 1.
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

**Dựng môi trường trong test:**
- Truyền `env` dạng object (không ghi `process.env`): email/mật khẩu owner riêng cho smoke, `CREDENTIAL_ENCRYPTION_KEY` là 32 byte ngẫu nhiên dạng base64, `JWT_ACCESS_SECRET` riêng.
- Gọi `createDevelopmentRuntime({env})`. Hasher argon2id là thật, nên cần Node 24.
- Đăng ký `FakePublisher` đè lên publisher `API` của FACEBOOK, INSTAGRAM, THREADS, TIKTOK qua registry của runtime. Registry là một `Map`, nên đăng ký lại sẽ ghi đè.
- Tạo worker cục bộ trên store/registry của runtime để gọi `tick()` và `syncMetrics()` thủ công.
- `startApiServer(0, runtime)` mở cổng ngẫu nhiên. Đóng server trong `t.after`.
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
  - Không nạp `.env`, nên kết quả kín, không phụ thuộc máy.
- `webServer[1]` — **Web:**
  - Lệnh: `"<process.execPath>" node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000`.
  - Chờ `WEB_URL/login`, timeout 60 giây, `reuseExistingServer: false`.
- **Web và API bắt buộc cùng host `127.0.0.1`.** Đã chứng minh: dùng `localhost` thì login bị CORS chặn, hoặc mọi lần reload trả 401.

**`apps/web/tests/v1-critical-journey.spec.ts` (bản PR #1, sửa)**

- Xóa `test.skip(!process.env.E2E_SEEDED, …)`; tên test giữ `'v1 critical UI journey'`.
- Đăng nhập bằng tài khoản trong `e2e-owner.ts`.
- Thu `page.on('pageerror')` suốt test; cuối test assert rỗng.
- Helper `expectLoaded(page, heading, apiPath)`:
  1. Đăng ký `page.waitForResponse` cho `apiPath` với status 200 **trước** thao tác điều hướng. Mẫu 401 → refresh → 200 là bình thường.
  2. Chờ `getByRole('heading', { name: heading, exact: true })` hiển thị.
  3. Chờ `.page-state[role="status"]` (trạng thái loading) về 0.
  4. Assert `.page-state--error` bằng 0. Không dùng `getByRole('alert')`, vì route announcer của Next luôn có một phần tử như vậy.
- Link điều hướng giới hạn trong `nav.app-nav`, tránh trùng với "Mở lịch đăng".
- Hành trình và endpoint chính:

  | Bước | Trang | Endpoint chính chờ 200 |
  |---|---|---|
  | 1 | Đăng nhập → URL `/app/brands/*/overview` | `/auth/login` |
  | 2 | Tổng quan | `/brands/local-brand/analytics/overview` |
  | 3 | Tải lại trang, vẫn Tổng quan (chứng minh refresh qua cookie/CSRF) | `/brands/local-brand/analytics/overview` |
  | 4 | Sản phẩm | `/brands/local-brand/products` |
  | 5 | Nội dung | `/brands/local-brand/content` |
  | 6 | Lịch đăng | `/brands/local-brand/calendar` |
  | 7 | Phân tích | `/brands/local-brand/analytics/platforms` |
  | 8 | Đăng xuất → URL `/login`, `context.cookies()` rỗng | `/auth/logout` |

  Endpoint của từng trang lấy theo `apps/web/src/features/runtime/brand-section-client.tsx`; implementation plan đối chiếu lại với các feature manager riêng của Sản phẩm, Nội dung, Lịch đăng và Phân tích.

**Phạm vi E2E:** chỉ đăng nhập, điều hướng, reload, đăng xuất trên production build. Không đăng bài qua UI, vì dev runtime chỉ có publisher thật và SP1 không thêm switch giả lập.

Scripts: root `"test:e2e": "pnpm --filter web test:e2e"`; `apps/web` giữ `"test:e2e": "playwright test"`.

### 4.11. Bằng chứng: `scripts/verify-v1.mjs` (viết lại) và `docs/verification/v1-acceptance.md`

**`verify-v1.mjs`** chỉ đọc file, không gọi mạng. Bất kỳ điều kiện nào sai thì in lý do và exit 1.

1. **`test-results/node-tests.xml`**
   - Thiếu file thì FAIL.
   - Đọc các comment đếm `pass`/`fail`/`cancelled`/`skipped`/`todo`; yêu cầu `pass > 0` và các loại còn lại bằng 0.
   - Yêu cầu có testcase `v1 acceptance harness` và `http api smoke journey`; thiếu thì báo `required test not executed: <tên>`.
2. **`test-results/e2e.json`**
   - Yêu cầu `stats.expected ≥ 1`, `unexpected = 0`, `flaky = 0`, `skipped = 0`.
   - Spec `v1 critical UI journey` phải có `ok: true`.
3. **`docs/verification/v1-acceptance.md`**
   - Tách theo tiêu đề `## `. Mỗi mục có đúng một dòng `Status:` với giá trị thuộc `PASS | LOCAL | CI | NOT_VERIFIED | BLOCKED_EXTERNAL | BLOCKED_LOCAL_ENV`.
   - `PASS` bắt buộc có dòng `Evidence: https://github.com/<owner>/<repo>/actions/runs/<số> @ <SHA 40 ký tự hex>`.
   - `LOCAL` bắt buộc có dòng `Evidence: local pnpm verify @ <SHA 40 ký tự hex> (<YYYY-MM-DD>, <hệ điều hành>, node <phiên bản>)`.
   - Bắt buộc có các mục `Automated implementation gate`, `Critical journey`, `CI baseline (SP1)`.
4. **Dòng kết quả**
   - Khi `GITHUB_ACTIONS=true`: in `verify-v1: OK (<N> node tests, <M> e2e) — CI run <server>/<repo>/actions/runs/<id> @ <GITHUB_SHA>` và ghi thêm vào `$GITHUB_STEP_SUMMARY` nếu có.
   - Khi chạy máy: in `verify-v1: OK (...) — LOCAL @ <git rev-parse HEAD> (<clean|dirty>) — không phải bằng chứng CI`. Bằng chứng `LOCAL` chỉ được ghi khi cây sạch.

**`v1-acceptance.md`** (giữ đường dẫn, viết lại)

- **Phần mở đầu:**
  - Quy tắc bằng chứng và danh sách trạng thái hợp lệ.
  - Các cổng tự động được kiểm bởi `CI / verify` trên từng commit, không ghi PASS thủ công.
  - Ghi chú lịch sử, ngày 2026-10-13: rút lại các tuyên bố PASS ngày 2026-10-01 ("103/103 tests", "covered by automated tests"). Các tuyên bố đó tạo trong sandbox, không phải CI, không có SHA, và các test không khôi phục được.
- **`## Automated implementation gate`** — `Status: CI`, liệt kê các bước trong `ci.yml`.
- **`## Critical journey`** — `Status: CI`, nêu ba test bắt buộc kèm đường dẫn và tên, và giới hạn phạm vi: harness/HTTP smoke dùng FakePublisher; E2E không đăng bài; publisher Meta/TikTok thật chưa được phủ.
- **`## CI baseline (SP1)`**
  - Ban đầu: `Status: LOCAL` kèm bằng chứng `pnpm verify` trên SHA của commit SP1 cuối cùng chứa code, chạy trên cây sạch. Dòng Evidence được commit sau commit đó, vì một commit không chứa được SHA của chính nó.
  - Khi có run `CI / verify` xanh đầu tiên trên SHA merge ở `main`: chuyển `Status: PASS` kèm URL run và SHA, đồng thời gắn tag `gd0-sp1-ci-green` (annotated, nội dung có URL run) lên SHA đó.
- **`## Local-first persistence`** — `Status: NOT_VERIFIED` (chưa có test snapshot; SP2 thay runtime).
- **Các mục Facebook, Instagram, Threads, TikTok, GPMLogin, Docker/Node 24:** giữ nguyên.

### 4.12. Runbook `docs/runbooks/local-development.md`

- Chỉ sửa mục "5. Verify": dùng `pnpm verify` thay cho `npm run verify`.
- Ghi chú các yêu cầu:
  - Node 24;
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

Các script `dev*` giữ nguyên. Xóa `test:integration`.

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

## 6. Tiêu chí thành công

1. Trên clone sạch của head SP1 (Node 24.x, pnpm 10.17.1): `pnpm install --frozen-lockfile && pnpm verify` exit 0, dòng cuối là `verify-v1: OK (...) — LOCAL @ <sha> (clean) …`.
2. Cài bằng Node 22 thất bại ngay ở `pnpm install` với lỗi engine.
3. `pnpm lint` exit 0, quét cả `.tsx` và `tests/`, không vào `node_modules`/`.next`.
4. `pnpm typecheck` chạy ba chương trình, cả ba 0 lỗi; `types/*.d.ts` đã bị xóa.
5. `pnpm build` chạy `next build` thật từ checkout sạch: TypeScript pass, 14 route. Sau toàn bộ `pnpm verify`, `git status --porcelain` rỗng.
6. `pnpm test` báo 42 pass, 0 fail, 0 skipped; ghi `test-results/node-tests.xml`. HTTP smoke không gửi request ra ngoài loopback và process tự thoát.
7. `pnpm test:e2e` tự dựng API và web, 1 passed, không cần biến môi trường; mỗi trang có response 200 từ endpoint chính, hết loading, không ô lỗi, không `pageerror`; reload giữ phiên; logout xóa cookie.
8. Cả 6 red-check ở mục 5 đều làm `pnpm verify` fail đúng bước.
9. Code production chỉ đổi 3 chỗ thuần về kiểu (`credential-crypto.service.ts`, `node-registration-manager.tsx:18`, `overview-model.ts`). `apps/api/src/main.ts` không đổi.
10. `v1-acceptance.md` không còn PASS nào thiếu Evidence; tuyên bố "103/103" được rút lại kèm ghi chú có ngày.

**Điều kiện đóng SP1:** run `CI / verify` đầu tiên trên SHA merge của PR #1 (đã chứa SP1) ở `main` kết thúc success; mục `CI baseline (SP1)` chuyển sang PASS với URL run và SHA; tag `gd0-sp1-ci-green` đã được đẩy. Trước đó SP1 ở trạng thái `LOCAL`, không phải PASS.

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
| HTTP smoke cần Node 24 | `engineStrict` và kiểm tra Node major trong runner báo lỗi sớm, rõ ràng |
| Các action `@v4` chạy runtime Node 20 đang bị khai tử | Theo dõi annotation khi runner được cấp; nâng major nếu bị ép |

## 9. Việc của chủ repo

1. Mở một run CI đã fail để đọc annotation, rồi sửa theo đó ở Settings → Actions (cho phép Actions) và Settings → Billing and plans. Chạy lại một run để xác nhận job được cấp runner.
2. Review và merge PR SP1 vào `ui-vietnamese-recovery`; sau đó merge PR #1 vào `main` bằng merge commit.
3. Không merge gì khác vào `main` cho tới khi PR #1 vào.
4. (Tùy chọn) Bật branch protection trên `main`, bắt buộc check `CI / verify`.

## 10. Bản đồ file

| File | Thay đổi |
|---|---|
| `.github/workflows/ci.yml` | Viết lại (mục 4.3) |
| `.gitignore` | Thêm 5 mẫu |
| `.node-version` | Mới |
| `pnpm-workspace.yaml` | Thêm `engineStrict: true` |
| `pnpm-lock.yaml` | Mới |
| `package.json` | Sửa scripts (mục 4.13) |
| `apps/web/package.json` | Ghim `@playwright/test` 1.56.1 |
| `tsconfig.json` | Viết lại (mục 4.5a) |
| `types/node-shim.d.ts`, `types/web-shim.d.ts` | Xóa |
| `apps/web/tsconfig.json` | Mới (mục 4.5b) |
| `tests/web/tsconfig.json` | Mới (mục 4.5c) |
| `apps/api/src/modules/accounts/credential-crypto.service.ts` | Sửa kiểu |
| `apps/web/src/features/browser-nodes/node-registration-manager.tsx` | Sửa kiểu dòng 18 |
| `apps/web/src/features/overview/overview-model.ts` | Nới kiểu `AnalyticsSnapshot` |
| `scripts/lint.mjs` | Sửa (mục 4.4) |
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
