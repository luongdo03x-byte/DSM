# DSM SP10 — Trợ lý AI tiếng Việt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gợi ý caption, hook, hashtag theo từng nền tảng và giọng thương hiệu; tiêu đề/mô tả/chapter YouTube; kế hoạch 30 ngày đổ thành bản nháp trên lịch; thư viện hook; phụ đề tiếng Việt tự động. AI chỉ tạo bản nháp, người dùng luôn duyệt trước khi đăng.

**Architecture:** Một `AiService` duy nhất gọi Claude qua `@anthropic-ai/sdk`, mọi đầu ra là JSON có cấu trúc (Zod schema) để giao diện điền vào form. System prompt gồm phần cố định (quy tắc nền tảng lấy từ `MEDIA_RULES` của SP3) và phần giọng thương hiệu, đặt `cache_control` để tái dùng cache giữa các lần gọi của cùng brand. Đầu ra luôn qua `preflight()` trước khi trả về; vượt giới hạn thì cắt có cảnh báo. Hạn mức AI theo gói (SP11) đếm bằng `AiUsage`. Phụ đề dùng mô hình nhận dạng giọng nói chạy trong worker (Claude không nhận dạng âm thanh), Claude chỉ chuẩn hóa câu chữ và ngắt dòng.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk` + `zod` (`zodOutputFormat` từ `@anthropic-ai/sdk/helpers/zod`), model `claude-opus-5-5`, whisper.cpp (model `large-v3`) trong container worker, node:test.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 5 M7, M4 "kế hoạch 30 ngày", "thư viện hook"; GĐ4; 8.1 chặng 2–3; mục 13 dòng SP10). Tiền đề: SP3 (`MEDIA_RULES`, `preflight`), SP5 (composer), SP8 (pillar, hiệu quả bài, `vnEvents`).

## Quyết định trong plan (cần duyệt)

1. Model mặc định `claude-opus-5-5` (cấu hình `AI_MODEL`). `output_config.effort` cấu hình theo tác vụ qua `AI_EFFORT_<TASK>`, mặc định `medium` (mặc định của model). Việc hạ effort hoặc đổi model rẻ hơn để tiết kiệm là quyết định của chủ repo sau khi đo trên mẫu thật.
2. Bật fallback phía máy chủ khi model từ chối vì an toàn: beta `server-side-fallback-2026-07-01`, `fallbacks: 'default'`. Kiểm `stop_reason === 'refusal'` trước khi đọc nội dung; nếu cả chuỗi từ chối, trả lỗi `AI_REFUSED` tiếng Việt cho người dùng.
3. Không gửi dữ liệu cá nhân của người bình luận (SP9) vào prompt. Chỉ gửi: nội dung gốc, mô tả sản phẩm, giọng thương hiệu, tiêu đề/hook của bài cũ thuộc brand.
4. Phụ đề: whisper.cpp tự host trong worker (dữ liệu âm thanh không rời hạ tầng DSM); Claude chỉ sửa dấu câu, chính tả, ngắt dòng ≤ 42 ký tự/dòng. Phụ đề là P2.
5. AI không bao giờ tự đăng: mọi kết quả về trạng thái `DRAFT`; workspace có thể bật "tự động lên lịch nháp AI" nhưng vẫn cần một người bấm duyệt (roadmap M7).

## Global Constraints

- Ràng buộc chung SP2 (Node, pnpm, `pnpm verify`, `MIN_NODE_TESTS`, trailer commit). **Không gọi API Claude thật trong `pnpm test`**: `AiService` nhận client qua constructor; test dùng client giả trả JSON mẫu. Một script đánh giá riêng (`scripts/ai/eval-captions.mjs`) gọi API thật, chỉ chạy tay và tốn tiền thật.
- Khóa API: `ANTHROPIC_API_KEY` chỉ ở worker/API phía máy chủ, không bao giờ xuống trình duyệt.
- Đầu ra tuân giới hạn SP3: IG ≤ 5 hashtag, YouTube tiêu đề ≤ 100 ký tự, mô tả ≤ 5000; mọi caption qua `preflight()`.
- `max_tokens`: 16 000 cho gọi không stream; kế hoạch 30 ngày dùng streaming (`client.beta.messages.stream(...)` + `finalMessage()`), `max_tokens` 64 000.
- Thông điệp lỗi cho người dùng bằng tiếng Việt; không lộ prompt hay khóa.

## Review Focus

- Model trả JSON đúng schema nhưng caption IG có 8 hashtag: hệ thống cắt còn 5 và báo cảnh báo, không để lỗi lọt sang bước đăng → Task 2 test `kết quả vượt giới hạn được cắt theo preflight`.
- Model từ chối (refusal) ở mọi model trong chuỗi fallback: người dùng thấy thông báo rõ, không có bản nháp rỗng → Task 1 test `refusal cả chuỗi trả AI_REFUSED`.
- Hết hạn mức AI của gói: chặn trước khi gọi API, không tính tiền → Task 1 test `hết hạn mức không gọi API`.
- Giọng thương hiệu đổi: cache cũ không làm kết quả theo giọng cũ (khóa cache gắn phiên bản giọng) → Task 1 test `đổi brand voice đổi phần system có cache`.
- Kế hoạch 30 ngày rơi vào ngày đã có bài: không tạo trùng, đánh dấu "đã có bài" → Task 4 test `kế hoạch bỏ qua ngày đã có bài cùng kênh`.

---

### Task 1: `AiService` lõi

**Files:**
- Modify: `apps/api/package.json` (thêm `@anthropic-ai/sdk`, `zod` nếu chưa có ở API), lockfile
- Create: `apps/api/src/modules/ai/ai.service.ts`, `apps/api/src/modules/ai/prompts.ts`, `apps/api/src/modules/ai/schemas.ts`
- Modify: domain/repositories/schema (`BrandVoice {brandId; version:number; tone:string; doList:string[]; dontList:string[]; samplePosts:string[]}`, `AiUsage {id; workspaceId; task:AiTask; inputTokens; outputTokens; cacheReadTokens; createdAt}`), migration `0014_ai`
- Test: `tests/ai/ai-service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AiTask = 'CAPTION' | 'YOUTUBE_META' | 'PLAN_30D' | 'SUBTITLE_CLEANUP';
  export interface AiClient { // tập con của client SDK, để test thay bằng bản giả
    beta: { messages: {
      create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage>;
      stream(params: Anthropic.Beta.MessageCreateParamsStreaming): { finalMessage(): Promise<Anthropic.Beta.BetaMessage> };
    } };
  }
  export class AiService {
    constructor(deps:{client:AiClient; repos:Repositories; quota:(workspaceId:string, task:AiTask)=>Promise<boolean>; model?:string; effort?:Partial<Record<AiTask,'low'|'medium'|'high'>>});
    run<T>(task:AiTask, brandId:string, schema:z.ZodType<T>, userContent:string, opts?:{stream?:boolean}):Promise<{data:T; usage:{input:number; output:number; cacheRead:number}}>;
  }
  export function buildSystem(brandVoice:BrandVoice|undefined):Anthropic.Beta.BetaTextBlockParam[]; // [quy tắc nền tảng cố định (cache_control ephemeral), giọng brand v<version> (cache_control ephemeral)]
  ```
  Gọi: `client.beta.messages.create({ model, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system: buildSystem(voice), output_config: { effort, format: zodOutputFormat(schema) }, messages: [{ role: 'user', content: userContent }] })`; lấy khối `text` đầu tiên, `schema.parse(JSON.parse(text))`. Lỗi SDK bắt theo lớp (`Anthropic.RateLimitError` → `AI_BUSY` retry sau, `Anthropic.BadRequestError` → `AI_BAD_REQUEST`, `Anthropic.APIError` → `AI_UNAVAILABLE`).

- [ ] **Step 1: Viết test** với client giả ghi lại tham số:
  - `gửi model, fallbacks default và beta header đúng`;
  - `hết hạn mức không gọi API` (`quota` trả false → ném `AI_QUOTA_EXCEEDED`, client giả không được gọi);
  - `refusal cả chuỗi trả AI_REFUSED` (client giả trả `stop_reason: 'refusal'`);
  - `JSON sai schema ném AI_INVALID_OUTPUT`;
  - `đổi brand voice đổi phần system có cache` (version 1 → 2 làm thay đổi text khối thứ hai, khối thứ nhất giữ nguyên từng byte);
  - `ghi AiUsage theo usage trả về` (kể cả `cache_read_input_tokens`).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(ai): Claude-backed AI service with structured output, caching and fallbacks`.

