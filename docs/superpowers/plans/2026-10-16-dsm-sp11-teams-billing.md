# DSM SP11 — Đội nhóm, gói cước, thanh toán Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sẵn sàng thu tiền: đăng ký tài khoản, nhiều workspace/brand, mời thành viên theo vai trò, duyệt bài (kể cả link duyệt cho khách không cần tài khoản), gói cước có giới hạn, thanh toán VND, onboarding, trang giới thiệu.

**Architecture:** Phân quyền tập trung trong một hàm thuần `can(role, action)` dùng chung API và web. Giới hạn gói là dữ liệu (`PLANS`), kiểm bằng `EntitlementService` trước mọi thao tác tốn tài nguyên (thêm kênh, đăng bài, gọi AI). Thanh toán qua cổng PayOS (VietQR): tạo link thanh toán, nhận webhook có chữ ký, kích hoạt/gia hạn `Subscription`. Không lưu thông tin thẻ.

**Tech Stack:** TypeScript, Next.js 16, PayOS API (link thanh toán + webhook HMAC-SHA256), SMTP cho email mời, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 2.4–2.5 phân khúc và giá, 5 M8, M2 "brand kit", M3 "tái đăng evergreen", M6 "white-label", GĐ5, 9, 10; mục 13 dòng SP11). Tiền đề: SP2 (repositories), SP5 (thông báo), SP10 (`quota` cho AI).

## Quyết định trong plan (cần duyệt)

1. Giá và giới hạn theo giả thuyết roadmap 2.5, lưu dạng dữ liệu để đổi sau phỏng vấn:

   | Gói | Brand | Kênh | Bài/tháng | AI lượt/tháng | Thành viên | Giá/tháng |
   |---|---|---|---|---|---|---|
   | FREE | 1 | 4 (1/nền tảng) | 20 | 0 | 1 | 0đ |
   | CREATOR | 1 | 8 | không giới hạn | 200 | 1 | 149 000đ |
   | PRO | 3 | 20 | không giới hạn | 1 000 | 3 | 399 000đ |
   | AGENCY | 10 | 60 | không giới hạn | 3 000 | 10 | 990 000đ |

   Analytics: FREE xem 30 ngày, gói trả phí 365 ngày. Mốc kiếm tiền và đối thủ: PRO trở lên. Duyệt bài, link duyệt khách, báo cáo white-label: AGENCY.
2. Vai trò dùng enum có sẵn `OWNER | ADMIN | EDITOR | OPERATOR | VIEWER`, thêm `CLIENT` (chỉ xem và duyệt bài của brand được gán).
3. Thanh toán: PayOS, thu theo tháng hoặc năm (năm giảm 2 tháng); không tự trừ tiền định kỳ — trước hạn 7 ngày gửi email + Telegram kèm link gia hạn. Hết hạn thì xuống FREE, dữ liệu giữ nguyên, kênh vượt giới hạn chuyển "tạm dừng" (không đăng).
4. Tài khoản mới tự đăng ký bằng email + mật khẩu, xác minh email bằng link 24 giờ. Đăng nhập mạng xã hội để sau.
5. Ra mắt công khai chỉ khi roadmap cho phép (đã có Meta Advanced Access, TikTok audit, YouTube audit); trước đó đăng ký mở bằng mã mời beta.

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit); không gọi PayOS thật trong test (`PAYOS_API_BASE_URL` trỏ stub).
- Webhook thanh toán: kiểm chữ ký HMAC-SHA256 bằng `PAYOS_CHECKSUM_KEY` trên chuỗi dữ liệu theo đúng thứ tự trường của PayOS; idempotent theo `orderCode`; sai chữ ký trả 401 và không đổi trạng thái.
- Số tiền là số nguyên VND (không số thực).
- Mọi route kiểm quyền bằng `can()`; mặc định từ chối (403 `FORBIDDEN`).
- Dữ liệu cá nhân (Luật BVDLCN 2026): trang quyền riêng tư, xuất và xóa dữ liệu workspace theo yêu cầu chủ sở hữu.

## Review Focus

