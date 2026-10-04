# DSM V1 — Thiết kế giao diện tiếng Việt

Ngày: 2026-10-05
Trạng thái: Chờ duyệt trước khi lập kế hoạch triển khai

## 1. Mục tiêu

Thay toàn bộ giao diện thô hiện tại của DSM bằng giao diện dashboard hiện đại, hoàn toàn bằng tiếng Việt, bám theo bộ preview đã thống nhất: sidebar tối, vùng nội dung sáng, accent xanh/tím, card bo góc, bảng dữ liệu rõ ràng, badge trạng thái và biểu tượng cho Facebook / Instagram / Threads / TikTok.

Mục tiêu chính:

- Giữ nguyên business logic và API hiện tại.
- Không tạo nút hoặc số liệu giả cho chức năng backend chưa tồn tại.
- Làm rõ workflow: Sản phẩm → Nội dung → Biến thể nền tảng → Tài khoản → Đăng/Lên lịch → Theo dõi kết quả.
- Tối ưu cho desktop trước, responsive cho tablet/mobile.
- Toàn bộ text hiển thị cho người dùng là tiếng Việt.

## 2. Chức năng hiện có phải được giữ nguyên

### Xác thực
- Đăng nhập bằng email/mật khẩu.
- Access token trong memory.
- Refresh token qua HttpOnly cookie.
- Logout.
- Nạp Workspace / Brand sau đăng nhập.

### Sản phẩm
- Xem danh sách sản phẩm.
- Tạo sản phẩm.
- Các trường hiện có: tên, slug, tiền tệ, giá vốn, giá bán, supplier URL, landing URL, trạng thái.
- Lưu trữ (archive) sản phẩm.

### Nội dung
- Xem danh sách nội dung.
- Tạo nội dung TEXT / IMAGE / VIDEO.
- Upload media bằng signed URL lên object storage.
- Nội dung gốc gồm title, body, CTA, media.
- Sao chép nội dung gốc thành 4 biến thể: Facebook, Instagram, Threads, TikTok.
- Chỉnh caption/body cho từng biến thể.
- Đổi trạng thái biến thể DRAFT / READY.

### Đăng bài / Lên lịch
- Chọn nội dung.
- Chọn một hoặc nhiều social account.
- Validate từng target trước khi publish.
- Publish ngay hoặc đặt `scheduledAt`.
- Tạo PublishBatch / PublishJob.
- Hiển thị kết quả validation theo từng nền tảng.
- Các trạng thái job hiện có: QUEUED, PROCESSING, RETRYING, PUBLISHED, FAILED, CANCELLED.
- Retry job lỗi.
- Reschedule / cancel job trong lịch.

### Tài khoản mạng xã hội
- Facebook, Instagram, Threads, TikTok.
- Chế độ đăng: API / BROWSER / HYBRID.
- Lưu credential đã mã hóa.
- Gắn Browser/GPMLogin profile.
- Disconnect account.

### Browser Node / GPMLogin
- Tạo one-time Browser Node registration.
- Hiển thị Node ID / registration token.
- Theo dõi heartbeat và trạng thái node.
- Gắn GPM profile ID vào social account.

### Chiến dịch
- Xem danh sách chiến dịch.
- Tạo chiến dịch.
- Gắn content vào campaign.
- Xem campaign performance khi backend có dữ liệu.

### Phân tích / Tracking
- Overview analytics theo brand.
- Platform analytics.
- Metric snapshot của published post.
- Tracked link.
- Click event + redirect.
- Campaign performance.
- CTR phải hiển thị `—` khi không có mẫu số hợp lệ.

## 3. Những gì không làm trong đợt UI này

- Không thêm đăng ký tài khoản DSM nếu backend chưa có endpoint signup.
- Không thêm quên mật khẩu nếu backend chưa có endpoint reset password.
- Không thêm billing / gói Pro thật.
- Không hiển thị doanh thu nếu backend V1 chưa có orders/revenue.
- Không thêm category, inventory, variants cho Product nếu backend chưa hỗ trợ.
- Không thêm AI content generator nếu backend chưa có.
- Không thay đổi kiến trúc publishing engine.
- Không đổi API contract trừ khi cần endpoint read-only rất nhỏ để phục vụ UI và được test rõ ràng.