### Task 2: Caption, hook, hashtag theo nền tảng

**Files:**
- Modify: `apps/api/src/modules/ai/schemas.ts`, `prompts.ts`; route `POST /brands/:brandId/ai/captions` body `{contentId:string; platforms:Platform[]; variantsPerPlatform?:1|2|3}`
- Test: `tests/ai/captions.test.ts`

**Interfaces:**
- Produces: `CaptionSuggestionSchema = z.object({ platform: z.enum([...]), hook: z.string(), caption: z.string(), hashtags: z.array(z.string()), cta: z.string().optional(), rationale: z.string() })`, đầu ra `{suggestions: CaptionSuggestion[]}`; `AiService.captions(brandId, contentId, platforms, n):Promise<{suggestions:(CaptionSuggestion & {issues:PreflightIssue[]})[]}>`.

- [ ] **Step 1: Viết test**: `kết quả vượt giới hạn được cắt theo preflight` (client giả trả 8 hashtag cho IG → còn 5, có issue `IG_HASHTAG_MAX` mức `warning` "Đã cắt bớt"); `prompt có quy tắc nền tảng và nội dung gốc, không có dữ liệu bình luận`; `hashtag tiếng Việt giữ dấu`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(ai): platform-aware Vietnamese captions, hooks and hashtags`.

### Task 3: Tiêu đề, mô tả, chapter YouTube

**Files:**
- Modify: `schemas.ts`, `prompts.ts`; route `POST /brands/:brandId/ai/youtube-meta` body `{contentId; transcript?:string}`
- Test: `tests/ai/youtube-meta.test.ts`

**Interfaces:**
- Produces: `YoutubeMetaSchema = z.object({ titles: z.array(z.string()).min(3).max(5), description: z.string(), tags: z.array(z.string()), chapters: z.array(z.object({ start: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/), title: z.string() })) })`.

- [ ] **Step 1: Viết test**: `tiêu đề trên 100 ký tự bị loại khỏi gợi ý`; `chapter đầu tiên phải bắt đầu 0:00 nếu có chapter` (quy tắc của YouTube; sai thì bỏ toàn bộ chapter kèm cảnh báo); `mô tả có ngoặc nhọn bị làm sạch` (khớp preflight SP7).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(ai): YouTube titles, descriptions and chapters`.

