# DSM SP8 — Insights và Channel Growth Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thu thập số liệu thật của kênh và bài trên 4 nền tảng, rồi trả lời "kênh nào đang lớn, vì sao, làm gì tiếp" bằng dashboard tăng trưởng, mục tiêu và tần suất, content pillars, điểm sức khỏe kênh, giờ vàng, mốc kiếm tiền, đối thủ, lịch lễ/sale Việt Nam, link-in-bio và báo cáo tuần.

**Architecture:** Mỗi adapter có thêm `InsightsSource`. Worker chạy job lặp lấy snapshot hằng ngày (`ChannelSnapshot`) và số liệu bài (`PostMetric`, đã có). Mọi chỉ số tính bằng hàm thuần trong `packages/shared/src/growth/*`, nhận dữ liệu thô và trả kết quả kèm `source` + `capturedAt`; thiếu mẫu thì trả `insufficientData`, không ước lượng. API chỉ ghép dữ liệu và gọi các hàm này.

**Tech Stack:** TypeScript, Graph API Insights (metric `views`/`unique views` mới), Instagram Insights + Business Discovery, TikTok Display API (video list/query), YouTube Analytics API + Data API, node:test.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 2.2 điểm 3, 5 M4 và M6, GĐ3, 8.1 chặng 6, 9; mục 13 dòng SP8). Tiền đề: SP4, SP6, SP7.

## Quyết định trong plan (cần duyệt)

1. **Công thức điểm sức khỏe kênh (0–100)**, hiển thị từng thành phần:
   - Hồ sơ (15): có ảnh đại diện, mô tả, link → 5 điểm mỗi mục, chỉ tính mục API trả về được.
   - Tần suất (30): `min(1, số bài 28 ngày / mục tiêu 28 ngày) × 30`; chưa đặt mục tiêu thì thành phần này "chưa đặt" và các thành phần còn lại chia lại theo tỉ lệ.
   - Tăng trưởng (25): người theo dõi 28 ngày; tăng ≥ 5% → 25, giảm → 0, tuyến tính ở giữa.
   - Tương tác (20): (thích + bình luận + chia sẻ + lưu) / lượt xem của bài 28 ngày; ≥ 5% → 20, tuyến tính từ 0.
   - Độ tin cậy (10): tỉ lệ đăng thành công (SP5 `ReliabilityService`).
2. **Giờ vàng** chỉ hiện khi có ≥ **20** bài trong 90 ngày trên kênh đó; tính trung vị lượt xem 24 giờ đầu chuẩn hóa theo người theo dõi, nhóm theo (thứ, giờ) múi giờ brand.
3. **Mốc kiếm tiền** lưu dạng cấu hình có `validFrom` (nền tảng đổi ngưỡng). Giá trị ban đầu theo roadmap: YouTube 500 người đăng ký (fan funding/Shopping); 1 000 người đăng ký + 4 000 giờ xem công khai 12 tháng **hoặc** 10 triệu lượt xem Shorts 90 ngày; TikTok Creator Rewards: 10 000 người theo dõi, 100 000 lượt xem 30 ngày, video > 1 phút, 18+, quốc gia hỗ trợ (VN chưa xác minh → hiển thị "chưa xác nhận Việt Nam"). Facebook: không có ngưỡng cố định trong roadmap → chỉ hiện "kiểm tra trong Meta Business Suite".
4. Đối thủ: Instagram Business Discovery và YouTube `channels.list` công khai; Facebook/TikTok nhập tay số liệu (ghi rõ nguồn "nhập tay").
5. Lịch lễ/sale Việt Nam là file dữ liệu trong repo (`packages/shared/src/growth/vn-calendar.ts`), gồm ngày cố định (8/3, 30/4, 1/5, 2/9, 20/10, 20/11, 24/12), ngày sale đôi (1/1 … 12/12), Black Friday (thứ Sáu thứ tư của tháng 11), Tết âm lịch theo bảng năm 2027–2030 nhập sẵn.

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit); không gọi mạng thật trong test.
- Mọi số hiển thị có `source` (nền tảng/metric) và `capturedAt`; thiếu dữ liệu hiển thị `—` hoặc "Chưa đủ dữ liệu", không ước lượng (nguyên tắc 3 của roadmap).
- Facebook chỉ dùng metric mới (`page_total_media_view_unique`, `post_total_media_view_unique`, views); không dùng impressions/reach cũ.
- Snapshot chạy mỗi ngày lúc 02:00 giờ brand; mỗi (tài khoản, ngày) đúng một snapshot (unique).

