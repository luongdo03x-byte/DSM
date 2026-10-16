# DSM SP9 — Hộp thư tương tác Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom bình luận từ Facebook, Instagram, YouTube (và TikTok khi có quyền) vào một hộp thư; trả lời nhanh, dùng mẫu câu, ẩn bình luận spam; tự trả lời theo từ khóa và gửi tin nhắn riêng cho người bình luận (comment → inbox) trên FB/IG; thêm kênh cảnh báo Zalo.

**Architecture:** Mỗi adapter có thêm `CommentSource`. Meta đẩy bình luận qua webhook (xác thực `X-Hub-Signature-256`, xử lý qua hàng đợi, idempotent theo id bình luận); YouTube và TikTok được poll định kỳ. Quy tắc tự động là dữ liệu (`AutomationRule`), engine là hàm thuần trả về danh sách hành động; worker thực thi hành động và ghi nhật ký để không lặp.

**Tech Stack:** TypeScript, Meta Webhooks + Graph API (comments, private replies), YouTube Data API `commentThreads`/`comments`, TikTok comment API (tùy quyền), Zalo Official Account API, node:test.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 3 "Comment → inbox", 5 M5, GĐ4, 8.1 chặng 5; mục 13 dòng SP9). Tiền đề: SP4 (Meta), SP7 (YouTube), SP5 (thông báo).

## Quyết định trong plan (cần duyệt)

1. Phạm vi P1: bình luận (không phải tin nhắn Messenger/Direct đầy đủ). Comment → inbox chỉ gửi **một** tin riêng cho mỗi bình luận, trong **7 ngày**; tin tiếp theo chỉ khi người dùng trả lời (cửa sổ 24 giờ) — DSM không hỗ trợ hội thoại nhiều lượt ở SP9.
2. TikTok: chỉ bật khi app có quyền đọc bình luận; không có thì nguồn TikTok hiện "chưa hỗ trợ" thay vì lỗi.
3. Quy tắc tự động mặc định **tắt**; mỗi quy tắc có giới hạn `maxPerHour` (mặc định 30) để tránh bị nền tảng coi là spam.
4. Ẩn bình luận spam: chỉ ẩn khi người dùng bấm hoặc quy tắc khớp danh sách từ khóa người dùng tự nhập (ví dụ số điện thoại lừa đảo); không tự xóa.
5. Zalo: gửi cảnh báo qua Zalo Official Account (người nhận phải là người đã quan tâm OA). Cần OA của chủ repo; chưa có OA thì kênh Zalo ẩn.

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit); không gọi mạng thật trong test.
- Webhook: từ chối (401) mọi request sai chữ ký; xác minh `hub.verify_token` khi đăng ký; trả 200 trong < 1 giây, xử lý trong hàng đợi.
- Private reply: tối đa 1 tin/bình luận, trong 7 ngày kể từ bình luận (`PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 3_600_000`).
- Nội dung bình luận là dữ liệu cá nhân (Luật BVDLCN 2026): chỉ lưu trường cần thiết (id, tác giả id + tên hiển thị, nội dung, thời gian), xóa khi tài khoản bị ngắt kết nối hoặc theo yêu cầu xóa dữ liệu (SP4).

## Review Focus

- Meta gửi lại cùng một webhook nhiều lần: bình luận chỉ xuất hiện một lần, quy tắc chỉ chạy một lần → Task 2 test `webhook trùng không tạo bản ghi và hành động thứ hai`.
- Quy tắc trả lời khớp chính bình luận do DSM vừa đăng: không tự trả lời chính mình (vòng lặp) → Task 4 test `bỏ qua bình luận của chính trang`.
- Bình luận quá 7 ngày bấm "Nhắn riêng": nút bị khóa kèm lý do → Task 5 test `private reply quá 7 ngày bị từ chối`.
- Bình luận bị xóa trên nền tảng trước khi trả lời: trả lời thất bại có thông báo rõ, hộp thư đánh dấu đã xóa → Task 3 test `trả lời bình luận đã xóa đánh dấu DELETED`.
- Ngắt kết nối tài khoản: bình luận của tài khoản đó bị xóa khỏi DSM → Task 6 test `ngắt kết nối xóa bình luận`.

---

### Task 1: Mô hình bình luận và `CommentSource`

**Files:**
- Create: `packages/platform-contracts/src/comments.ts`
- Modify: domain/repositories/schema (`SocialComment`, `CommentAction`), migration `0012_comments`
- Test: thêm vào `tests/repositories/repository-contract.ts` (`comment unique theo platform + platformCommentId`)