## 4. Design system

### Màu sắc
- Sidebar: navy/black gradient.
- Primary: blue-violet gradient.
- Success: xanh lá.
- Warning: vàng/cam.
- Error: đỏ.
- Background: trắng/xám rất nhạt.

### Thành phần chung
- `AppShell`
- `Sidebar`
- `Topbar`
- `BrandSwitcher`
- `PageHeader`
- `StatCard`
- `StatusBadge`
- `PlatformBadge`
- `DataTable`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `Modal/Drawer`
- `FormField`
- `Button`
- `Tabs`
- `Toast`

Ưu tiên CSS thuần/global CSS + component classes để không thêm UI framework lớn nếu chưa cần.

## 5. Navigation tiếng Việt

Sidebar:

1. Tổng quan
2. Sản phẩm
3. Nội dung
4. Lịch đăng
5. Chiến dịch
6. Tài khoản
7. Phân tích
8. Cài đặt

Các route hiện tại giữ nguyên để không phá deep link:

- `/app/brands/:brandId/overview`
- `/products`
- `/content`
- `/calendar`
- `/campaigns`
- `/accounts`
- `/analytics`
- `/settings`

## 6. Màn Đăng nhập

Bố cục 2 cột theo preview:

- Trái: DSM branding + mô tả ngắn + 4 nền tảng.
- Phải: form đăng nhập thật.
- Chỉ có Email, Mật khẩu, Đăng nhập.
- Không hiển thị "Tạo tài khoản" hoặc "Quên mật khẩu" nếu backend chưa hỗ trợ.
- Có trạng thái lỗi API / sai thông tin đăng nhập.
- Có nút ẩn/hiện mật khẩu.

Sau login thành công chuyển vào brand đầu tiên `/overview`.

## 7. Màn Tổng quan

Dùng dữ liệu thật từ analytics/account/calendar.

Các block:

- KPI: Bài đã đăng, Bài đã lên lịch, Công việc lỗi, Tài khoản hoạt động.
- Tình trạng tài khoản 4 nền tảng.
- Hoạt động đăng bài gần đây.
- Danh sách job gần đây.
- Lịch hôm nay.
- Thao tác nhanh: Tạo sản phẩm, Nội dung mới, Đăng/Lên lịch.

Nếu API chưa có series dữ liệu để vẽ chart theo ngày, thay chart giả bằng trạng thái/tổng hợp thật; không hard-code dữ liệu demo.

## 8. Màn Sản phẩm

Bố cục:

- Header + nút `Tạo sản phẩm`.
- Thanh tìm kiếm client-side.
- KPI lấy từ danh sách thật: tổng, active, archived; biên lợi nhuận chỉ tính khi có đủ cost/price.
- Bảng: Tên, Giá vốn, Giá bán, Biên lợi nhuận, Trạng thái, Thao tác.
- Form tạo Product mở bằng modal/drawer thay vì form trần.
- Archive qua menu thao tác và có confirm.

Không thêm category hoặc platform-fit giả.

## 9. Màn Nội dung

Đây là màn quan trọng nhất.

Layout 3 cột trên desktop:

- Trái: Thư viện nội dung.
- Giữa: Tạo/Chỉnh sửa nội dung gốc + Platform Variants.
- Phải: Preview đơn giản và mức độ sẵn sàng đăng.

Flow:

1. Tạo content TEXT/IMAGE/VIDEO.
2. Upload media nếu cần.
3. Sao chép master thành 4 variants.
4. Chọn tab Facebook / Instagram / Threads / TikTok.
5. Chỉnh caption/body.
6. Chuyển DRAFT → READY.
7. Mở publish drawer.
8. Chọn account + thời gian.
9. Validate.
10. Chỉ tạo jobs cho target hợp lệ.