## Review Focus

- Kênh mới kết nối hôm nay: dashboard không vẽ đường tăng trưởng giả từ một điểm → Task 3 test `một snapshot thì tăng trưởng là insufficientData`.
- Đổi múi giờ brand: snapshot ngày không bị nhân đôi → Task 2 test `snapshot unique theo tài khoản và ngày`.
- Nền tảng trả thiếu một metric (Facebook bỏ field): các metric khác vẫn lưu, metric thiếu là `null` → Task 1 test `thiếu metric lưu null không ném`.
- Kênh dưới 20 bài: không hiện giờ vàng, hiện số bài còn thiếu → Task 4 test `giờ vàng cần 20 bài`.
- Ngưỡng kiếm tiền đổi (YouTube tăng ngưỡng 2027): tiến độ dùng ngưỡng có hiệu lực tại ngày xem → Task 5 test `ngưỡng chọn theo validFrom`.

---

### Task 1: `InsightsSource` cho 4 nền tảng

**Files:**
- Create: `packages/platform-contracts/src/insights.ts`
- Modify: `facebook.adapter.ts`, `instagram.adapter.ts`, `tiktok.adapter.ts`, `youtube.adapter.ts` (hiện thực), OAuth scope thêm: Meta `read_insights`, `instagram_manage_insights`; TikTok `video.list`, `user.info.stats`; Google `yt-analytics.readonly` (kết nối lại để cấp thêm quyền — composer hiện nút "Cấp thêm quyền")
- Test: `tests/integrations/insights-*.test.ts` (một file mỗi nền tảng, dùng stub)

**Interfaces:**
- Produces:
  ```ts
  export interface AccountMetricPoint { day:string /*YYYY-MM-DD theo brand*/; followers:number|null; views:number|null; reach:number|null; engagements:number|null; profileViews:number|null; watchTimeMinutes:number|null; source:string; raw:Record<string,unknown> }
  export interface ProfileFacts { hasAvatar:boolean|null; hasBio:boolean|null; hasLink:boolean|null }
  export interface InsightsSource {
    fetchAccountDaily(account:SocialAccount, fromDay:string, toDay:string, timeZone:string):Promise<AccountMetricPoint[]>;
    fetchProfile(account:SocialAccount):Promise<ProfileFacts>;
    fetchPostMetrics(account:SocialAccount, platformPostId:string):Promise<PostMetricsData>;
  }
  ```

- [ ] **Step 1: Viết test** cho mỗi nền tảng: ánh xạ đúng metric từ phản hồi stub mẫu; `thiếu metric lưu null không ném`; lỗi quyền (`#10`, 403) → `PublishError AUTH_ERROR` với code `INSIGHTS_PERMISSION_MISSING`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(integrations): account and post insights for Facebook, Instagram, TikTok and YouTube`.

### Task 2: Snapshot hằng ngày

**Files:**
- Modify: domain/repositories/schema (`ChannelSnapshot {id; socialAccountId; day; followers; views; reach; engagements; profileViews; watchTimeMinutes; source; capturedAt; raw}`, unique `(socialAccountId, day)`), migration `0008_channel_snapshots`
- Create: `apps/worker/src/analytics/snapshot.job.ts`
- Test: `tests/analytics/snapshot-job.test.ts`

**Interfaces:**
- Produces: `runDailySnapshots(deps:{repos:Repositories; sources:Record<Platform,InsightsSource>; now:number}):Promise<{accounts:number; written:number; failed:{socialAccountId:string; code:string}[]}>`; job lặp BullMQ `analytics:snapshot` theo cron giờ brand (02:00).

- [ ] **Step 1: Viết test**: `snapshot unique theo tài khoản và ngày` (chạy hai lần cùng ngày → 1 bản ghi, lần hai cập nhật); `lỗi một tài khoản không chặn tài khoản khác`; `lần đầu lấy lùi 28 ngày nếu nền tảng cho phép`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(worker): daily channel snapshots`.

### Task 3: Hàm tăng trưởng, mục tiêu, pillar