- PayOS gửi webhook hai lần hoặc gửi trước khi người dùng quay về trang: gói chỉ kích hoạt một lần, thời hạn không cộng đôi → Task 4 test `webhook trùng không gia hạn hai lần`.
- Hạ gói khi đang có 8 kênh xuống FREE: không xóa kênh, chỉ tạm dừng kênh vượt giới hạn, job đã lên lịch của kênh đó không chạy và có thông báo → Task 3 test `hết hạn tạm dừng kênh vượt giới hạn`.
- Link duyệt khách bị chia sẻ ra ngoài: chỉ xem được đúng bài, hết hạn sau 7 ngày, thu hồi được → Task 2 test `link duyệt chỉ mở đúng bài và hết hạn`.
- EDITOR cố đăng bài cần duyệt: bị chặn tới khi ADMIN/CLIENT duyệt → Task 2 test `bài cần duyệt không vào hàng đợi khi chưa duyệt`.
- Hai thành viên cùng mời một email: chỉ một lời mời hiệu lực → Task 1 test `mời trùng email trả lời mời đang có`.

---

### Task 1: Đăng ký, workspace, mời thành viên, phân quyền

**Files:**
- Create: `packages/shared/src/permissions.ts`; `apps/api/src/modules/identity/signup.service.ts`, `invitations.service.ts`
- Modify: domain/repositories/schema (`Role` thêm `'CLIENT'`; `WorkspaceMember.brandIds?:string[]` cho CLIENT; `Invitation {id; workspaceId; email; role; brandIds?; tokenHash; expiresAt; acceptedAt?}`; `EmailVerification {id; userId; tokenHash; expiresAt; usedAt?}`), migration `0016_teams`
- Modify: `apps/api/src/runtime/local-api.ts` (đăng ký, xác minh email, mời, chấp nhận, đổi vai trò, xóa thành viên; mọi route brand gọi `can`)
- Create: `apps/web/src/app/(auth)/signup/page.tsx`, `apps/web/src/features/settings/members.tsx`
- Test: `tests/identity/permissions.test.ts`, `tests/identity/invitations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Action = 'brand.read'|'content.write'|'content.publish'|'content.approve'|'accounts.connect'|'members.manage'|'billing.manage'|'analytics.read'|'inbox.reply'|'settings.write';
  export function can(role:Role, action:Action):boolean;
  // OWNER: tất cả; ADMIN: tất cả trừ billing.manage; EDITOR: brand.read, content.write, analytics.read, inbox.reply;
  // OPERATOR: brand.read, content.write, content.publish, inbox.reply, analytics.read; VIEWER: brand.read, analytics.read; CLIENT: brand.read, content.approve, analytics.read
  SignupService.register(email:string, password:string, betaCode?:string):Promise<{userId:string}> // ném BETA_CODE_REQUIRED khi SIGNUP_MODE=beta
  InvitationsService.invite(workspaceId, byUserId, email, role, brandIds?):Promise<{invitationId:string; link:string}>
  InvitationsService.accept(token:string, userId:string):Promise<WorkspaceMember>
  ```

- [ ] **Step 1: Viết test**: bảng `can` đầy đủ 6 vai trò × 10 hành động (test bảng); `mời trùng email trả lời mời đang có`; lời mời hết hạn sau 7 ngày; chỉ `members.manage` mời được; mật khẩu băm argon2id như hiện tại.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(identity): signup, invitations and role-based permissions`.

### Task 2: Luồng duyệt bài và link duyệt cho khách

**Files:**
- Create: `apps/api/src/modules/approvals/approvals.service.ts`; `apps/web/src/app/review/[token]/page.tsx` (công khai, không cần đăng nhập)
- Modify: domain/schema (`ApprovalRequest {id; brandId; contentItemId; requestedBy; status:'PENDING'|'APPROVED'|'CHANGES_REQUESTED'; decidedBy?; decidedAt?; comment?}`, `ReviewLink {id; approvalRequestId; tokenHash; expiresAt; revokedAt?}`, `Brand.requireApproval:boolean`), migration `0017_approvals`
- Modify: `PublishingService.createBatch` (brand `requireApproval` mà nội dung chưa APPROVED → 409 `APPROVAL_REQUIRED`)
- Test: `tests/approvals/approvals.test.ts`

**Interfaces:**
- Produces: `ApprovalsService.request(brandId, contentId, userId):Promise<ApprovalRequest>`, `decide(id, decision:'APPROVED'|'CHANGES_REQUESTED', by:{userId?:string; reviewLinkId?:string}, comment?)`, `createReviewLink(approvalId, ttlMs = 7 * 24 * 3_600_000):Promise<{url:string}>`, `revokeReviewLink(id)`. Sửa nội dung sau khi APPROVED đưa trạng thái về PENDING.

- [ ] **Step 1: Viết test**: `bài cần duyệt không vào hàng đợi khi chưa duyệt`; `link duyệt chỉ mở đúng bài và hết hạn` (token khác bài → 404; quá 7 ngày → 410; thu hồi → 410); `sửa sau khi duyệt yêu cầu duyệt lại`; người duyệt qua link được ghi `reviewLinkId` trong audit.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(approvals): approval workflow with expiring client review links`.