Preview chỉ là visual approximation, không giả lập 100% native UI của từng social app.

## 10. Màn Lịch đăng

Không làm calendar grid giả nếu dữ liệu job chưa đủ để support month grid ổn định.

Thiết kế ưu tiên:

- Desktop month grid khi có dữ liệu job.
- Filter theo nền tảng/trạng thái ở client.
- Side panel chi tiết ngày được chọn.
- Job card hiển thị platform, content, giờ, status.
- Action hiện có: đổi lịch, hủy, retry khi phù hợp.

## 11. Màn Chiến dịch

- Danh sách campaign thật.
- Tạo campaign bằng modal.
- Hiển thị content đã gắn.
- Cho gắn content vào campaign.
- Performance dùng đúng dữ liệu backend; khi chưa có metrics thì dùng empty state thay số demo.

## 12. Màn Tài khoản

Phần trên:

- 4 platform account cards/table.
- Trạng thái kết nối.
- Chế độ đăng API / Trình duyệt / Kết hợp.
- Credential form đặt trong drawer/details, input password.
- Attach GPM profile.
- Disconnect.

Phần Browser Nodes:

- Danh sách Browser Node.
- ONLINE / DEGRADED / OFFLINE.
- heartbeat gần nhất.
- max concurrency.
- nút `Thêm nút trình duyệt` tạo registration token.
- Hiển thị registration token một lần và hướng dẫn lệnh `.env` cần set.

## 13. Màn Phân tích

Chỉ hiển thị dữ liệu backend thật.

- KPI: views, clicks, CTR, engagement khi API trả được.
- Platform comparison.
- Top posts khi có published post + metrics.
- Campaign performance.
- Tracked click breakdown nếu có.

Chart phải có empty state khi chưa có snapshot đủ để vẽ.

## 14. Màn Cài đặt

V1 UI tập trung:

- Thông tin Brand read-only/summary.
- Browser Nodes management entry.
- Trạng thái local runtime.
- Không tạo settings giả chưa có backend.

## 15. Responsive

- >= 1280px: sidebar cố định + multi-column.
- 768–1279px: sidebar thu gọn, layout 2 cột.
- < 768px: sidebar drawer, bảng chuyển sang card/list, form full-width.

## 16. Trạng thái UI bắt buộc

Mỗi trang phải xử lý:

- loading
- empty
- error
- success feedback
- disabled while submitting
- validation errors

Không render raw JSON ra giao diện production.

## 17. Accessibility

- Label cho input.
- Keyboard focus rõ ràng.
- Button/anchor semantic.
- Badge không chỉ dựa vào màu.
- Contrast đủ đọc.
- `aria-live`/alert cho lỗi thao tác quan trọng khi phù hợp.

## 18. Testing

TDD cho các component/logic mới có hành vi:

- Login success/failure.
- Navigation link generation.
- Vietnamese labels chính.
- Product create/archive flow.
- Content variant edit/readiness.
- Publish validation and partial-target result rendering.
- Account credential/profile forms.
- Calendar status/action mapping.
- Analytics null/CTR semantics.

Cuối mỗi phase chạy:

- `npm run typecheck`
- `npm test`
- `npm run build`

Cuối toàn bộ chạy `npm run verify` nếu verify script tương thích public repo hiện tại.

## 19. Tiêu chí hoàn thành

- Không còn giao diện HTML mặc định như hiện tại.
- 8 section trong sidebar có style đồng nhất.
- Toàn bộ UI visible text là tiếng Việt, trừ tên platform/technical IDs cần giữ nguyên.
- Các action backend hiện có vẫn hoạt động.
- Không hard-code số liệu demo vào production UI.
- Không lưu token vào localStorage.
- Login, Product, Content, Publish, Accounts, Browser Nodes, Calendar, Campaigns, Analytics đều dùng API thật.
- Desktop UI bám sát bộ preview đã duyệt.
- Responsive cơ bản hoạt động.
- Typecheck, test và build pass.
