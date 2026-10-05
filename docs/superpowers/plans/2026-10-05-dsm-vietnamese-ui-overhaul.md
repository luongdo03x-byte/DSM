# DSM Vietnamese UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay toàn bộ giao diện HTML thô của DSM bằng dashboard tiếng Việt hiện đại, responsive, bám bộ preview đã duyệt và chỉ hiển thị/chạy các chức năng backend V1 thực sự tồn tại.

**Architecture:** Giữ nguyên Next.js App Router, `browserApi`, auth/session và API contracts. Tạo một design system nội bộ nhỏ bằng React components + global CSS, sau đó nâng cấp từng feature manager hiện có để dùng cùng shell, trạng thái loading/error/empty và các view-model helper thuần TypeScript có thể test bằng Node test runner hiện tại.

**Tech Stack:** Next.js 16, React, TypeScript 5.9, CSS thuần/global CSS, Node 24 test runner, API hiện tại của DSM.

**Spec:** `docs/superpowers/specs/2026-10-05-dsm-vietnamese-ui-overhaul-design.md`

## Global Constraints

- Toàn bộ text hiển thị cho người dùng là tiếng Việt, trừ tên platform và technical ID cần giữ nguyên.
- Giữ nguyên business logic và API hiện tại; không thay publishing engine.
- Không thêm signup, forgot-password, billing, revenue, AI generator, inventory/category/product variants khi backend chưa có.
- Không hard-code KPI/số liệu demo vào production UI.
- Không lưu access token vào localStorage/sessionStorage.
- Giữ nguyên route `/app/brands/:brandId/{overview,products,content,calendar,campaigns,accounts,analytics,settings}`.
- Desktop-first; >=1280px full sidebar, 768–1279px collapsed layout, <768px mobile drawer/card layout.
- Mọi form/action phải có loading, disabled, error và success feedback phù hợp.
- CSS/component mới phải dùng design tokens chung, không thêm UI framework lớn trong đợt này.

## Review Focus

- API trả mảng rỗng hoặc field metric `null/undefined`: UI phải hiển thị empty state/`—`, không `NaN`, `Infinity` hoặc crash. → Task 4/9 tests.
- User refresh trang khi access token memory trống nhưng refresh cookie còn hợp lệ: ApiClient flow vẫn khôi phục session hoặc đưa về login rõ ràng. → Task 2 test.
- Content chưa có đủ 4 variant hoặc variant chưa READY: màn Nội dung/Đăng bài phải chỉ báo đúng từng nền tảng, không giả READY. → Task 6 tests.
- Job đã PUBLISHED/CANCELLED hoặc không retryable: action retry/cancel/reschedule phải ẩn/disable theo status. → Task 7 tests.
- Account không có Browser Node/GPM profile hoặc node offline: Accounts UI phải hiển thị trạng thái thiếu cấu hình và không báo giả là khỏe mạnh. → Task 8 tests.

---

### Task 1: Design System + Vietnamese App Shell

**Files:**
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/ui/icon.tsx`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/page-state.tsx`
- Create: `apps/web/src/components/ui/page-header.tsx`
- Create: `apps/web/src/lib/ui/navigation.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Test: `tests/web/navigation.test.ts`

**Interfaces:**
- Produces: `NAV_ITEMS`, `buildBrandHref(brandId, section)`, reusable `Button`, `Card`, `Badge`, `PageHeader`, `LoadingState`, `EmptyState`, `ErrorState`.
- Consumes: existing `brandId` route param and existing App Router links.

- [ ] **Step 1: Write failing navigation tests**
  - Assert 8 labels exactly: `Tổng quan`, `Sản phẩm`, `Nội dung`, `Lịch đăng`, `Chiến dịch`, `Tài khoản`, `Phân tích`, `Cài đặt`.
  - Assert `buildBrandHref('local-brand','products') === '/app/brands/local-brand/products'`.

- [ ] **Step 2: Run test and verify RED**
  - Run: `node --experimental-strip-types --test tests/web/navigation.test.ts`
  - Expected: FAIL because `navigation.ts` does not exist.

- [ ] **Step 3: Implement navigation helpers, UI primitives, global tokens and shell**
  - `RootLayout` imports `globals.css`, sets `lang="vi"`, metadata title `DSM — Quản lý Social Dropship`.
  - `AppShell` renders dark sidebar, DSM brand, active nav, topbar shell and responsive container.

- [ ] **Step 4: Run targeted test + typecheck**
  - Run: `node --experimental-strip-types --test tests/web/navigation.test.ts && npm run typecheck`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -am "feat(web): add Vietnamese DSM design system and shell"`

