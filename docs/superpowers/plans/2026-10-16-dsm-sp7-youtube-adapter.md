# DSM SP7 — Adapter YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kết nối kênh YouTube bằng Google OAuth và đăng video dài lẫn Shorts bằng resumable upload, có tiêu đề, mô tả, tag, danh mục, quyền riêng tư, giờ công bố (`publishAt`), ảnh bìa, playlist, và quản lý hạn mức upload theo project.

**Architecture:** `GoogleOAuthConnector` + `YouTubeAdapter` theo hợp đồng SP4. Upload chạy trong worker bằng giao thức resumable (phiên upload lưu `uploadUrl` + byte đã gửi vào `remoteCorrelationId`/metadata để tiếp tục sau khi lỗi). `QuotaManager` đếm lượt `videos.insert` theo ngày giờ Thái Bình Dương (cách YouTube reset quota) trong bảng `QuotaUsage`.

**Tech Stack:** TypeScript, YouTube Data API v3 (REST qua `fetch`, không dùng SDK `googleapis` để giữ nhẹ), Google OAuth 2.0, node:test + stub HTTP.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 3 dòng YouTube, 3.1 "YouTube không có API đăng ảnh", 5 M2, GĐ2; mục 13 dòng SP7). Tiền đề: SP3 (`SHORT` suy ra từ video dọc ≤ 180 giây, `YT_NO_IMAGE_API`), SP4, SP5.

## Quyết định trong plan (cần duyệt)

1. Scope tối thiểu: `https://www.googleapis.com/auth/youtube.upload` và `https://www.googleapis.com/auth/youtube.readonly` (liệt kê kênh, playlist). Scope insights (`yt-analytics.readonly`) xin ở SP8.
2. Lên lịch: nếu giờ đăng cách hiện tại > 15 phút, DSM upload sớm với `privacyStatus: 'private'` + `publishAt` để YouTube tự công bố đúng giờ (roadmap: "dùng publishAt"); nếu ≤ 15 phút, upload ở thời điểm đăng với quyền riêng tư đã chọn. Lịch trong DSM hiển thị trạng thái "Đã tải lên, chờ YouTube công bố".
3. Hạn mức: `YOUTUBE_DAILY_UPLOAD_LIMIT = 100` lượt `videos.insert`/ngày/project (theo trang `videos.insert` hiện hành, roadmap ghi cần xác minh) — là cấu hình. Hết hạn mức thì job dời sang 00:05 giờ Thái Bình Dương hôm sau, không đốt lượt retry.
4. Khi project chưa audit, YouTube khóa video ở private; composer hiện thông báo tương tự TikTok khi `YOUTUBE_API_AUDITED=0`.
5. Ảnh bìa tùy chỉnh chỉ đặt được với kênh đã xác minh; lỗi 403 khi đặt ảnh bìa không làm hỏng bài (bài vẫn PUBLISHED, ghi cảnh báo).

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit). Không gọi mạng thật trong test (`YOUTUBE_API_BASE_URL`, `GOOGLE_OAUTH_BASE_URL` trỏ stub).
- Tiêu đề ≤ **100** ký tự, mô tả ≤ **5000** ký tự (pre-flight SP3); YouTube không nhận bài ảnh (biến thể bị bỏ qua `YT_NO_IMAGE_API`).
- Shorts: video dọc, thời lượng ≤ **180** giây (SP3 `inferFormat`).
- Lỗi `quotaExceeded`/`uploadLimitExceeded` → `RATE_LIMIT` dời lịch; `401` → làm mới token một lần rồi `AUTH_ERROR`; `403 forbidden` khi đặt ảnh bìa → cảnh báo, không lỗi job.

## Review Focus

- Upload video 1 GB đứt mạng ở 70%: tiếp tục từ byte đã nhận, không upload lại từ đầu, không tạo video thứ hai → Task 3 test `resumable tiếp tục từ Range đã nhận`.
- Hết hạn mức giữa ngày: các job sau dời sang ngày mới, người dùng thấy lý do → Task 4 test `hết hạn mức dời sang 00:05 giờ Thái Bình Dương`.
- Người dùng đổi giờ đăng của video đã upload sớm với `publishAt`: cập nhật `publishAt` qua `videos.update`, không upload lại → Task 5 test `đổi lịch video đã upload chỉ cập nhật publishAt`.
- Token Google bị thu hồi (`invalid_grant`): tài khoản `EXPIRED`, thông báo theo SP5 → Task 1 test `invalid_grant đánh dấu EXPIRED`.
- Mô tả có ký tự `<` `>`: YouTube từ chối; pre-flight cảnh báo trước → Task 2 test `mô tả có dấu ngoặc nhọn bị chặn`.