### Task 3: Gói cước và giới hạn

**Files:**
- Create: `packages/shared/src/plans.ts`, `apps/api/src/modules/billing/entitlement.service.ts`
- Modify: domain/schema (`Subscription {id; workspaceId; plan:PlanId; status:'ACTIVE'|'EXPIRED'; currentPeriodEnd:number; billingCycle:'MONTH'|'YEAR'}`, `SocialAccount.suspendedReason?:'PLAN_LIMIT'`), migration `0018_subscriptions`
- Modify: điểm kiểm giới hạn: kết nối kênh (SP4/SP6/SP7 `IntegrationsService.confirm`), `PublishingService.createBatch`, `AiService` (`quota` của SP10), tạo brand, mời thành viên, `GrowthService` (khoảng ngày analytics)
- Test: `tests/billing/entitlements.test.ts`

**Interfaces:**
- Produces: `type PlanId = 'FREE'|'CREATOR'|'PRO'|'AGENCY'`; `PLANS:Record<PlanId,{brands:number; accounts:number; accountsPerPlatform?:number; postsPerMonth:number|null; aiPerMonth:number; members:number; analyticsDays:number; features:('MONETIZATION'|'COMPETITORS'|'APPROVALS'|'CLIENT_LINKS'|'WHITE_LABEL')[]; priceVnd:{MONTH:number; YEAR:number}}>` theo bảng ở mục "Quyết định" (giá năm = 10 × giá tháng); `EntitlementService.check(workspaceId, need:{kind:'ACCOUNT'|'POST'|'AI'|'BRAND'|'MEMBER'; platform?:Platform}):Promise<{ok:true}|{ok:false; code:'PLAN_LIMIT'; limit:number; used:number; upgradeTo:PlanId}>`; `EntitlementService.enforceExpiry(now):Promise<{downgraded:number; suspendedAccounts:number}>`.

- [ ] **Step 1: Viết test**: FREE kết nối kênh Facebook thứ hai → `PLAN_LIMIT` (1/nền tảng); FREE bài thứ 21 trong tháng → `PLAN_LIMIT`; CREATOR không giới hạn bài; `hết hạn tạm dừng kênh vượt giới hạn` (PRO 8 kênh hết hạn → FREE, 4 kênh tạm dừng theo thứ tự kết nối muộn nhất trước, job `QUEUED` của kênh tạm dừng chuyển `CANCELLED` với `errorCode: 'PLAN_LIMIT'`, gửi thông báo); thông điệp gợi ý gói nâng cấp đúng (`upgradeTo`).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(billing): plans, entitlements and graceful downgrade`.

### Task 4: Thanh toán PayOS

**Files:**
- Create: `apps/api/src/integrations/payos/payos.client.ts`, `apps/api/src/modules/billing/billing.service.ts`
- Modify: domain/schema (`Payment {id; workspaceId; orderCode:number unique; plan; cycle; amountVnd:number; status:'PENDING'|'PAID'|'CANCELLED'|'EXPIRED'; checkoutUrl; paidAt?}`), migration `0019_payments`; route `POST /workspaces/:id/billing/checkout` body `{plan; cycle}`, `POST /webhooks/payos`, `GET /workspaces/:id/billing`
- Create: `tests/support/payos-stub.ts`
- Test: `tests/billing/payos.test.ts`

**Interfaces:**
- Produces: `PayOSClient.createPaymentLink(input:{orderCode:number; amount:number; description:string /* ≤ 25 ký tự */; returnUrl:string; cancelUrl:string}):Promise<{checkoutUrl:string; paymentLinkId:string}>` (ký `signature` HMAC-SHA256 trên `amount=…&cancelUrl=…&description=…&orderCode=…&returnUrl=…`); `verifyWebhook(body:{data:Record<string,unknown>; signature:string}, checksumKey:string):boolean` (sắp xếp khóa của `data` theo bảng chữ cái, nối `key=value` bằng `&`); `BillingService.checkout(workspaceId, plan, cycle, userId):Promise<{checkoutUrl:string}>`; `BillingService.handleWebhook(body):Promise<'ACTIVATED'|'DUPLICATE'|'IGNORED'>`. `orderCode` = số nguyên tăng dần từ sequence DB.

- [ ] **Step 1: Viết test**: chữ ký link khớp vector mẫu tính tay trong test; `webhook sai chữ ký trả 401`; `webhook trùng không gia hạn hai lần` (gọi 2 lần → `ACTIVATED` rồi `DUPLICATE`; `currentPeriodEnd` cộng đúng 1 tháng); thanh toán khi gói còn hạn thì cộng nối tiếp từ `currentPeriodEnd`; số tiền khác giá gói → `IGNORED` + audit `PAYMENT_AMOUNT_MISMATCH`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(billing): VND payments through PayOS with signed webhooks`.