### Task 2: Login + Session UX

**Files:**
- Create: `apps/web/src/features/auth/login-flow.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/features/auth/login-form.tsx`
- Modify: `apps/web/src/lib/api-client.ts` only if refresh failure handling needs normalization.
- Test: `tests/web/login-flow.test.ts`

**Interfaces:**
- Produces: `nextBrandRoute(context)` and `loginErrorMessage(error)` for UI.
- Consumes: `browserLogin(email,password)`, first available brand from `/auth/context`.

- [ ] **Step 1: Write failing login-flow tests**
  - Success context with first brand `local-brand` returns `/app/brands/local-brand/overview`.
  - Empty brand context maps to Vietnamese error `Tài khoản chưa được gán thương hiệu.`
  - Invalid credentials maps to `Email hoặc mật khẩu không đúng.`
  - Refresh unauthorized maps to login-required message instead of raw `UNAUTHORIZED`.

- [ ] **Step 2: Run test and verify RED**.

- [ ] **Step 3: Implement login visual**
  - `/` redirects or provides a polished Vietnamese entry to `/login` without fake signup/forgot-password.
  - Two-column login visual per preview; form remains real API-backed.
  - Add show/hide password, busy state and Vietnamese errors.

- [ ] **Step 4: Run login test + typecheck/build**.

- [ ] **Step 5: Commit** `feat(web): redesign Vietnamese login experience`.

### Task 3: Shared Data Presentation Helpers

**Files:**
- Create: `apps/web/src/lib/ui/format.ts`
- Create: `apps/web/src/lib/ui/status.ts`
- Create: `apps/web/src/components/ui/platform-badge.tsx`
- Create: `apps/web/src/components/ui/stat-card.tsx`
- Create: `apps/web/src/components/ui/data-table.tsx`
- Test: `tests/web/ui-format.test.ts`
- Test: `tests/web/status.test.ts`

**Interfaces:**
- Produces: `formatCurrency`, `formatPercent`, `formatMetric`, `formatDateTime`, `statusLabel`, `statusTone`, `platformLabel`.
- Consumes: numeric/string/null values from existing APIs.

- [ ] **Step 1: Write failing formatter/status tests**
  - Null denominator/CTR returns `—`.
  - `PUBLISHED→Đã đăng`, `PROCESSING→Đang xử lý`, `RETRYING→Đang thử lại`, `FAILED→Thất bại`, `QUEUED→Đang chờ`, `CANCELLED→Đã hủy`.
  - Platform names remain `Facebook`, `Instagram`, `Threads`, `TikTok`.

- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement helpers + reusable table/stat/platform components**.
- [ ] **Step 4: Run tests + typecheck**.
- [ ] **Step 5: Commit** `feat(web): add shared Vietnamese data presentation helpers`.

### Task 4: Overview Dashboard

**Files:**
- Create: `apps/web/src/features/overview/overview-model.ts`
- Modify/Create: `apps/web/src/features/overview/overview-dashboard.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/overview/page.tsx`
- Test: `tests/web/overview-model.test.ts`

**Interfaces:**
- Produces: `buildOverviewModel({analytics, accounts, jobs})` with KPI values, account health and recent jobs.
- Consumes: `/analytics/overview`, `/accounts`, `/calendar`.

- [ ] **Step 1: Write failing tests** for empty datasets, failed-job counts, active account counts, null metrics.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement real-data dashboard**
  - KPI cards: bài đã đăng, đã lên lịch, công việc lỗi, tài khoản hoạt động.
  - Account health, recent jobs, today schedule, quick actions.
  - No fake time-series chart when API has no series; render summary/empty state instead.