### Task 4: Kế hoạch 30 ngày và thư viện hook

**Files:**
- Create: `apps/api/src/modules/ai/content-plan.service.ts`, `apps/api/src/modules/growth/hook-library.service.ts`
- Modify: route `POST /brands/:brandId/ai/plan` body `{startDate:string; socialAccountIds:string[]}`, `GET /brands/:brandId/hooks`
- Modify: domain/repositories/schema (`ContentItem.plannedAt?:number`, `ContentItem.plannedSocialAccountId?:string`), migration `0015_planned_content`; `PublishingService.listCalendar` (SP5) trả thêm mục kế hoạch dạng `{kind:'PLANNED'}`
- Test: `tests/ai/content-plan.test.ts`, `tests/growth/hook-library.test.ts`

**Interfaces:**
- Consumes: `ContentPillar`, `cadence`, `vnEvents`, `byPillar` (SP8).
- Produces: `PlanSchema = z.object({ items: z.array(z.object({ date: z.string(), socialAccountId: z.string(), pillarId: z.string(), format: z.enum(['TEXT','LINK','IMAGE','ALBUM','VIDEO','REEL','STORY','SHORT']), idea: z.string(), hook: z.string(), eventName: z.string().optional() })) })`; `ContentPlanService.generate(brandId, startDate, accountIds):Promise<{created:ContentItem[]; skipped:{date:string; socialAccountId:string; reason:'ALREADY_SCHEDULED'}[]}>` — tạo `ContentItem` `DRAFT` có `title = idea`, `hook`, `pillarId`, gắn ngày dự kiến (`plannedAt`) chứ không tạo `PublishJob`. `HookLibrary.top(brandId, limit=50):Promise<{hook:string; views:number; platform:Platform; postUrl?:string}[]>` = hook của bài thuộc top 10% lượt xem 90 ngày.

- [ ] **Step 1: Viết test**: `kế hoạch bỏ qua ngày đã có bài cùng kênh`; `số bài mỗi kênh theo ChannelGoal.postsPer28Days quy về 30 ngày` (mục tiêu 28 → 30 bài; client giả trả 32 → giữ 30, cảnh báo); `ngày sale 11/11 có eventName`; `hook library chỉ lấy top 10%` (20 bài → 2 hook).
- [ ] **Step 2–4:** FAIL → hiện thực (gọi `AiService.run('PLAN_30D', …, {stream:true})`) → PASS.
- [ ] **Step 5: Commit** `feat(ai): 30-day content plan drafts and hook library`.

### Task 5: Giao diện AI trong composer và lịch

