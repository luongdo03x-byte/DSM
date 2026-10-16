# DSM SP4 — Adapter Meta: Facebook Page + Instagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kết nối Facebook Page và Instagram Business/Creator bằng OAuth chính thức và đăng thật mọi định dạng roadmap yêu cầu: FB chữ, link, ảnh đơn, nhiều ảnh, video, Reels; IG ảnh, carousel, Reels, Story.

**Architecture:** Định nghĩa `PlatformAdapter` (mở rộng `PlatformPublisher` hiện có) và `OAuthConnector` trong `packages/platform-contracts`. Một `MetaGraphClient` dùng chung cho FB và IG; hai adapter `FacebookAdapter`, `InstagramAdapter` thay publisher cũ. Đăng bất đồng bộ (container IG, video FB) trả `processing: true` và job chuyển `PROCESSING`; worker gọi `pollStatus`. Test chạy với stub server Graph API cục bộ, không gọi mạng thật.

**Tech Stack:** TypeScript, `fetch` của Node, Meta Graph API (phiên bản cấu hình `META_GRAPH_VERSION`), node:test, stub HTTP bằng `node:http`.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 3, 3.1, 5 M1/M2/M3, 6 quyết định 3, 5, 6; GĐ1; mục 13 dòng SP4). Tiền đề: SP2, SP3.

## Quyết định trong plan (cần duyệt)

1. Một Meta app; luồng "Facebook Login for Business" cấp quyền Page và Instagram gắn Page. Instagram Login (không cần Page) để sau, vì cùng hồ sơ App Review và ít khách VN dùng IG không gắn Page.
2. Quyền xin: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`. Quyền bình luận/insights xin ở SP8/SP9.
3. Lưu Page access token (dài hạn) cho từng Page; user token dài hạn chỉ dùng để làm mới và liệt kê Page. Job làm mới chạy hằng ngày, cảnh báo khi còn ≤ 7 ngày.
4. Facebook Reels đăng qua `/{page-id}/video_reels` (upload phase start/finish); video ngang qua `/{page-id}/videos`.
5. Webhook Meta (bình luận) để SP9; SP4 chỉ thêm endpoint xóa dữ liệu (`data_deletion`) và trang hướng dẫn, vì App Review bắt buộc.

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit).
- Không gọi mạng thật trong `pnpm test`: mọi base URL lấy từ `META_GRAPH_BASE_URL`; test trỏ về stub `127.0.0.1`. Fetch guard của HTTP smoke vẫn áp dụng.
- Token chỉ lưu dạng mã hóa (`EncryptedCredential`); không log token; lỗi trả về người dùng không chứa token.
- Giới hạn từ roadmap: Instagram 100 bài API/24 giờ (kiểm bằng `content_publishing_limit`), carousel ≤ 10, chỉ JPEG, ≤ 5 hashtag; FB ảnh chưa đăng hết hạn ~24 giờ → upload trong cùng lần đăng.
- Ánh xạ lỗi: HTTP 429 hoặc Graph code 4/17/32/613 → `RATE_LIMIT` (retryable, đọc `x-business-use-case-usage` để đặt `retryAfterMs`); code 190 → `AUTH_ERROR` (không retry, tài khoản chuyển `EXPIRED`); code 100 → `VALIDATION_ERROR`; 5xx/timeout → `NETWORK_ERROR` retryable.

## Review Focus

- Token Page bị thu hồi giữa lúc có job đã lên lịch: job thất bại không retry, tài khoản `EXPIRED`, có cảnh báo → Task 6 test `lỗi 190 đánh dấu tài khoản EXPIRED`.
- Container Instagram còn `IN_PROGRESS` lâu: không publish sớm, poll tới `FINISHED` hoặc hết hạn 10 phút → Task 4 test `container IN_PROGRESS được poll tới FINISHED`.
- Đăng trùng khi worker retry sau timeout mạng: dùng `idempotencyKey` kiểm bài đã có trước khi tạo lại → Task 3 test `retry sau timeout không tạo bài thứ hai`.
- Vượt 100 bài/24 giờ của Instagram: lỗi rõ `IG_DAILY_LIMIT`, job dời lịch, không đốt lượt retry → Task 4 test `vượt content_publishing_limit dời lịch`.
- Người dùng có nhiều Page và IG: chỉ kết nối Page được chọn, không tự kết nối tất cả → Task 2 test `callback chỉ tạo tài khoản cho Page đã chọn`.

---

### Task 1: Hợp đồng adapter và OAuth

**Files:**
- Create: `packages/platform-contracts/src/adapter.ts`, `packages/platform-contracts/src/oauth.ts`
- Modify: `packages/platform-contracts/src/index.ts` (re-export)
- Create: `apps/api/src/modules/integrations/oauth-state.ts`
- Test: `tests/integrations/oauth-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AdapterCapabilities { platform:Platform; rule:PlatformRule; dailyPublishLimit?:number }
  export interface TokenRefreshResult { refreshed:boolean; expiresAt?:number }
  export interface PlatformAdapter extends PlatformPublisher {
    readonly platform:Platform;
    capabilities(account:SocialAccount):AdapterCapabilities;
    pollStatus(input:{socialAccountId:string; remoteCorrelationId:string}):Promise<PublishResult>;
    refreshToken(account:SocialAccount):Promise<TokenRefreshResult>;
  }
  export interface OAuthTokens { accessToken:string; refreshToken?:string; expiresAt?:number; scopes:string[] }
  export interface ConnectableAccount { platformAccountId:string; platform:Platform; displayName:string; username?:string; pictureUrl?:string; tokens:OAuthTokens }
  export interface OAuthConnector {
    readonly provider:'META'|'TIKTOK'|'GOOGLE';
    authorizeUrl(state:string, redirectUri:string):string;
    exchangeCode(code:string, redirectUri:string):Promise<OAuthTokens>;
    listAccounts(tokens:OAuthTokens):Promise<ConnectableAccount[]>;
  }
  // oauth-state.ts
  export function signState(payload:{brandId:string; userId:string; provider:string; nonce:string}, secret:string, now:number):string;
  export function verifyState(state:string, secret:string, now:number):{brandId:string; userId:string; provider:string; nonce:string}; // ném 'OAUTH_STATE_INVALID' | 'OAUTH_STATE_EXPIRED'
  export const OAUTH_STATE_TTL_MS = 10 * 60_000;
  ```

- [ ] **Step 1: Viết test**: `state hợp lệ được giải đúng`, `state sửa một ký tự ném OAUTH_STATE_INVALID`, `state quá 10 phút ném OAUTH_STATE_EXPIRED`.
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Hiện thực** (HMAC-SHA256 trên JSON base64url, so sánh `timingSafeEqual`). **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat(contracts): add platform adapter and OAuth connector contracts`.

