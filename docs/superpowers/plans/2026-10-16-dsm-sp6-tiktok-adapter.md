# DSM SP6 — Adapter TikTok (video + ảnh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kết nối tài khoản TikTok bằng Login Kit và đăng video (Direct Post, upload theo chunk) cùng bài ảnh/carousel ảnh (tối đa 35, qua `PULL_FROM_URL` từ domain đã xác minh), tuân thủ hướng dẫn UX của TikTok và hiển thị rõ giới hạn khi app chưa audit.

**Architecture:** Gom các lớp TikTok hiện có (`TikTokHttpClient`, `TikTokOAuthService`, `TikTokUploadService`, `TikTokStatusService`, `TikTokCreatorInfoService`, `TikTokValidation`, `TikTokPublisher`) thành `TikTokOAuthConnector` + `TikTokAdapter` theo hợp đồng của SP4. Thông tin creator (`creator_info`) được lấy khi mở composer và lưu tạm vào biến thể để giao diện dựng ô chọn quyền riêng tư đúng quy định. Một bộ giới hạn tốc độ theo token (6 request/phút) bọc mọi lời gọi.

**Tech Stack:** TypeScript, TikTok Content Posting API v2, Login Kit, node:test với stub HTTP.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 3, 3.1 ràng buộc TikTok, 5 M2, GĐ2, 8.3; mục 13 dòng SP6). Tiền đề: SP3 (media, `PUBLIC_MEDIA_BASE_URL`), SP4 (hợp đồng adapter, `IntegrationsService`, `JobRunner.poll`), SP5 (composer).

## Quyết định trong plan (cần duyệt)

1. Chế độ đăng mặc định là **Direct Post**. Khi app chưa audit (`TIKTOK_DIRECT_POST_APPROVED=0`, biến đã có trong `.env.example`), chỉ cho chọn quyền riêng tư `SELF_ONLY` và composer hiện dòng "App chưa được TikTok duyệt: bài chỉ đăng ở chế độ riêng tư".
2. Video dùng `FILE_UPLOAD` (không cần xác minh domain); ảnh bắt buộc `PULL_FROM_URL` với URL dưới `PUBLIC_MEDIA_BASE_URL`. Nếu biến này trống, biến thể TikTok dạng ảnh bị chặn bằng lỗi pre-flight `TT_MEDIA_DOMAIN_NOT_CONFIGURED`.
3. Theo hướng dẫn UX của TikTok, composer **không có giá trị mặc định** cho quyền riêng tư; người dùng phải chọn. Các tùy chọn bình luận/duet/stitch lấy theo `creator_info` (tắt và khóa nếu creator đã tắt).
4. Không chèn logo, watermark hay chữ quảng bá vào nội dung gửi TikTok (roadmap 3); brand kit của SP11 bỏ qua TikTok.

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit). Không gọi mạng thật trong test.
- Giới hạn: tối đa **6 request/phút** cho mỗi access token người dùng; ảnh tối đa **35**; `privacy_level` gửi lên phải nằm trong `privacy_level_options` mà `creator_info` trả về; thời lượng video không vượt `max_video_post_duration_sec`.
- Lỗi `url_ownership_unverified` → `VALIDATION_ERROR` không retry, thông điệp "Domain media chưa được xác minh với TikTok".
- Lỗi `unaudited_client_can_only_post_to_private_accounts` → `VALIDATION_ERROR` không retry, gợi ý chọn `SELF_ONLY`.

## Review Focus

- Creator đổi cài đặt (tắt bình luận) giữa lúc soạn và lúc đăng: lấy lại `creator_info` ngay trước khi đăng và chặn nếu lựa chọn không còn hợp lệ → Task 3 test `creator_info lấy lại lúc đăng`.
- Nhiều job TikTok cùng tài khoản đến hạn cùng lúc: không vượt 6 request/phút, job chờ chứ không lỗi → Task 2 test `rate limiter xếp hàng request thứ bảy`.
- Video lớn bị mạng ngắt giữa chừng: chỉ upload lại chunk lỗi, không tạo lại bài → Task 3 test `upload chunk lỗi được thử lại đúng chunk đó`.
- Ảnh không thuộc domain đã xác minh: chặn ở pre-flight trước khi gọi TikTok → Task 4 test `ảnh ngoài PUBLIC_MEDIA_BASE_URL bị chặn ở preflight`.
- Bài đăng xong nhưng TikTok còn duyệt (`PROCESSING_DOWNLOAD`, `PROCESSING_UPLOAD`): poll tới `PUBLISH_COMPLETE` hoặc `FAILED` → Task 5 test `poll trạng thái tới PUBLISH_COMPLETE`.

---