- [ ] **Step 4: Run tests + typecheck/build**.
- [ ] **Step 5: Commit** `feat(web): add Vietnamese overview dashboard`.

### Task 5: Products Experience

**Files:**
- Create: `apps/web/src/features/products/product-model.ts`
- Modify: `apps/web/src/features/products/products-manager.tsx`
- Modify: `apps/web/src/features/products/product-list.tsx`
- Test: `tests/web/product-model.test.ts`

**Interfaces:**
- Produces: `productMargin(cost, price)`, `filterProducts(products, query)`, `productStats(products)`.
- Consumes: existing GET/POST `/products`, POST `/products/:id/archive`.

- [ ] **Step 1: Write failing product tests** for margin math, missing cost/price → `null`, search, active/archive stats.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement page matching preview without fake category/platform-fit**
  - Header/search/KPI/table.
  - `Tạo sản phẩm` opens modal/drawer using the exact fields backend supports.
  - Archive has confirmation + feedback.
- [ ] **Step 4: Run tests + typecheck/build**.
- [ ] **Step 5: Commit** `feat(web): redesign product management`.

### Task 6: Content Studio + Publish Drawer

**Files:**
- Create: `apps/web/src/features/content/content-model.ts`
- Modify: `apps/web/src/features/content/content-manager.tsx`
- Modify: `apps/web/src/features/publishing/publish-manager.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/content/page.tsx`
- Test: `tests/web/content-model.test.ts`
- Test: `tests/web/publish-model.test.ts`

**Interfaces:**
- Produces: `variantReadiness(variants)`, `platformVariant(variants, platform)`, `publishTargetSummary(validation)`.
- Consumes: content CRUD endpoints, signed media upload helper, variant copy/read/update, publish validate/create endpoints.

- [ ] **Step 1: Write failing tests**
  - Missing variant is not READY.
  - DRAFT/READY mapping per platform.
  - Partial publish validation keeps valid targets separate from invalid targets.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement 3-column content studio**
  - Library left, editor/variant tabs center, preview/readiness right.
  - TEXT/IMAGE/VIDEO upload flow preserved.
  - Publish drawer uses real accounts, schedule, validate first, then submit.
  - Remove raw JSON `<pre>` output and replace with platform result cards.
- [ ] **Step 4: Run tests + typecheck/build**.
- [ ] **Step 5: Commit** `feat(web): build Vietnamese content and publishing studio`.

### Task 7: Calendar + Campaigns

**Files:**
- Create: `apps/web/src/features/calendar/calendar-actions.ts`
- Create: `apps/web/src/features/calendar/calendar-dashboard.tsx`
- Create/Modify: `apps/web/src/features/campaigns/campaigns-manager.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/calendar/page.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/campaigns/page.tsx`
- Test: `tests/web/calendar-actions.test.ts`
- Test: `tests/web/campaign-model.test.ts`

**Interfaces:**
- Produces: `jobActionsForStatus(status)`, `groupJobsByDay(jobs)`, campaign display model.
- Consumes: calendar GET/PATCH/DELETE, retry endpoint, campaign list/create/attach/performance endpoints.

- [ ] **Step 1: Write failing tests**
  - PUBLISHED/CANCELLED cannot retry.
  - FAILED/RETRYING can show retry when appropriate.
  - QUEUED can reschedule/cancel.
  - Empty month groups safely.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement month/list calendar + selected-day panel and campaign cards/table**.
- [ ] **Step 4: Run tests + typecheck/build**.
- [ ] **Step 5: Commit** `feat(web): redesign calendar and campaigns`.

### Task 8: Accounts + Browser Nodes / GPMLogin

**Files:**
- Create: `apps/web/src/features/accounts/account-model.ts`
- Modify: `apps/web/src/features/accounts/accounts-manager.tsx`
- Modify: `apps/web/src/features/browser-nodes/node-registration-manager.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/accounts/page.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/settings/page.tsx` as needed for Browser Node entry/summary.
- Test: `tests/web/account-model.test.ts`