### Task 5: Brand kit, tái đăng evergreen, báo cáo white-label

**Files:**
- Modify: domain/schema (`BrandKit {brandId; logoAssetId?; primaryColor?; introAssetId?; outroAssetId?}`, `ContentItem.evergreen?:{everyDays:number; lastRepostedAt?:number}`, `ReportBranding {workspaceId; logoAssetId?; name; color}`), migration `0020_brand_kit_evergreen`
- Create: `apps/worker/src/media/brand-kit.ts` (đóng dấu logo lên ảnh/video, **bỏ qua TikTok** theo roadmap 3), `apps/worker/src/publishing/evergreen.job.ts`
- Modify: `apps/worker/src/analytics/weekly-report.job.ts` (SP8) dùng `ReportBranding` cho gói có `WHITE_LABEL`
- Test: `tests/media/brand-kit.test.ts`, `tests/publishing/evergreen.test.ts`

- [ ] **Step 1: Viết test**: `brand kit không áp cho biến thể TikTok`; logo đặt góc phải dưới, rộng 12% cạnh ngắn; evergreen tạo bản nháp lặp lại sau `everyDays` (không tự đăng nếu brand bật duyệt); báo cáo white-label không có chữ "DSM" khi gói AGENCY.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat: brand kit, evergreen reposting and white-label reports`.

### Task 6: Onboarding, trang giới thiệu, ra mắt beta

**Files:**
- Create: `apps/web/src/app/page.tsx` (trang giới thiệu tiếng Việt: định vị, 4 nền tảng, bảng giá lấy từ `PLANS`, đăng ký danh sách chờ), `apps/web/src/app/app/onboarding/page.tsx` (4 bước: tạo brand → kết nối ≥ 2 nền tảng → tạo bài đầu tiên → bật thông báo), `apps/web/src/app/pricing/page.tsx`, `apps/web/src/app/help/*`
- Create: `apps/api/src/modules/analytics/activation.service.ts` (chỉ số kích hoạt và giữ chân, roadmap mục 9)
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS`; spec E2E bắt buộc `signup onboarding`), `docs/verification/v1-acceptance.md` (mục `## Commercial launch (SP11)` `Status: NOT_VERIFIED` tới khi đủ điều kiện)
- Test: `tests/analytics/activation.test.ts`, `apps/web/tests/signup-onboarding.spec.ts`

**Interfaces:**
- Produces: `ActivationService.cohort(weekStart:string):Promise<{signups:number; activated24h:number /* kết nối ≥2 nền tảng và đăng bài đầu trong 24 giờ */; retainedW4:number /* còn đăng bài ở tuần thứ 4 */; activationRate:number|null; retentionW4:number|null}>`.

- [ ] **Step 1: Viết test**: công thức kích hoạt và giữ chân đúng định nghĩa roadmap mục 9 (mẫu số 0 → `null`); E2E: đăng ký bằng mã beta → xác minh email (stub SMTP lưu link) → onboarding 4 bước với FakePublisher/OAuth stub → tới trang Tổng quan.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Đặt `MIN_NODE_TESTS`, `pnpm verify` → PASS. Điều kiện đóng GĐ5 (roadmap): 10–20 người dùng beta hoạt động 4 tuần, có khách trả tiền đầu tiên; ra mắt công khai khi đủ ba hồ sơ duyệt API.
- [ ] **Step 6: Commit** `feat(web): landing page, pricing, onboarding and activation metrics`.

## Self-review

- M8 (workspace, vai trò, duyệt bài, link khách, gói cước, thanh toán VND, onboarding, trang giới thiệu) → Task 1–4, 6; M2 brand kit, M3 evergreen, M6 white-label → Task 5; mục 9 chỉ số kích hoạt/giữ chân → Task 6; giả thuyết giá 2.5 → Task 3.
- Tên dùng chung: `can`, `Action`, `PLANS`, `PlanId`, `EntitlementService.check/enforceExpiry`, `ApprovalsService`, `BillingService.checkout/handleWebhook`, `ActivationService.cohort`.