### Task 1: Kết nối TikTok qua `IntegrationsService`

**Files:**
- Modify: `apps/api/src/integrations/tiktok/tiktok-oauth.service.ts` (hiện thực `OAuthConnector`, export `TikTokOAuthConnector`; PKCE `code_verifier` lưu trong `OAuthPending`), `apps/api/src/integrations/tiktok/tiktok.config.ts`
- Modify: `apps/api/src/modules/integrations/integrations.service.ts` (đăng ký provider `TIKTOK`), `apps/api/src/runtime/local-api.ts` (`/integrations/tiktok/start`, `/integrations/tiktok/callback`)
- Create: `tests/support/tiktok-stub.ts`
- Test: `tests/integrations/tiktok-connect.test.ts`

**Interfaces:**
- Consumes: `OAuthConnector`, `IntegrationsService.start/pending/confirm`, `signState/verifyState` (SP4).
- Produces: `TikTokOAuthConnector` với scope `user.info.basic,video.publish,video.upload`; `listAccounts` trả đúng một `ConnectableAccount` (`platformAccountId = open_id`).

- [ ] **Step 1: Viết test**: `authorizeUrl có client_key, scope, code_challenge S256 và state`; `exchangeCode gửi code_verifier đúng`; `confirm tạo SocialAccount TIKTOK CONNECTED với refresh token mã hóa`; `refreshToken dùng refresh_token và cập nhật expiresAt` (access token TikTok 24 giờ).
- [ ] **Step 2–4:** FAIL → hiện thực (giữ hành vi đúng của `TikTokOAuthService` cũ) → PASS.
- [ ] **Step 5: Commit** `feat(integrations): connect TikTok accounts with Login Kit and PKCE`.

### Task 2: Giới hạn tốc độ theo token

**Files:**
- Create: `packages/shared/src/rate-limiter.ts`
- Modify: `apps/api/src/integrations/tiktok/tiktok-http.client.ts` (mọi request đi qua limiter theo `socialAccountId`)
- Test: `tests/shared/rate-limiter.test.ts`

**Interfaces:**
- Produces: `export class SlidingWindowLimiter { constructor(opts:{limit:number; windowMs:number; now?:()=>number; sleep?:(ms:number)=>Promise<void>}); acquire(key:string):Promise<void> }`; `TIKTOK_REQUESTS_PER_MINUTE = 6`.

- [ ] **Step 1: Viết test** với đồng hồ giả: `rate limiter xếp hàng request thứ bảy` (7 lần `acquire('a')` liên tiếp → 6 lần trả ngay, lần 7 chờ tới mốc 60 000 ms); `khóa khác nhau không chặn nhau`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Limiter chạy trong process worker; nhiều worker thì dùng thêm khóa Redis ở SP11 (ghi chú, không làm ở đây).
- [ ] **Step 5: Commit** `feat(shared): sliding window rate limiter for per-token API limits`.

### Task 3: `TikTokAdapter` đăng video

**Files:**
- Create: `apps/api/src/integrations/tiktok/tiktok.adapter.ts`
- Modify: `apps/api/src/modules/publishing/platforms/tiktok/*` (dồn logic vào adapter; xóa `tiktok.publisher.ts` sau khi registry trỏ sang adapter)
- Test: `tests/integrations/tiktok-video.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class TikTokAdapter implements PlatformAdapter { constructor(deps:{http:TikTokHttpClient; tokens:(socialAccountId:string)=>Promise<string>; auditApproved:boolean; publicMediaBaseUrl?:string}) }
  export interface TikTokPostSettings { privacyLevel:string; disableComment:boolean; disableDuet:boolean; disableStitch:boolean; brandContentToggle:boolean; brandOrganicToggle:boolean }
  // PublishInput.metadata.tiktok: TikTokPostSettings (composer ghi khi người dùng chọn)
  ```

- [ ] **Step 1: Viết test**:
  - `creator_info lấy lại lúc đăng` (stub đổi `comment_disabled` thành true sau khi soạn; settings có `disableComment:false` → `PublishError VALIDATION_ERROR` `TT_SETTINGS_OUTDATED`).
  - `privacy ngoài danh sách creator_info bị từ chối`.
  - `chưa audit chỉ cho SELF_ONLY` (`auditApproved:false`, chọn `PUBLIC_TO_EVERYONE` → `TT_UNAUDITED_PRIVATE_ONLY`).
  - `video đăng bằng init FILE_UPLOAD rồi PUT theo chunk` (file 25 MB → số chunk và header `Content-Range` theo `planChunks` hiện có).
  - `upload chunk lỗi được thử lại đúng chunk đó` (stub trả 500 một lần ở chunk 2 → chỉ chunk 2 gửi lại, không gọi `init` lần hai).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. `publish` trả `{processing:true, remoteCorrelationId: publish_id}`.