**Interfaces:**
- Produces: `accountHealth(account, nodes)`, `publishModeLabel(mode)`, `browserProfileState(account, nodes)`.
- Consumes: accounts list/credential/profile/disconnect and browser-node registration/list endpoints.

- [ ] **Step 1: Write failing tests**
  - API/BROWSER/HYBRID labels become `API`, `Trình duyệt`, `Kết hợp`.
  - Missing profile/node/offline node produces warning state, never healthy.
  - Connected credential alone does not imply browser-ready.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement Accounts dashboard**
  - Platform rows/cards, connection health, publish mode.
  - Credential drawer, attach GPM form, disconnect.
  - Browser Nodes table + one-time registration display/instructions.
- [ ] **Step 4: Run tests + typecheck/build**.
- [ ] **Step 5: Commit** `feat(web): redesign accounts and browser node management`.

### Task 9: Analytics + Settings + Responsive/Accessibility Hardening

**Files:**
- Create: `apps/web/src/features/analytics/analytics-model.ts`
- Modify: analytics feature components under `apps/web/src/features/analytics/`
- Modify: `apps/web/src/app/app/brands/[brandId]/analytics/page.tsx`
- Modify: `apps/web/src/app/app/brands/[brandId]/settings/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `tests/web/analytics-model.test.ts`

**Interfaces:**
- Produces: normalized analytics cards/platform rows/campaign rows with null-safe CTR.
- Consumes: existing analytics overview/platforms and campaign performance APIs.

- [ ] **Step 1: Write failing analytics tests** for `0` denominator, null metrics, empty snapshots and platform totals.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement Analytics and Settings**
  - Real KPIs only; tables and CSS/SVG/simple bars only from returned data.
  - Empty state instead of invented charts.
  - Settings shows brand/runtime/browser-node summaries only for existing capabilities.
  - Finish responsive breakpoints, focus states, labels and `aria-live` alerts.
- [ ] **Step 4: Run tests + typecheck/build**.
- [ ] **Step 5: Commit** `feat(web): finish analytics settings and responsive UI`.

### Task 10: Whole-App Verification + Regression Cleanup

**Files:**
- Modify only files required by failures discovered during verification.
- Update: `docs/superpowers/specs/2026-10-05-dsm-vietnamese-ui-overhaul-design.md` status line to implemented after evidence is green.

**Interfaces:**
- Consumes all previous tasks.
- Produces a clean build and documented verification result.

- [ ] **Step 1: Run targeted web tests**
  - Run: `node --experimental-strip-types --test tests/web/*.test.ts`
  - Expected: PASS.

- [ ] **Step 2: Run repository gates**
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run verify` if public-repo verify script remains compatible.

- [ ] **Step 3: Run static safety checks**
  - No `localStorage`/`sessionStorage` for access token.
  - No hard-coded demo KPI numbers in runtime UI.
  - No raw `<pre>{JSON.stringify(...)}</pre>` debug output.
  - Visible primary UI copy is Vietnamese.

- [ ] **Step 4: Fix only verified regressions, rerun gates until green**.

- [ ] **Step 5: Final commit** `feat(web): complete DSM Vietnamese UI overhaul`.

## Self-Review

- **Spec coverage:** Auth, shell, Overview, Products, Content, Publish, Calendar, Campaigns, Accounts, Browser Nodes, Analytics, Settings, responsive/accessibility đều có task; unsupported preview features explicitly excluded.
- **Step scan:** Mỗi task có RED → implementation → GREEN → commit; UI-heavy behavior được đẩy vào pure TypeScript view-model helpers để Node test runner hiện tại test được mà không cần thêm React testing framework.
- **Type consistency:** Tất cả helper names/interfaces được định nghĩa một lần ở task sở hữu và task sau chỉ consume.
- **Review Focus:** 5 failure modes đều được gắn vào tests ở Task 2/4/6/7/8/9.
- **Proportion:** Plan quyết định file boundaries, helper signatures, test assertions và verification; không transcript code implementation.