**Interfaces:**
- Produces:
  ```ts
  export interface SocialComment { id:string; brandId:string; socialAccountId:string; platform:Platform; platformCommentId:string; platformPostId:string; publishedPostId?:string; parentCommentId?:string; authorId:string; authorName:string; isFromPage:boolean; text:string; createdAt:number; status:'NEW'|'READ'|'REPLIED'|'HIDDEN'|'DELETED'; privateReplySentAt?:number }
  export interface CommentAction { id:string; commentId:string; kind:'REPLY'|'PRIVATE_REPLY'|'HIDE'|'UNHIDE'; text?:string; ruleId?:string; userId?:string; status:'PENDING'|'DONE'|'FAILED'; errorCode?:string; createdAt:number }
  export interface CommentSource {
    listSince(account:SocialAccount, since:number):Promise<Omit<SocialComment,'id'|'brandId'|'status'>[]>;
    reply(account:SocialAccount, platformCommentId:string, text:string):Promise<{platformCommentId:string}>;
    hide?(account:SocialAccount, platformCommentId:string, hidden:boolean):Promise<void>;
    privateReply?(account:SocialAccount, platformCommentId:string, text:string):Promise<void>;
  }
  ```
- [ ] **Step 1–4:** test contract → FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(shared): social comment model and comment source contract`.

### Task 2: Webhook Meta

**Files:**
- Create: `apps/api/src/integrations/meta/meta-webhook.ts`; route `GET /webhooks/meta` (verify), `POST /webhooks/meta`
- Create: `apps/worker/src/engagement/ingest-comment.job.ts`
- Modify: OAuth Meta scope thêm `pages_manage_engagement`, `pages_read_user_content`, `instagram_manage_comments`, `pages_messaging`, `instagram_manage_messages`; đăng ký trường webhook `feed` (Page) và `comments` (Instagram)
- Test: `tests/integrations/meta-webhook.test.ts`

**Interfaces:**
- Produces: `verifySignature(rawBody:Buffer, header:string|undefined, appSecret:string):boolean` (`sha256=` + HMAC hex, `timingSafeEqual`); `parseMetaWebhook(body:unknown):{socialPlatformAccountId:string; platform:'FACEBOOK'|'INSTAGRAM'; platformCommentId:string; platformPostId:string; authorId:string; authorName:string; text:string; createdAt:number; verb:'add'|'edited'|'remove'}[]`; `ingestComment(repos, event):Promise<'CREATED'|'UPDATED'|'DUPLICATE'|'IGNORED'>`.

- [ ] **Step 1: Viết test**: `chữ ký sai trả 401`; `verify trả hub.challenge khi verify_token đúng`; `webhook trùng không tạo bản ghi và hành động thứ hai` (gửi 2 lần → `CREATED` rồi `DUPLICATE`, engine chạy 1 lần); `verb remove đánh dấu DELETED`; bình luận có `from.id` = Page id → `isFromPage: true`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(integrations): ingest Facebook and Instagram comments from Meta webhooks`.

### Task 3: Poll YouTube (và TikTok nếu có quyền), trả lời, ẩn

**Files:**
- Modify: `youtube.adapter.ts`, `facebook.adapter.ts`, `instagram.adapter.ts`, `tiktok.adapter.ts` (hiện thực `CommentSource` khi được phép)
- Create: `apps/worker/src/engagement/poll-comments.job.ts` (mỗi 10 phút cho tài khoản YouTube/TikTok có bài trong 30 ngày)
- Create: `apps/api/src/modules/engagement/engagement.service.ts`; route `GET /brands/:brandId/comments?status&platform&cursor`, `POST /brands/:brandId/comments/:id/reply`, `POST …/hide`, `POST …/unhide`, `POST …/read`
- Test: `tests/engagement/engagement-service.test.ts`

**Interfaces:**
- Produces: `EngagementService.list(brandId, filter:{status?:SocialComment['status'][]; platform?:Platform; cursor?:string; limit?:number}):Promise<{items:SocialComment[]; nextCursor?:string}>`; `reply(brandId, commentId, text, userId)`; `hide(brandId, commentId, hidden:boolean, userId)`. YouTube dùng quyền `youtube.force-ssl` (thêm vào OAuth Google).

