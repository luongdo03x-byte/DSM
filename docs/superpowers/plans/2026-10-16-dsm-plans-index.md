# DSM — Mục lục implementation plan (SP1–SP11)

Ngày: 2026-10-16
Spec khung: `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 13)

## Trạng thái

| Mã | Plan | Giai đoạn | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| SP1 | [Khôi phục CI và cổng nghiệm thu](2026-10-13-dsm-sp1-ci-verification-gate.md) | GĐ0 | — | Có spec riêng đã duyệt; plan đã chạy thử trọn vẹn (`pnpm verify` xanh, 10 red-check đúng) |
| SP2 | [Runtime bền vững](2026-10-16-dsm-sp2-persistent-runtime.md) | GĐ0 | SP1 | Plan theo spec khung, chờ duyệt |
| SP3 | [Nhiều media và media pipeline](2026-10-16-dsm-sp3-multi-media-pipeline.md) | GĐ1 | SP2 | Plan theo spec khung, chờ duyệt |
| SP4 | [Adapter Meta](2026-10-16-dsm-sp4-meta-adapter.md) | GĐ1 | SP2, SP3 | Plan theo spec khung, chờ duyệt |
| SP5 | [Composer và lịch](2026-10-16-dsm-sp5-composer-calendar.md) | GĐ1 | SP3, SP4 | Plan theo spec khung, chờ duyệt |
| SP6 | [Adapter TikTok](2026-10-16-dsm-sp6-tiktok-adapter.md) | GĐ2 | SP3, SP4, SP5 | Plan theo spec khung, chờ duyệt |
| SP7 | [Adapter YouTube](2026-10-16-dsm-sp7-youtube-adapter.md) | GĐ2 | SP3, SP4, SP5 | Plan theo spec khung, chờ duyệt |
| SP8 | [Insights và Channel Growth Studio](2026-10-16-dsm-sp8-insights-channel-growth.md) | GĐ3 | SP4, SP6, SP7 | Plan theo spec khung, chờ duyệt |
| SP9 | [Hộp thư tương tác](2026-10-16-dsm-sp9-engagement-inbox.md) | GĐ4 | SP4, SP5, SP7 | Plan theo spec khung, chờ duyệt |
| SP10 | [Trợ lý AI tiếng Việt](2026-10-16-dsm-sp10-ai-assistant.md) | GĐ4 | SP3, SP5, SP8 | Plan theo spec khung, chờ duyệt |
| SP11 | [Đội nhóm, gói cước, thanh toán](2026-10-16-dsm-sp11-teams-billing.md) | GĐ5 | SP2, SP5, SP10 | Plan theo spec khung, chờ duyệt |

Thứ tự thực hiện: SP1 → SP2 → SP3 → SP4 → SP5 → (SP6 ∥ SP7) → SP8 → (SP9 ∥ SP10) → SP11.

## Khác biệt giữa SP1 và SP2–SP11

- **SP1** đi đủ quy trình: brainstorm → spec riêng → rà soát đối kháng → plan có code đầy đủ → chạy thử plan trên code thật.
- **SP2–SP11** được viết theo yêu cầu "viết hết plan" ngày 16/10, dựa trên spec khung. Mỗi plan có mục **"Quyết định trong plan (cần duyệt)"** thay cho spec riêng. Plan nêu file, chữ ký hàm, tên test và giá trị cụ thể; phần thân hàm do người thực hiện viết. Code chưa được chạy thử, vì mỗi SP xây trên code của SP trước. Số dòng (`file:line`) trích từ PR #1 @ 4f1ea10 nên có thể lệch khi tới lượt thực hiện.
- Trước khi bắt đầu mỗi SP: đọc lại plan với code lúc đó, duyệt mục "Quyết định trong plan", sửa chỗ lệch, rồi mới thực hiện.

## Quy ước dùng chung (mọi plan)

- Node `>=24.7 <25`, pnpm 10.17.1, `pnpm install --frozen-lockfile`; cổng `pnpm verify` của SP1 xanh ở mọi commit; không `skip`/`only`/`todo`/`expectFailure`.
- Mỗi SP kết thúc bằng việc nâng `MIN_NODE_TESTS` trong `scripts/verify-v1.mjs` và cập nhật `docs/verification/v1-acceptance.md`.
- Không gọi mạng thật trong `pnpm test`: mọi base URL của nền tảng là biến môi trường, test trỏ về stub `127.0.0.1`.
- Migration Prisma đánh số liên tục: SP2 `0002`; SP3 `0003`; SP4 `0004`; SP5 `0005`; SP7 `0006`–`0007`; SP8 `0008`–`0011`; SP9 `0012`–`0013`; SP10 `0014`–`0015`; SP11 `0016`–`0020`. SP6 không có migration. Nếu SP6/SP7 làm song song, migration tạo sau phải đổi số khi rebase.
- Tên hợp đồng dùng chung (định nghĩa ở SP nào thì SP sau dùng đúng tên đó):

  | Tên | Định nghĩa ở |
  |---|---|
  | `Repositories`, `PublishJobRepo.claim/findDue/findInRange`, `JobQueue`, `createRuntime`, `startWorker` | SP2 |
  | `ContentFormat`, `ContentMedia`, `VariantMedia`, `MEDIA_RULES`, `preflight`, `PublishInput.media` | SP3 |
  | `PlatformAdapter`, `OAuthConnector`, `IntegrationsService`, `JobRunner.poll`, `refreshExpiringTokens` | SP4 |
  | `CalendarEntry`, `NotificationEvent`, `NotificationDispatcher`, `ReliabilityService` | SP5 |
  | `SlidingWindowLimiter`, `TikTokPostSettings` | SP6 |
  | `QuotaManager`, `YouTubeAdapter.reschedule` | SP7 |
  | `InsightsSource`, `ChannelSnapshot`, `healthScore`, `bestTimes`, `monetizationProgress`, `vnEvents` | SP8 |
  | `SocialComment`, `CommentSource`, `EngagementService`, `AutomationRule` | SP9 |
  | `AiService`, `AiTask`, `BrandVoice`, `ContentPlanService` | SP10 |
  | `can`, `PLANS`, `EntitlementService`, `BillingService` | SP11 |

## Quyết định cần duyệt (tóm tắt)

| SP | Quyết định chính |
|---|---|
| SP2 | Chọn runtime bằng `RUNTIME_STORE`; test Postgres/Redis bắt buộc (không skip) nên máy dev cần Docker; BullMQ chỉ giữ lịch, trạng thái nằm ở DB; staging = 1 VPS Docker Compose |
| SP3 | Giữ ảnh gốc, bản chuẩn hóa là asset con; tỉ lệ mặc định IG 4:5, TikTok 9:16; `FACEBOOK_ALBUM_MAX = 10` (cấu hình) |
| SP4 | Chỉ "Facebook Login for Business" (IG gắn Page); danh sách quyền xin; Reels qua `video_reels`; webhook để SP9 |
| SP5 | Composer là trang riêng; giờ theo múi giờ brand; kéo thả chỉ đổi ngày; không dùng thư viện lịch; Telegram + Email; cờ `E2E_FAKE_PUBLISHERS` chỉ khi `APP_ENV=test` |
| SP6 | Direct Post mặc định; chưa audit chỉ `SELF_ONLY`; ảnh bắt buộc domain media đã xác minh; không mặc định quyền riêng tư |
| SP7 | Hai scope tối thiểu; lên lịch xa thì upload sớm + `publishAt`; hạn mức 100 upload/ngày là cấu hình; lỗi ảnh bìa không làm hỏng bài |
| SP8 | Công thức điểm sức khỏe 15/30/25/20/10; giờ vàng cần ≥ 20 bài; ngưỡng kiếm tiền có `validFrom`; lịch lễ/sale VN là dữ liệu trong repo |
| SP9 | Chỉ bình luận (chưa làm hội thoại Messenger/Direct); quy tắc tự động mặc định tắt, `maxPerHour` 30; Zalo cần OA của chủ repo |
| SP10 | `claude-opus-5-5`, effort `medium` cấu hình theo tác vụ, fallback `default`; AI chỉ tạo nháp; phụ đề bằng whisper.cpp tự host |
| SP11 | Bảng giá/giới hạn theo giả thuyết; thêm vai trò `CLIENT`; PayOS, không trừ tiền tự động; đăng ký bằng mã mời beta trước khi ra mắt |
