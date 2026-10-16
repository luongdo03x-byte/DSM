# DSM SP5 — Composer và lịch đa nền tảng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một màn hình composer tạo nội dung gốc (video, ảnh, album, văn bản), xem trước từng nền tảng, sửa biến thể, thấy lỗi pre-flight, rồi đăng ngay hoặc lên lịch; lịch tháng/tuần kéo thả để đổi giờ; cảnh báo lỗi qua Telegram và Email.

**Architecture:** Logic giao diện nằm trong các view-model thuần TypeScript (test bằng node:test như `tests/web` của PR #1); component React chỉ hiển thị. Composer gọi các route đã có của SP3/SP4 (`/content`, `/content/:id/media`, `/variants/:id/media`, `/preflight`, `/publish/validate`, `/publish`). Lịch dùng route `/calendar` có thêm khoảng thời gian và `PATCH /calendar/:jobId`. Thông báo qua interface `Notifier` chạy trong worker.

**Tech Stack:** Next.js 16 App Router, React 19, CSS hiện có của PR #1 (design tokens), Playwright 1.56.1, node:test; Telegram Bot API, SMTP (`nodemailer`).

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 5 M2, M3; GĐ1; 8.1–8.4; mục 9 chỉ số "đăng 1 nội dung dưới 3 phút"; mục 13 dòng SP5). Tiền đề: SP3, SP4. Dựa trên giao diện tiếng Việt của PR #1 (`docs/superpowers/specs/2026-10-05-dsm-vietnamese-ui-overhaul-design.md`).

## Quyết định trong plan (cần duyệt)