**Files:**
- Create: `packages/shared/src/growth/growth.ts`, `packages/shared/src/growth/goals.ts`
- Modify: domain/repositories/schema (`ChannelGoal {id; socialAccountId; postsPer28Days:number; followersTarget?:number; targetDate?:string}`, `ContentPillar {id; brandId; name; color; description?}`, `ContentItem.pillarId?`), migration `0009_goals_pillars`
- Test: `tests/growth/growth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Insufficient = {insufficientData:true; needed:string};
  export function growthOverWindow(snapshots:ChannelSnapshot[], days:number):{followersDelta:number; followersPct:number|null; viewsSum:number|null}|Insufficient;
  export function cadence(postsAt:number[], goal:ChannelGoal|undefined, now:number):{posts28:number; target28:number|null; ratio:number|null; streakDays:number};
  export function byPillar(posts:{pillarId?:string; views:number|null; engagements:number|null}[]):{pillarId:string|'NONE'; posts:number; medianViews:number|null; engagementRate:number|null}[];
  ```

- [ ] **Step 1: Viết test**: `một snapshot thì tăng trưởng là insufficientData`; tăng 1 000 → 1 050 trong 28 ngày → `followersPct = 0.05`; `streakDays` đếm ngày liên tiếp có bài theo múi giờ brand; `byPillar` gom bài không pillar vào `'NONE'`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(shared): growth, cadence and pillar calculations`.

### Task 4: Điểm sức khỏe kênh và giờ vàng

**Files:**
- Create: `packages/shared/src/growth/health-score.ts`, `packages/shared/src/growth/best-time.ts`
- Test: `tests/growth/health-score.test.ts`, `tests/growth/best-time.test.ts`

**Interfaces:**
- Produces: `healthScore(input:{profile:ProfileFacts; cadence:ReturnType<typeof cadence>; growth:ReturnType<typeof growthOverWindow>; engagementRate:number|null; successRate:number|null}):{score:number|null; parts:{key:'profile'|'cadence'|'growth'|'engagement'|'reliability'; points:number|null; max:number; note?:string}[]}`; `BEST_TIME_MIN_POSTS = 20`; `bestTimes(posts:{publishedAt:number; views24h:number|null; followersAtPost:number|null}[], timeZone:string):{slots:{weekday:1|2|3|4|5|6|7; hour:number; score:number}[]}|Insufficient`.

- [ ] **Step 1: Viết test** theo đúng công thức ở "Quyết định trong plan" mục 1, điểm làm tròn bằng `Math.round`:
  - đủ hồ sơ (15), tần suất ratio 0,5 (15), tăng trưởng 2,5% (12,5), tương tác 2,5% (10), thành công 100% (10) → `score === 63`;
  - cùng số liệu nhưng chưa đặt mục tiêu (cadence `null`) → điểm chia lại trên 70: `Math.round(47.5 / 70 * 100) === 68`, phần `cadence` có `note: 'Chưa đặt mục tiêu'`;
  - mọi thành phần `null` → `score === null`; `giờ vàng cần 20 bài` (19 bài → `Insufficient` với `needed: 'Cần thêm 1 bài'`); 20 bài tập trung 20:00 thứ Sáu → slot cao nhất là (5, 20).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(shared): channel health score and best posting times`.

### Task 5: Mốc kiếm tiền, đối thủ, lịch Việt Nam

**Files:**
- Create: `packages/shared/src/growth/monetization.ts`, `packages/shared/src/growth/vn-calendar.ts`, `apps/api/src/modules/growth/competitors.service.ts`
- Modify: domain/repositories/schema (`Competitor {id; brandId; platform; handle; source:'API'|'MANUAL'}`, `CompetitorSnapshot {id; competitorId; day; followers|null; posts|null; source}`), migration `0010_competitors`
- Test: `tests/growth/monetization.test.ts`, `tests/growth/vn-calendar.test.ts`, `tests/integrations/competitors.test.ts`

**Interfaces:**
- Produces: `MONETIZATION_PROGRAMS:{id:string; platform:Platform; validFrom:string; requirements:{metric:'subscribers'|'publicWatchHours12m'|'shortsViews90d'|'followers'|'views30d'; min:number}[][] /* OR của các nhóm AND */; note?:string}[]`; `monetizationProgress(programId:string, facts:Record<string,number|null>, onDay:string):{groups:{met:boolean; items:{metric:string; value:number|null; min:number; pct:number|null}[]}[]; eta?:string}`; `vnEvents(year:number):{date:string; name:string; kind:'HOLIDAY'|'SALE'|'SEASON'}[]`.

