# Đánh giá caption AI trước beta

## Chuẩn bị dữ liệu

Sao chép `scripts/ai/eval-set.example.json` thành `scripts/ai/eval-set.json` (đường dẫn này bị Git bỏ qua). Điền giọng thương hiệu thật và đúng 20 nội dung gốc đã bỏ tên, số điện thoại, địa chỉ, mã đơn và dữ liệu cá nhân. Mỗi mẫu cần `id`, `title`, `body`; có thể thêm `type` (`TEXT`, `IMAGE`, `ALBUM`, `VIDEO`), `hook`, `cta`. Không dùng dữ liệu khách hàng hoặc bình luận riêng tư. File mẫu đang để trống có chủ đích, vì chưa có nội dung thật từ chủ repo. Có thể giữ dữ liệu ở một đường dẫn riêng ngoài Git và truyền đường dẫn đó cho script.

Kiểm tra bộ dữ liệu mà không gọi API:

```bash
node --experimental-strip-types scripts/ai/eval-captions.mjs /duong-dan-rieng/eval-set.json --validate
```

## Chạy có phí

Mỗi lần chạy là 80 lời gọi Claude (20 mẫu × Facebook, Instagram, Threads, TikTok). Chủ repo cần đồng ý chi phí trước mỗi lần. Sau khi được đồng ý, đặt `ANTHROPIC_API_KEY` trong môi trường và chạy:

```bash
node --experimental-strip-types scripts/ai/eval-captions.mjs /duong-dan-rieng/eval-set.json --approve-paid-run
```

Kết quả được ghi sau từng lời gọi vào thư mục `.superpowers/sdd/2026-10-16-dsm-sp10-ai-assistant/` bị Git bỏ qua. Có thể chọn thư mục riêng qua `AI_EVAL_OUTPUT_DIR`. Không commit kết quả. Script ghi số token và chi phí ước tính theo giá niêm yết Claude Opus 5.5 tại thời điểm viết: $4 / triệu token đầu vào, $20 / triệu token đầu ra, $0.20 / triệu token đọc cache. Ước tính chưa tính ghi cache, phụ phí hoặc thay đổi giá; xem [bảng giá Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) trước khi chạy.

## Chấm thủ công

Với mỗi caption trên cả bốn nền tảng, chủ repo chấm **đạt / không đạt** cho bốn tiêu chí:

1. Đúng giọng thương hiệu.
2. Đúng cách viết và giới hạn của nền tảng.
3. Tiếng Việt tự nhiên.
4. Không bịa dữ kiện sản phẩm hay ưu đãi.

Một mẫu chỉ **đạt** nếu cả bốn caption đều đạt cả bốn tiêu chí. Chỉ bật AI cho beta khi ít nhất **16/20 mẫu đạt**. Xem thêm `preflightWithoutCutRate` trong JSON; chỉ số này phản ánh lỗi kỹ thuật và cắt ký tự, không thay thế việc chấm tay. Ghi lại mẫu trượt và sửa prompt hoặc dữ liệu giọng thương hiệu, rồi xin phép trước lần chạy có phí tiếp theo.