1. Composer là một trang `/app/brands/:brandId/compose` (và `/compose/:contentId` khi sửa), thay khối "Đăng bài" trong trang Nội dung; trang Nội dung giữ danh sách và nút "Tạo bài".
2. Giờ đăng nhập theo múi giờ của brand (`Brand.timezone`, mặc định `Asia/Ho_Chi_Minh`), lưu UTC epoch-ms. Hiển thị luôn kèm tên múi giờ.
3. Kéo thả trên lịch chỉ đổi ngày (giữ giờ); đổi giờ bằng ô nhập trong popover. Chỉ job ở `QUEUED`/`RETRYING` kéo được.
4. Không dùng thư viện lịch ngoài; lưới tháng/tuần tự dựng từ view-model (YAGNI, tránh phụ thuộc lớn).
5. Kênh thông báo P0: Telegram (bot của workspace, `chat_id` nhập tay) và Email (SMTP). Zalo ở SP9.
6. E2E cần đăng bài qua giao diện, nên thêm cờ `E2E_FAKE_PUBLISHERS=1` cho `createRuntime`: thay publisher thật bằng `FakePublisher`. Cờ chỉ có hiệu lực khi `APP_ENV=test`, nếu không thì API từ chối khởi động (`E2E_FAKE_PUBLISHERS_REQUIRES_TEST_ENV`). Đây là điều SP1 cố ý để ngoài phạm vi.

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit).
- Toàn bộ chữ hiển thị bằng tiếng Việt; tên nền tảng giữ nguyên.
- Không có số liệu giả: thiếu dữ liệu thì hiển thị trạng thái trống hoặc `—`.
- Không lưu access token trong localStorage/sessionStorage (giữ quy tắc PR #1).
- Lỗi pre-flight mức `error` chặn nút "Đăng"/"Lên lịch" cho nền tảng đó; mức `warning` chỉ hiển thị.
- Thời gian lên lịch tối thiểu: hiện tại + 5 phút; tối đa: 75 ngày (giới hạn lên lịch của Facebook theo roadmap 3.1 nguồn thứ cấp; cấu hình `MAX_SCHEDULE_AHEAD_DAYS = 75`).

## Review Focus

- Người dùng ở múi giờ máy khác múi giờ brand: giờ hiển thị và giờ lưu phải theo brand → Task 2 test `giờ nhập theo Asia/Ho_Chi_Minh lưu đúng UTC`.
- Rời trang composer khi chưa lưu: hỏi xác nhận, không mất bản nháp → Task 3 test view-model `có thay đổi chưa lưu`.
- Kéo một job đã PUBLISHED: không cho thả, báo lý do → Task 5 test `job PUBLISHED không kéo được`.
- Đăng 4 nền tảng mà 1 nền tảng lỗi pre-flight: 3 nền tảng còn lại vẫn đăng được nếu người dùng chọn → Task 4 test `đăng một phần khi một đích bị chặn`.
- Gửi Telegram thất bại (token sai): job đăng không bị ảnh hưởng, lỗi thông báo được ghi nhận → Task 6 test `lỗi gửi thông báo không làm hỏng job`.

---

### Task 1: API lịch theo khoảng thời gian và đổi giờ

**Files:**
- Modify: `apps/api/src/runtime/local-api.ts` (`GET /brands/:brandId/calendar?from&to`, `PATCH /brands/:brandId/calendar/:jobId` body `{scheduledAt:number}`)
- Modify: `apps/api/src/modules/publishing/publishing.service.ts`
- Test: `tests/integration/calendar-api.test.ts`

**Interfaces:**
- Consumes: `PublishJobRepo.findInRange`, `JobQueue.reschedule/cancel` (SP2).
- Produces: `PublishingService.listCalendar(brandId:string, from:number, to:number):Promise<CalendarEntry[]>` với `CalendarEntry = {jobId:string; contentItemId:string; title:string; platform:Platform; socialAccountId:string; format?:ContentFormat; scheduledAt:number; status:JobStatus; publishedUrl?:string; errorCode?:string}`; `PublishingService.reschedule(brandId:string, jobId:string, scheduledAt:number, now:number):Promise<CalendarEntry>` ném `JOB_NOT_RESCHEDULABLE` (409) nếu không ở `QUEUED|RETRYING`, `SCHEDULE_TOO_SOON` (400) nếu < now+5 phút, `SCHEDULE_TOO_FAR` (400) nếu > 75 ngày.

- [ ] **Step 1: Viết test**: lọc đúng khoảng `[from,to)`; reschedule cập nhật DB và gọi `queue.reschedule` (queue giả ghi lại); PUBLISHED → 409; quá gần → 400; quá xa → 400.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(api): calendar range query and safe rescheduling`.

### Task 2: View-model thời gian theo múi giờ brand

**Files:**
- Create: `apps/web/src/lib/ui/brand-time.ts`
- Test: `tests/web/brand-time.test.ts`

**Interfaces:**
- Produces: `toUtcMs(localDate:string /* YYYY-MM-DD */, localTime:string /* HH:mm */, timeZone:string):number`, `fromUtcMs(ms:number, timeZone:string):{date:string; time:string; label:string}` (label dạng `20:30, 18/10/2026 (GMT+7)`), `monthGrid(year:number, month1to12:number, timeZone:string):{date:string; inMonth:boolean}[][]` (tuần bắt đầu thứ Hai, 6 hàng).

- [ ] **Step 1: Viết test**: `giờ nhập theo Asia/Ho_Chi_Minh lưu đúng UTC` (`toUtcMs('2026-10-18','20:30','Asia/Ho_Chi_Minh') === Date.UTC(2026,9,18,13,30)`); round-trip; `monthGrid(2026,10)` hàng đầu bắt đầu `2026-09-28`, có 6 hàng × 7 ô.
- [ ] **Step 2–4:** FAIL → hiện thực bằng `Intl.DateTimeFormat` (không thêm thư viện) → PASS.
- [ ] **Step 5: Commit** `feat(web): brand time zone helpers and month grid`.

### Task 3: View-model composer

**Files:**
- Create: `apps/web/src/features/compose/compose-model.ts`
- Test: `tests/web/compose-model.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ComposeState { contentId?:string; type:ContentType; title:string; body:string; hook:string; cta:string; mediaAssetIds:string[]; selectedAccountIds:string[]; variants:Record<string /*platform*/, VariantDraft>; schedule:{mode:'now'}|{mode:'at'; date:string; time:string}; saved:ComposeSnapshot }
  export interface VariantDraft { variantId?:string; platform:Platform; format?:ContentFormat; caption:string; title?:string; hashtags:string[]; mediaOrder:string[]; crops:Record<string,CropBox>; coverAssetId?:string; issues:PreflightIssue[]; skippedReason?:string }
  export function composeReducer(state:ComposeState, action:ComposeAction):ComposeState;
  export function isDirty(state:ComposeState):boolean;
  export function publishableTargets(state:ComposeState):{accountId:string; platform:Platform; blocked:boolean; reasons:string[]}[];
  export function hashtagsFromCaption(caption:string):string[];
  ```
  `ComposeAction` gồm: `setField`, `setMedia`, `reorderMedia`, `setCrop`, `setCover`, `toggleAccount`, `editVariant`, `applyPreflight`, `setSchedule`, `markSaved`.

- [ ] **Step 1: Viết test**: `có thay đổi chưa lưu` (sau `setField` → `isDirty` true; sau `markSaved` → false); `reorderMedia đổi thứ tự cả mediaOrder của biến thể chưa tùy chỉnh`; `đăng một phần khi một đích bị chặn` (IG có issue error → `blocked:true`, FB/TT `blocked:false`); `biến thể YouTube bị bỏ qua hiển thị lý do tiếng Việt`; `hashtagsFromCaption` lấy `#tag` có dấu tiếng Việt (`#mỹphẩm`).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(web): composer view model`.

### Task 4: Trang composer

**Files:**
- Create: `apps/web/src/app/app/brands/[brandId]/compose/page.tsx`, `apps/web/src/app/app/brands/[brandId]/compose/[contentId]/page.tsx`
- Create: `apps/web/src/features/compose/compose-page.tsx`, `media-strip.tsx`, `crop-dialog.tsx`, `platform-preview.tsx`, `schedule-picker.tsx`
- Modify: `apps/web/src/lib/ui/navigation.ts` (mục "Tạo bài"), `apps/web/src/features/content/content-manager.tsx` (nút "Tạo bài" dẫn tới composer)
- Test: `apps/web/tests/compose-journey.spec.ts` (Playwright), mở rộng `scripts/verify-v1.mjs` danh sách spec E2E bắt buộc thêm `compose journey`

**Interfaces:**
- Consumes: `compose-model.ts`, `brand-time.ts`, route SP3/SP4.

- [ ] **Step 1: Viết spec E2E `compose journey`** (dùng chung webServer của SP1; API chế độ memory với FakePublisher bật bằng biến chỉ dành cho test `E2E_FAKE_PUBLISHERS=1` mà `createRuntime` chỉ chấp nhận khi `APP_ENV=test`): đăng nhập → "Tạo bài" → chọn loại "Album", tải 3 ảnh fixture → kéo ảnh 3 lên đầu → chọn tài khoản FB + IG → thấy tab xem trước 2 nền tảng → "Đăng ngay" → thông báo "Đã đưa 2 bài vào hàng đợi" → trang Lịch có 2 mục.
- [ ] **Step 2: Chạy** `pnpm --filter web test:e2e` → FAIL (route chưa có).
- [ ] **Step 3: Hiện thực trang.** Bản nháp tự lưu khi rời ô nhập (debounce 800 ms) qua `POST/PATCH /content`; cảnh báo `beforeunload` khi `isDirty`. Xem trước dùng khung tỉ lệ đúng nền tảng (IG 4:5, TikTok/Shorts 9:16), chỉ minh họa, không giả giao diện chính thức của nền tảng.
- [ ] **Step 4: Chạy** E2E → PASS; `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(web): multi-platform composer with previews, album ordering and scheduling`.

### Task 5: Lịch tháng/tuần kéo thả

**Files:**
- Create: `apps/web/src/features/calendar/calendar-grid.tsx`, `apps/web/src/features/calendar/calendar-board-model.ts`
- Modify: `apps/web/src/features/calendar/calendar-dashboard.tsx`
- Test: `tests/web/calendar-board-model.test.ts`, mở rộng `apps/web/tests/compose-journey.spec.ts` bằng bước kéo thả

**Interfaces:**
- Produces: `canDrag(entry:CalendarEntry):boolean`, `moveToDate(entry:CalendarEntry, targetDate:string, timeZone:string):number /* scheduledAt mới, giữ giờ */`, `groupByDay(entries:CalendarEntry[], timeZone:string):Record<string, CalendarEntry[]>`, `filterEntries(entries, {platforms?:Platform[]; statuses?:JobStatus[]})`.

- [ ] **Step 1: Viết test**: `job PUBLISHED không kéo được`; `moveToDate giữ 20:30 khi đổi ngày`; `groupByDay theo múi giờ brand` (job 23:30 UTC thuộc ngày hôm sau ở GMT+7).
- [ ] **Step 2–4:** FAIL → hiện thực (HTML5 drag-and-drop; thả gọi `PATCH /calendar/:jobId`; lỗi 400/409 hiện thông báo tiếng Việt và trả mục về chỗ cũ) → PASS.
- [ ] **Step 5: Commit** `feat(web): month and week calendar with drag to reschedule`.

### Task 6: Thông báo Telegram và Email

**Files:**
- Create: `packages/shared/src/notifications.ts`, `apps/worker/src/notifications/telegram.notifier.ts`, `apps/worker/src/notifications/email.notifier.ts`, `apps/worker/src/notifications/notification-dispatcher.ts`
- Modify: `packages/shared/src/domain.ts` + repositories + schema (`NotificationChannel {id; workspaceId; kind:'TELEGRAM'|'EMAIL'; target:string; encryptedSecret?:string; enabled:boolean}`), migration `0005_notification_channels`
- Modify: `apps/worker/src/publishing/job-runner.service.ts` (phát sự kiện), `apps/web/src/features/settings/settings-dashboard.tsx` (mục "Thông báo")
- Test: `tests/notifications/dispatcher.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NotificationEvent =
    | {kind:'JOB_FAILED'; brandId:string; jobId:string; platform:Platform; title:string; errorCode:string; errorMessage:string}
    | {kind:'TOKEN_EXPIRING'; brandId:string; socialAccountId:string; platform:Platform; expiresAt:number}
    | {kind:'ACCOUNT_EXPIRED'; brandId:string; socialAccountId:string; platform:Platform};
  export interface Notifier { send(channel:NotificationChannel, event:NotificationEvent):Promise<void> }
  export function renderVietnamese(event:NotificationEvent, appUrl:string):{subject:string; text:string};
  export class NotificationDispatcher { constructor(repos:Repositories, notifiers:Record<NotificationChannel['kind'],Notifier>); dispatch(workspaceId:string, event:NotificationEvent):Promise<{sent:number; failed:number}> }
  ```
  Telegram gọi `POST https://api.telegram.org/bot<token>/sendMessage` (base URL cấu hình `TELEGRAM_API_BASE_URL` để test dùng stub).

- [ ] **Step 1: Viết test**: `renderVietnamese JOB_FAILED có tên nền tảng, mã lỗi và link tới lịch`; `dispatcher gửi tới mọi kênh bật`; `lỗi gửi thông báo không làm hỏng job` (notifier ném → dispatcher trả `failed:1`, ghi audit `NOTIFICATION_FAILED`, không ném).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Job thất bại cuối cùng (`FAILED`) và `refreshExpiringTokens` (SP4) gọi `dispatch`.
- [ ] **Step 5: Commit** `feat(worker): Telegram and email notifications for failed jobs and expiring tokens`.

### Task 7: Chỉ số độ tin cậy và đóng GĐ1

**Files:**
- Create: `apps/api/src/modules/analytics/reliability.service.ts`; route `GET /brands/:brandId/analytics/reliability?days=28`
- Modify: `apps/web/src/features/overview/overview-dashboard.tsx` (thẻ "Tỉ lệ đăng thành công")
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`), `docs/verification/v1-acceptance.md` (mục `## GĐ1 dogfood` `Status: NOT_VERIFIED` cho tới khi đạt)
- Test: `tests/services/reliability.test.ts`

**Interfaces:**
- Produces: `ReliabilityService.summary(brandId:string, since:number):Promise<{published:number; failedPlatform:number; failedUser:number; successRate:number|null}>`. Công thức (roadmap mục 9, "không tính lỗi do người dùng"): `successRate = published / (published + failedPlatform)`; lỗi `VALIDATION_ERROR` và `AUTH_ERROR` tính là `failedUser`; mẫu số 0 → `null`.

- [ ] **Step 1: Viết test** cho công thức (8 published, 1 RATE_LIMIT cuối cùng FAILED, 1 VALIDATION_ERROR → 8/9) và mẫu số 0 → `null`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Đặt `MIN_NODE_TESTS`, `pnpm verify` → PASS. Điều kiện đóng GĐ1 (roadmap): ≥ 50 bài thật gồm ảnh, album, video; `successRate ≥ 0.98` trong 28 ngày dogfood — ghi Evidence `LOCAL` khi đạt.
- [ ] **Step 6: Commit** `feat(analytics): publishing reliability summary for the GĐ1 exit check`.

## Self-review

- M2 composer, sắp xếp album, cắt ảnh, ảnh bìa → Task 3–4; M3 lịch kéo thả, cảnh báo Telegram/Email → Task 1, 5, 6; workflow 8.1 chặng 3–4 → Task 4; chỉ số mục 9 (độ tin cậy, thời gian đăng) → Task 7 và E2E Task 4.
- Tên dùng chung: `CalendarEntry`, `PublishingService.listCalendar/reschedule`, `NotificationEvent`, `NotificationDispatcher.dispatch`, `ReliabilityService.summary`, `compose-model` actions.