---

### Task 1: Kết nối Google/YouTube

**Files:**
- Create: `apps/api/src/integrations/google/google-oauth.connector.ts`, `apps/api/src/integrations/google/google.config.ts`
- Modify: `apps/api/src/modules/integrations/integrations.service.ts`, `apps/api/src/runtime/local-api.ts` (`/integrations/google/start`, `/integrations/google/callback`), `.env.example` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `YOUTUBE_API_AUDITED`)
- Create: `tests/support/google-stub.ts`
- Test: `tests/integrations/google-connect.test.ts`

**Interfaces:**
- Produces: `GoogleOAuthConnector` (`provider:'GOOGLE'`, `access_type=offline`, `prompt=consent`, PKCE S256); `listAccounts` gọi `GET /youtube/v3/channels?part=snippet&mine=true` và trả một `ConnectableAccount` mỗi kênh (`platform:'YOUTUBE'`).

- [ ] **Step 1: Viết test**: `authorizeUrl có access_type offline và hai scope`; `confirm tạo SocialAccount YOUTUBE với refresh token mã hóa`; `invalid_grant đánh dấu EXPIRED` (refresh trả 400 `invalid_grant` → account `EXPIRED`, sự kiện `ACCOUNT_EXPIRED` gửi tới dispatcher).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(integrations): connect YouTube channels with Google OAuth`.

### Task 2: Trường riêng YouTube và pre-flight

**Files:**
- Modify: `packages/shared/src/domain.ts` (`ContentVariant` thêm `youtube?:{categoryId:string; tags:string[]; privacyStatus:'public'|'unlisted'|'private'; playlistId?:string; madeForKids:boolean}`), repositories, schema + migration `0006_youtube_fields`
- Modify: `packages/shared/src/preflight.ts`
- Test: `tests/shared/preflight-youtube.test.ts`

- [ ] **Step 1: Viết test**: `mô tả có dấu ngoặc nhọn bị chặn` (`YT_DESCRIPTION_ANGLE_BRACKETS`); `tổng độ dài tag quá 500 ký tự lỗi YT_TAGS_TOO_LONG`; `thiếu madeForKids lỗi YT_MADE_FOR_KIDS_REQUIRED` (bắt buộc khai báo theo chính sách YouTube).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(shared): YouTube variant fields and preflight rules`.

### Task 3: `YouTubeAdapter` upload resumable

**Files:**
- Create: `apps/api/src/integrations/google/youtube.adapter.ts`, `apps/api/src/integrations/google/resumable-upload.ts`
- Modify: registry trong `createRuntime` (đăng ký `YOUTUBE:API`)
- Test: `tests/integrations/youtube-upload.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ResumableSession { uploadUrl:string; totalBytes:number; confirmedBytes:number }
  export async function startResumable(opts:{baseUrl:string; token:string; metadata:Record<string,unknown>; totalBytes:number; mimeType:string}):Promise<ResumableSession>;
  export async function sendChunks(session:ResumableSession, read:(start:number,end:number)=>Promise<Buffer>, opts:{chunkBytes:number /* bội số 256 KiB, mặc định 8 MiB */; token:string}):Promise<{videoId:string}|{session:ResumableSession}>;
  export async function queryProgress(session:ResumableSession, token:string):Promise<ResumableSession>; // PUT rỗng với Content-Range: bytes */total
  export class YouTubeAdapter implements PlatformAdapter { constructor(deps:{baseUrl:string; tokens:(id:string)=>Promise<string>; storage:ObjectStorage; quota:QuotaManager; audited:boolean}) }
  ```

- [ ] **Step 1: Viết test**: `metadata gửi đúng snippet và status` (tiêu đề, mô tả, tag, `categoryId`, `privacyStatus`, `selfDeclaredMadeForKids`); `resumable tiếp tục từ Range đã nhận` (stub cắt kết nối sau 2 chunk; lần sau `queryProgress` nhận `Range: bytes=0-16777215` → gửi tiếp từ byte 16 777 216; chỉ một phiên `uploadType=resumable` được mở); `SHORT không cần đánh dấu riêng, chỉ tỉ lệ dọc và thời lượng`; `playlistItems.insert sau khi có videoId nếu có playlistId`; `ảnh bìa 403 vẫn PUBLISHED kèm cảnh báo`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Phiên upload lưu trong `PublishJob.remoteCorrelationId` dạng `resumable:<uploadUrl>` để worker khác tiếp tục.
- [ ] **Step 5: Commit** `feat(integrations): upload YouTube videos and Shorts with resumable uploads`.