- [ ] **Step 1: Viết test**: `ngưỡng chọn theo validFrom` (thêm bản ghi giả `validFrom 2027-02-01` với 8 000 giờ → ngày 2027-03-01 dùng ngưỡng mới, ngày 2026-12-01 dùng 4 000); YouTube: 1 200 người đăng ký + 3 000 giờ → nhóm 1 chưa đạt (giờ xem 75%); `vnEvents(2026)` có `2026-11-27` Black Friday và `2026-11-11` sale; competitor Instagram dùng `business_discovery` trả followers và số bài.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(growth): monetization progress, competitors and Vietnamese event calendar`.

### Task 6: Link-in-bio, UTM và click

**Files:**
- Create: `apps/api/src/modules/tracking/bio-page.service.ts`, `apps/web/src/app/b/[slug]/page.tsx` (trang công khai, không cần đăng nhập)
- Modify: `apps/api/src/modules/tracking/tracking.service.ts` (redirect `/r/:code` nối tham số UTM vào URL đích; route gắn tracked link vào bài đã đăng `POST /brands/:brandId/tracked-links/:id/bind`), domain/schema (`BioPage {id; brandId; slug unique; title; links:{trackedLinkId; label; position}[]}`), migration `0011_bio_pages`
- Test: `tests/tracking/utm-redirect.test.ts`, `tests/tracking/bio-page.test.ts`

- [ ] **Step 1: Viết test**: `redirect giữ query cũ và thêm utm_source, utm_medium, utm_campaign, utm_content` (URL đích có `?ref=1` → giữ `ref=1`); `bind tracked link vào published post và click được tính cho bài`; `bio page trả danh sách link theo position và ghi click qua /r/:code`. (Sửa hai hạn chế SP1 đã ghi: thiếu route gắn link, redirect bỏ UTM.)
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(tracking): link-in-bio pages, UTM-preserving redirects and post-bound links`.

### Task 7: Dashboard tăng trưởng và báo cáo tuần

**Files:**
- Create: `apps/api/src/modules/growth/growth.service.ts` (route `GET /brands/:brandId/growth?days=28`, `GET /brands/:brandId/growth/accounts/:id`), `apps/worker/src/analytics/weekly-report.job.ts`
- Create: `apps/web/src/app/app/brands/[brandId]/growth/page.tsx`, `apps/web/src/features/growth/*` (dashboard, thẻ sức khỏe, heatmap giờ vàng, tiến độ kiếm tiền, pillar, đối thủ), mục điều hướng "Xây kênh"
- Modify: `apps/web/src/features/calendar/calendar-grid.tsx` (hiển thị `vnEvents`)
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`; thêm spec E2E `growth dashboard` vào danh sách bắt buộc)
- Test: `tests/services/growth-service.test.ts`, `apps/web/tests/growth-dashboard.spec.ts`

- [ ] **Step 1: Viết test**: service trả mỗi chỉ số kèm `source` và `capturedAt`; báo cáo tuần (Email/Telegram qua `NotificationDispatcher` với sự kiện mới `WEEKLY_REPORT`) có 5 mục: số bài, lượt xem, người theo dõi tăng/giảm, bài tốt nhất, việc nên làm tuần tới (lấy từ thành phần sức khỏe thấp nhất). E2E: dữ liệu seed qua repository trong chế độ test → trang "Xây kênh" hiển thị điểm sức khỏe và heatmap; kênh dưới 20 bài hiện "Cần thêm N bài".
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Điều kiện đóng GĐ3: số liệu đối chiếu với công cụ gốc của từng nền tảng trên kênh dogfood, chênh lệch được giải thích trong `docs/verification/v1-acceptance.md` mục `## Growth metrics (SP8)`.
- [ ] **Step 5: Commit** `feat(growth): channel growth dashboard and weekly report`.

## Self-review

- M4 (mục tiêu, tần suất, pillar, sức khỏe, giờ vàng, mốc kiếm tiền, đối thủ; kế hoạch 30 ngày AI và thư viện hook để SP10) → Task 3–5, 7; M6 (insights, snapshot, dashboard, link-in-bio, UTM, báo cáo tuần) → Task 1, 2, 6, 7; M3 lịch lễ/sale → Task 5, 7.
- Tên dùng chung: `InsightsSource`, `ChannelSnapshot`, `growthOverWindow`, `cadence`, `healthScore`, `bestTimes`, `monetizationProgress`, `vnEvents`, `WEEKLY_REPORT`.