- [ ] **Step 5: Commit** `feat(integrations): publish TikTok videos with Direct Post and chunked upload`.

### Task 4: Bài ảnh và carousel ảnh

**Files:**
- Modify: `apps/api/src/integrations/tiktok/tiktok.adapter.ts`, `packages/shared/src/preflight.ts` (lỗi `TT_MEDIA_DOMAIN_NOT_CONFIGURED`, `TT_MEDIA_URL_NOT_PUBLIC`)
- Test: `tests/integrations/tiktok-photo.test.ts`

- [ ] **Step 1: Viết test**: `ALBUM gửi content/init media_type PHOTO, source PULL_FROM_URL, photo_images theo thứ tự, photo_cover_index theo isCover`; `ảnh ngoài PUBLIC_MEDIA_BASE_URL bị chặn ở preflight`; `url_ownership_unverified ánh xạ VALIDATION_ERROR không retry`; `36 ảnh lỗi TT_ALBUM_MAX trước khi gọi API`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(integrations): publish TikTok photo posts from the verified media domain`.

### Task 5: Poll trạng thái và lấy link bài

**Files:**
- Modify: `apps/api/src/integrations/tiktok/tiktok.adapter.ts` (`pollStatus` dùng `TikTokStatusService` hiện có)
- Test: `tests/integrations/tiktok-status.test.ts`

- [ ] **Step 1: Viết test**: `poll trạng thái tới PUBLISH_COMPLETE` (chuỗi `PROCESSING_UPLOAD` → `PROCESSING_DOWNLOAD` → `PUBLISH_COMPLETE` có `publicaly_available_post_id`; kết quả `externalPostId` và `externalUrl = https://www.tiktok.com/@<username>/video/<id>`); `FAILED với fail_reason trả PublishError PLATFORM_ERROR không retry`; bài `SELF_ONLY` hoàn tất mà không có post id công khai → PUBLISHED, `externalUrl` để trống, ghi chú "Bài riêng tư".
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(integrations): track TikTok publish status until completion`.

### Task 6: Giao diện TikTok trong composer và hồ sơ audit

**Files:**
- Create: `apps/web/src/features/compose/tiktok-settings.tsx`, `apps/web/src/features/compose/tiktok-settings-model.ts`
- Modify: `apps/web/src/features/compose/compose-model.ts` (biến thể TikTok mang `TikTokPostSettings`), route `GET /brands/:brandId/accounts/:id/tiktok/creator-info`
- Create: `docs/runbooks/tiktok-audit.md` (checklist nộp audit: video demo luồng đăng, ảnh chụp ô chọn quyền riêng tư không có mặc định, xác minh domain media, trang chính sách)
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`), `docs/verification/v1-acceptance.md` (`## TikTok live publish` giữ `BLOCKED_EXTERNAL — chờ audit`, thêm dòng hướng dẫn)
- Test: `tests/web/tiktok-settings-model.test.ts`

**Interfaces:**
- Produces: `tiktokSettingsState(creatorInfo:TikTokCreatorInfo, auditApproved:boolean):{privacyOptions:{value:string; label:string}[]; privacyRequired:true; commentLocked:boolean; duetLocked:boolean; stitchLocked:boolean; notice?:string}`; `canSubmit(settings:Partial<TikTokPostSettings>, state):boolean`.

- [ ] **Step 1: Viết test**: `không có privacy mặc định nên chưa submit được`; `creator tắt duet thì khóa ô duet`; `chưa audit chỉ hiện Chỉ mình tôi và có notice`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Nhãn tiếng Việt: `PUBLIC_TO_EVERYONE` "Mọi người", `MUTUAL_FOLLOW_FRIENDS` "Bạn bè", `FOLLOWER_OF_CREATOR` "Người theo dõi", `SELF_ONLY` "Chỉ mình tôi".
- [ ] **Step 5:** Đặt `MIN_NODE_TESTS`, `pnpm verify` → PASS.
- [ ] **Step 6: Commit** `feat(web): TikTok posting settings that follow TikTok UX rules`.

## Self-review

- Roadmap 3.1 (TikTok ảnh, PULL_FROM_URL, 6 request/phút, 35 ảnh, không watermark) → Task 2, 4; GĐ2 TikTok (Login Kit, creator_info, upload chunk, trạng thái, thông báo chưa audit, nộp audit) → Task 1, 3, 5, 6.
- Tên dùng chung: `TikTokAdapter`, `TikTokPostSettings`, `SlidingWindowLimiter`, `TIKTOK_REQUESTS_PER_MINUTE`.