**Files:**
- Create: `apps/web/src/features/compose/ai-panel.tsx`, `ai-panel-model.ts`; `apps/web/src/features/calendar/plan-dialog.tsx`
- Modify: `compose-page.tsx` (nút "Gợi ý bằng AI" trên từng tab nền tảng), `calendar-dashboard.tsx` (nút "Lập kế hoạch 30 ngày"; bản nháp kế hoạch hiển thị viền nét đứt)
- Test: `tests/web/ai-panel-model.test.ts`, mở rộng `apps/web/tests/compose-journey.spec.ts` (client AI giả khi `APP_ENV=test`)

**Interfaces:**
- Produces: `applySuggestion(state:ComposeState, platform:Platform, s:CaptionSuggestion):ComposeState` (ghi đè caption/hashtags/hook của đúng biến thể, `isDirty` true, không tự lưu, không tự đăng).

- [ ] **Step 1: Viết test**: `áp gợi ý chỉ đổi biến thể được chọn`; `áp gợi ý không đổi lịch đăng`; E2E: bấm "Gợi ý bằng AI" → chọn gợi ý 2 → caption trong ô đổi theo → vẫn cần bấm "Đăng ngay".
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5: Commit** `feat(web): AI suggestions in the composer and 30-day plan on the calendar`.

### Task 6: Phụ đề tiếng Việt (P2)

**Files:**
- Create: `apps/worker/src/media/transcribe.ts`, `apps/worker/src/media/srt.ts`; `infrastructure/docker/Dockerfile.worker` (whisper.cpp + model `ggml-large-v3.bin`, tải lúc build, kiểm SHA256)
- Modify: `youtube.adapter.ts` (`captions.insert` với file SRT khi biến thể có phụ đề), route `POST /brands/:brandId/media/:assetId/subtitles`
- Test: `tests/media/srt.test.ts`, `tests/media/transcribe.test.ts` (dùng `tests/fixtures/media/vi-speech-5s.wav` và một bản transcript mẫu; test transcribe chỉ kiểm việc gọi tiến trình với tham số `-l vi -osrt`, tiến trình giả trả SRT)

**Interfaces:**
- Produces: `transcribe(filePath:string, opts:{language:'vi'; binary:string; model:string}):Promise<{segments:{startMs:number; endMs:number; text:string}[]}>`; `toSrt(segments, maxLineChars=42):string`; `AiService.run('SUBTITLE_CLEANUP', …)` chỉ sửa chữ, giữ nguyên mốc thời gian (assert số đoạn và mốc không đổi).

- [ ] **Step 1: Viết test**: `toSrt đánh số từ 1, định dạng 00:00:01,000 --> 00:00:02,500`; `ngắt dòng không quá 42 ký tự và không cắt giữa từ`; `cleanup không đổi mốc thời gian` (client AI giả đổi mốc → bị từ chối, giữ bản gốc, cảnh báo).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Đặt `MIN_NODE_TESTS`, `pnpm verify` → PASS.
- [ ] **Step 6: Commit** `feat(media): Vietnamese subtitles with self-hosted speech recognition`.

### Task 7: Đánh giá chất lượng (chạy tay)

**Files:**
- Create: `scripts/ai/eval-captions.mjs`, `scripts/ai/eval-set.json` (20 nội dung gốc thật của kênh dogfood do chủ repo cung cấp, đã bỏ dữ liệu cá nhân)
- Create: `docs/runbooks/ai-evaluation.md`

- [ ] **Step 1:** Script gọi `AiService` thật cho 20 mẫu × 4 nền tảng, ghi JSON kết quả và chi phí ước tính từ `usage` vào `<scratch>/ai-eval-<ngày>.json` (không commit), in tỉ lệ đầu ra qua preflight không cần cắt.
- [ ] **Step 2:** Chủ repo chấm thủ công theo 4 tiêu chí trong runbook (đúng giọng, đúng nền tảng, tiếng Việt tự nhiên, không sai thông tin sản phẩm). Điều kiện bật AI cho beta: ≥ 80% mẫu đạt cả 4 tiêu chí. Chạy script tốn tiền thật, cần chủ repo đồng ý trước mỗi lần.
- [ ] **Step 3: Commit** `docs(ai): manual evaluation script and runbook`.

## Self-review

- M7 (caption/hook/hashtag, YouTube, phụ đề; cắt video dài để sau GĐ5) → Task 2, 3, 6; M4 (kế hoạch 30 ngày, thư viện hook) → Task 4; nguyên tắc "AI chỉ tạo bản nháp" → Task 5 + quyết định 5; hạn mức theo gói → Task 1 (`quota` do SP11 cung cấp).
- Tên dùng chung: `AiService.run/captions`, `AiTask`, `BrandVoice`, `AiUsage`, `CaptionSuggestion`, `ContentPlanService.generate`, `HookLibrary.top`, `applySuggestion`.