- [ ] **Step 1: Viết test**: phân trang theo `createdAt` giảm dần; `trả lời bình luận đã xóa đánh dấu DELETED` (nền tảng trả 404/100 → comment `DELETED`, action `FAILED` `COMMENT_GONE`); YouTube `hide` không hỗ trợ → nút ẩn trả 409 `NOT_SUPPORTED`; poll YouTube lấy `commentThreads?allThreadsRelatedToChannelId` từ thời điểm cuối.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(engagement): comment polling, reply and hide across platforms`.

### Task 4: Quy tắc tự động và mẫu câu

**Files:**
- Create: `packages/shared/src/engagement/rules.ts`; domain/schema (`ReplyTemplate {id; brandId; name; text}`, `AutomationRule {id; brandId; enabled; platforms:Platform[]; match:{keywords:string[]; mode:'ANY'|'ALL'}; actions:{reply?:string; privateReply?:string; hide?:boolean}; maxPerHour:number}`), migration `0013_rules_templates`
- Create: `apps/worker/src/engagement/run-rules.job.ts`
- Test: `tests/engagement/rules.test.ts`

**Interfaces:**
- Produces: `normalizeVi(text:string):string` (chữ thường, bỏ dấu tiếng Việt, gộp khoảng trắng); `matchRules(comment:SocialComment, rules:AutomationRule[], recentCounts:Record<string,number>):{ruleId:string; actions:CommentAction['kind'][]; texts:{reply?:string; privateReply?:string}}[]`; `renderTemplate(text:string, vars:{authorName:string; productName?:string; link?:string}):string` (biến `{ten}`, `{sanpham}`, `{link}`).

- [ ] **Step 1: Viết test**: `từ khóa khớp không phân biệt dấu` ("giá bao nhiêu" khớp bình luận "GIA BAO NHIEU vậy shop"); `bỏ qua bình luận của chính trang`; `vượt maxPerHour không sinh hành động`; `quy tắc tắt không chạy`; `renderTemplate thay {ten}`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(engagement): keyword automation rules and reply templates`.

### Task 5: Comment → inbox (private reply)

**Files:**
- Modify: `facebook.adapter.ts`, `instagram.adapter.ts` (`privateReply` qua Messenger Platform `recipient: {comment_id}`), `engagement.service.ts` (`privateReply(brandId, commentId, text, userId)`)
- Test: `tests/engagement/private-reply.test.ts`

- [ ] **Step 1: Viết test**: `gửi một lần rồi khóa` (lần 2 → 409 `PRIVATE_REPLY_ALREADY_SENT`); `private reply quá 7 ngày bị từ chối` (409 `PRIVATE_REPLY_WINDOW_CLOSED`); gửi qua quy tắc tự động cũng tôn trọng hai điều kiện trên.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(engagement): one-time private replies to commenters on Facebook and Instagram`.

### Task 6: Giao diện hộp thư, Zalo, dọn dữ liệu

**Files:**
- Create: `apps/web/src/app/app/brands/[brandId]/inbox/page.tsx`, `apps/web/src/features/inbox/*` (danh sách, khung trả lời, chọn mẫu câu, bộ lọc nền tảng/trạng thái, trang quy tắc), mục điều hướng "Hộp thư"
- Create: `apps/worker/src/notifications/zalo.notifier.ts` (Zalo OA gửi tin tư vấn tới người đã quan tâm; `ZALO_OA_ACCESS_TOKEN` làm mới bằng refresh token)
- Modify: `NotificationChannel.kind` thêm `'ZALO'`; `accounts.service.ts` (ngắt kết nối xóa `SocialComment` + `CommentAction` của tài khoản)
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`; spec E2E bắt buộc `inbox reply`)
- Test: `tests/engagement/disconnect-cleanup.test.ts`, `tests/notifications/zalo.test.ts`, `apps/web/tests/inbox-reply.spec.ts`

- [ ] **Step 1: Viết test**: `ngắt kết nối xóa bình luận`; Zalo gửi đúng endpoint và nội dung `renderVietnamese` (SP5); E2E: bình luận seed → mở Hộp thư → chọn mẫu câu → Gửi → trạng thái "Đã trả lời" (FakeCommentSource trong chế độ test).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Điều kiện đóng (roadmap GĐ4): câu trả lời gửi từ DSM hiện đúng trên nền tảng — kiểm tay trên kênh dogfood, ghi `LOCAL` evidence.
- [ ] **Step 5: Commit** `feat(web): unified comment inbox with templates, rules and Zalo alerts`.

## Self-review

- M5 (hộp thư hợp nhất, trả lời nhanh, mẫu câu, ẩn spam, auto-reply, comment → inbox) → Task 1–6; M3 cảnh báo Zalo → Task 6; roadmap 3 (giới hạn private reply) → Task 5; pháp lý dữ liệu → Task 6 + Global Constraints.
- Tên dùng chung: `SocialComment`, `CommentAction`, `CommentSource`, `EngagementService`, `AutomationRule`, `matchRules`, `normalizeVi`, `renderTemplate`.