### Task 4: Quản lý hạn mức

**Files:**
- Create: `packages/shared/src/quota.ts`
- Modify: domain/repositories/schema (`QuotaUsage {id; provider:'YOUTUBE'|'INSTAGRAM'; scope:string; day:string; used:number}`), migration `0007_quota_usage`
- Modify: `apps/api/src/integrations/meta/instagram.adapter.ts` (dùng `QuotaManager` cho đếm cục bộ bên cạnh `content_publishing_limit`)
- Test: `tests/shared/quota.test.ts`

**Interfaces:**
- Produces: `export class QuotaManager { constructor(repos:Repositories, now:()=>number); tryConsume(provider:'YOUTUBE'|'INSTAGRAM', scope:string, limit:number):Promise<{ok:true}|{ok:false; retryAt:number}>; usage(provider, scope):Promise<{used:number; limit:number; resetsAt:number}> }`; `pacificDayKey(ms:number):string` (ngày theo `America/Los_Angeles`).

- [ ] **Step 1: Viết test**: `hết hạn mức dời sang 00:05 giờ Thái Bình Dương` (`limit 2`, tiêu thụ 3 lần → lần 3 `ok:false`, `retryAt` = 00:05 ngày kế theo `America/Los_Angeles`); `gọi song song không vượt limit` (`Promise.all` 5 lần, `limit 3` → đúng 3 `ok:true`; dùng `claim`-style cập nhật có điều kiện).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(shared): per-project upload quota manager`.

### Task 5: Lên lịch bằng `publishAt` và đổi lịch

**Files:**
- Modify: `apps/api/src/modules/publishing/publishing.service.ts` (job YouTube có `scheduledAt` > now + 15 phút được đưa vào hàng đợi ngay để upload sớm), `youtube.adapter.ts` (`reschedule`), `PublishingService.reschedule` (SP5) gọi adapter khi job YouTube đã upload
- Test: `tests/integrations/youtube-schedule.test.ts`

**Interfaces:**
- Produces: `YouTubeAdapter.reschedule(input:{socialAccountId:string; videoId:string; publishAt:number}):Promise<void>` (`videos.update` part `status`); `JobStatus` của job đã upload chờ công bố: `PROCESSING` với `remoteCorrelationId = video:<id>`, lịch hiển thị "Chờ YouTube công bố".

- [ ] **Step 1: Viết test**: `lên lịch xa upload sớm với private và publishAt`; `đổi lịch video đã upload chỉ cập nhật publishAt` (không có lời gọi upload mới); `poll sau publishAt chốt PUBLISHED khi status.privacyStatus thành public`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(publishing): schedule YouTube uploads with publishAt and reschedule in place`.

### Task 6: Giao diện YouTube trong composer, hồ sơ audit

**Files:**
- Create: `apps/web/src/features/compose/youtube-settings.tsx`, `youtube-settings-model.ts`; route `GET /brands/:brandId/accounts/:id/youtube/playlists`, `GET /youtube/categories?regionCode=VN`
- Create: `docs/runbooks/google-oauth-youtube-audit.md` (Google OAuth verification cho scope nhạy cảm, YouTube API Services audit, video demo, chính sách)
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`), `docs/verification/v1-acceptance.md` (thêm `## YouTube live publish` `Status: BLOCKED_EXTERNAL — chờ audit`)
- Test: `tests/web/youtube-settings-model.test.ts`

- [ ] **Step 1: Viết test**: `tiêu đề mặc định lấy từ tiêu đề nội dung gốc và cắt ở 100 ký tự kèm cảnh báo`; `chưa audit hiện thông báo private`; `bắt buộc chọn Dành cho trẻ em hay không`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Đặt `MIN_NODE_TESTS`, `pnpm verify` → PASS. Điều kiện đóng GĐ2: 1 video gốc lên đủ 4 nền tảng và 1 album lên FB/IG/TikTok từ một composer (E2E `compose journey` mở rộng với FakePublisher), ba hồ sơ đã nộp.
- [ ] **Step 6: Commit** `feat(web): YouTube settings in the composer`.

## Self-review

- Roadmap mục 3 dòng YouTube (audit, scope, quota, publishAt) → Task 1, 4, 5, 6; GĐ2 YouTube (resumable, metadata, Shorts, ảnh bìa, playlist, quota manager, bỏ qua bài ảnh) → Task 2–5.
- Tên dùng chung: `GoogleOAuthConnector`, `YouTubeAdapter.reschedule`, `QuotaManager.tryConsume/usage`, `pacificDayKey`.