### Task 2: Kết nối Meta (OAuth, chọn Page/IG, lưu token)

**Files:**
- Modify: `apps/api/src/integrations/meta/meta-http.client.ts` (đổi thành `MetaGraphClient` với interface dưới đây; giữ export cũ làm alias tới khi không còn chỗ dùng), `apps/api/src/integrations/meta/meta-oauth.service.ts` (hiện thực `OAuthConnector`, export `MetaOAuthConnector`), `apps/api/src/integrations/meta/meta.config.ts` (thêm `redirectUri`, `stateSecret`)
- Create: `apps/api/src/modules/integrations/integrations.service.ts`
- Modify: `apps/api/src/runtime/local-api.ts`, `.env.example` (`META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `OAUTH_STATE_SECRET`)
- Create: `tests/support/meta-graph-stub.ts`
- Test: `tests/integrations/meta-connect.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class MetaGraphClient { constructor(opts:{baseUrl:string; version:string; fetchImpl?:typeof fetch});
    get<T>(path:string, token:string, params?:Record<string,string>):Promise<T>;
    post<T>(path:string, token:string, body:Record<string,unknown>|FormData):Promise<T>; } // ném PublishError đã ánh xạ
  IntegrationsService.start(provider:'META', brandId:string, userId:string):Promise<{url:string}>
  IntegrationsService.pending(stateToken:string):Promise<ConnectableAccount[]>      // sau callback, trước khi chọn
  IntegrationsService.confirm(stateToken:string, platformAccountIds:string[]):Promise<SocialAccount[]>
  export function startMetaGraphStub():Promise<{url:string; calls:{method:string; path:string; body:unknown}[]; setResponse(route:string, handler:(req)=>{status:number; body:unknown}):void; close():Promise<void>}>
  ```
  Route: `GET /integrations/meta/start?brandId=` → 302; `GET /integrations/meta/callback?code&state` → 302 về `/app/brands/:brandId/accounts?connect=<token>`; `GET /brands/:brandId/integrations/pending?token=` → danh sách; `POST /brands/:brandId/integrations/confirm` body `{token, platformAccountIds}`.

- [ ] **Step 1: Viết stub và test**:
  - `exchangeCode đổi sang token dài hạn` (stub `/oauth/access_token` hai lần: code→short, `fb_exchange_token`→long).
  - `listAccounts trả Page và IG gắn Page` (`/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`).
  - `callback chỉ tạo tài khoản cho Page đã chọn` (stub có 2 Page + 1 IG; confirm 1 Page → 1 `SocialAccount` FACEBOOK `CONNECTED`, credential mã hóa, không có tài khoản thứ hai).
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Hiện thực** (đọc trước `meta-http.client.ts`, `meta-oauth.service.ts` hiện có và giữ hành vi đúng của chúng). Tài khoản mới có `publishMode: 'API'`. Kết quả callback lưu tạm 15 phút trong bảng `OAuthPending` (thêm vào `Repositories` và schema, migration `0004_oauth_pending`). **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat(api): connect Facebook Pages and Instagram accounts through Meta OAuth`.

### Task 3: `FacebookAdapter`

**Files:**
- Create: `apps/api/src/integrations/meta/facebook.adapter.ts`
- Delete: `apps/api/src/modules/publishing/platforms/facebook/facebook.publisher.ts` (thay bằng adapter; registry đăng ký adapter cho `FACEBOOK:API`)
- Test: `tests/integrations/facebook-adapter.test.ts`

**Interfaces:**
- Consumes: `MetaGraphClient`, `PublishInput.media` (SP3), `MEDIA_RULES`.
- Produces: `export class FacebookAdapter implements PlatformAdapter { constructor(deps:{graph:MetaGraphClient; tokens:(socialAccountId:string)=>Promise<string>}) }`.

- [ ] **Step 1: Viết test** (stub ghi lại request, assert đúng endpoint và tham số):
  - `TEXT đăng lên /{page}/feed với message`; `LINK thêm link`.
  - `IMAGE đăng /{page}/photos với url`.
  - `ALBUM upload từng ảnh published=false rồi feed với attached_media đúng thứ tự` (3 ảnh → 3 POST `/photos` có `published:false`, rồi POST `/feed` có `attached_media[0..2]={"media_fbid":…}` theo position).
  - `VIDEO dùng /{page}/videos và trả processing`; `REEL dùng video_reels start → upload → finish`.
  - `retry sau timeout không tạo bài thứ hai`: stub `/feed` tạo bài (trả id) nhưng phản hồi chậm hơn timeout của client, lần retry stub trả bình thường. Cơ chế: adapter đặt timeout 30 giây; `JobRunner` lưu `remoteCorrelationId` ngay khi có id; khi retry mà job đã có `remoteCorrelationId` thì gọi `fetchPost` và chốt PUBLISHED thay vì đăng lại. Với trường hợp timeout trước khi có id, adapter trước khi đăng lại gọi `GET /{page}/published_posts?since=<thời điểm lần thử trước>&fields=message,id` và coi là đã đăng nếu có bài có `message` trùng khớp. Test assert chỉ có 1 bài được tạo trong stub.
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Hiện thực.** `fetchPost` dùng `GET /{post-id}?fields=permalink_url,created_time`. **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat(integrations): publish text, links, photos, albums, videos and reels to Facebook Pages`.

### Task 4: `InstagramAdapter`

**Files:**
- Create: `apps/api/src/integrations/meta/instagram.adapter.ts`
- Delete: `apps/api/src/modules/publishing/platforms/instagram/instagram.publisher.ts`
- Test: `tests/integrations/instagram-adapter.test.ts`

**Interfaces:**
- Produces: `export class InstagramAdapter implements PlatformAdapter` (cùng dạng constructor như FacebookAdapter); `export const IG_CONTAINER_TIMEOUT_MS = 10 * 60_000`.

- [ ] **Step 1: Viết test**:
  - `IMAGE tạo container image_url rồi media_publish`.
  - `ALBUM tạo container con is_carousel_item cho từng ảnh rồi container CAROUSEL children theo thứ tự`.
  - `REEL tạo container media_type=REELS và trả processing với remoteCorrelationId là container id`.
  - `STORY dùng media_type=STORIES`.
  - `container IN_PROGRESS được poll tới FINISHED` (`pollStatus` lần 1 → `{processing:true}`, lần 2 stub trả `status_code: FINISHED` → gọi `media_publish`, trả `externalPostId`).
  - `container ERROR trả PublishError VALIDATION_ERROR không retry`.
  - `vượt content_publishing_limit dời lịch` (stub `/{ig}/content_publishing_limit` trả `quota_usage: 100` → ném `PublishError {type:'RATE_LIMIT', code:'IG_DAILY_LIMIT', retryable:true, retryAfterMs}` với `retryAfterMs` tới cuối cửa sổ 24 giờ).
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Hiện thực.** **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat(integrations): publish images, carousels, reels and stories to Instagram`.

### Task 5: Trạng thái PROCESSING và poll trong worker

**Files:**
- Modify: `apps/worker/src/publishing/job-runner.service.ts`, `packages/shared/src/job-queue.ts` (thêm `schedulePoll(jobId:string, runAt:number):Promise<void>` cho cả hai hiện thực). Không thêm trạng thái mới: job đang chờ nền tảng dùng `JobStatus` `'PROCESSING'` sẵn có, kèm `remoteCorrelationId`.
- Test: `tests/services/job-runner-processing.test.ts`

**Interfaces:**
- Produces: `JobRunner.poll(jobId:string):Promise<'PUBLISHED'|'PROCESSING'|'FAILED'>`; khoảng poll `POLL_INTERVALS_MS = [5_000, 10_000, 20_000, 30_000, 60_000]` (sau đó giữ 60 000) tới khi quá `IG_CONTAINER_TIMEOUT_MS`.

- [ ] **Step 1: Viết test** `recovery không đẩy job đang chờ nền tảng về RETRYING` (job `PROCESSING` có `remoteCorrelationId`, cũ hơn `STALE_PROCESSING_MS` của SP2 → `RecoveryService.requeueMissing` gọi `schedulePoll` thay vì đổi trạng thái; sửa `recovery.service.ts` tương ứng), `job processing được poll theo lịch tăng dần và chốt PUBLISHED` (FakeAdapter trả processing 2 lần rồi xong; queue in-memory ghi lại các `runAt` = now+5s, now+15s) và `quá thời hạn poll chuyển FAILED với PROCESSING_TIMEOUT`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(worker): poll asynchronous platform publishing until it settles`.

### Task 6: Làm mới token, tài khoản hết hạn và endpoint xóa dữ liệu

**Files:**
- Create: `apps/worker/src/maintenance/token-refresh.job.ts`
- Modify: `apps/api/src/modules/accounts/accounts.service.ts`, `apps/api/src/runtime/local-api.ts`
- Create: `apps/web/src/app/data-deletion/page.tsx`, `apps/web/src/app/privacy/page.tsx`, `apps/web/src/app/terms/page.tsx` (nội dung tiếng Việt + tiếng Anh, lấy từ `docs/legal/*.md` do chủ repo cung cấp; nếu chưa có thì trang ghi "Đang cập nhật" và task chưa đóng)
- Test: `tests/integrations/meta-token.test.ts`

**Interfaces:**
- Produces: `refreshExpiringTokens(deps:{repos:Repositories; adapters:Record<Platform,PlatformAdapter>; now:number}):Promise<{refreshed:number; expiringSoon:SocialAccount[]}>`; `TOKEN_WARN_BEFORE_MS = 7 * 24 * 3_600_000`. Route `POST /integrations/meta/data-deletion` nhận `signed_request`, xác minh HMAC bằng `META_APP_SECRET`, xóa tài khoản và credential theo `user_id`, trả `{url, confirmation_code}`.

- [ ] **Step 1: Viết test**: `lỗi 190 đánh dấu tài khoản EXPIRED` (job publish gặp code 190 → job `FAILED` `AUTH_ERROR`, account `EXPIRED`); `token còn 5 ngày nằm trong expiringSoon`; `data-deletion từ chối chữ ký sai` (400) và `xóa credential khi chữ ký đúng`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(integrations): refresh Meta tokens, expire revoked accounts, handle data deletion`.

### Task 7: Smoke live có kiểm soát và nâng ngưỡng test

**Files:**
- Modify: `scripts/smoke/meta-publish.mjs` (dùng adapter mới; chỉ chạy khi `LIVE_META_SMOKE=1`; đăng 1 bài chữ và 1 ảnh lên Page thử nghiệm của chủ repo, in link, rồi xóa bài)
- Modify: `docs/runbooks/meta-live-smoke.md`, `docs/verification/v1-acceptance.md` (mục `## Facebook live publish`, `## Instagram live publish`: `Status: BLOCKED_EXTERNAL — chờ Page/IG thử nghiệm` → khi chủ repo chạy được thì `Status: LOCAL` với Evidence cục bộ)
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`)

- [ ] **Step 1:** Đặt `MIN_NODE_TESTS` theo số test hiện có; `pnpm verify` → PASS.
- [ ] **Step 2:** Chủ repo chạy `LIVE_META_SMOKE=1 node scripts/smoke/meta-publish.mjs` với Page thử nghiệm (Standard Access, chủ app có vai trò) → in 2 URL bài và "deleted". Ghi kết quả vào tài liệu nghiệm thu.
- [ ] **Step 3: Commit** `chore(verify): Meta live smoke script and raised test floor`.

## Self-review

- M1 (OAuth, sức khỏe kết nối, làm mới token) → Task 2, 6; GĐ1 FB/IG định dạng → Task 3, 4; quyết định 3 (hợp đồng adapter) → Task 1; quyết định 6 (token) → Task 6; hồ sơ App Review (data deletion, privacy, terms) → Task 6; điều kiện đóng GĐ1 "≥ 50 bài thật, ≥ 98%" đo trong SP5 sau khi có composer.
- Tên dùng chung: `PlatformAdapter`, `OAuthConnector`, `ConnectableAccount`, `IntegrationsService.start/pending/confirm`, `MetaGraphClient`, `JobRunner.poll`, `refreshExpiringTokens`.
