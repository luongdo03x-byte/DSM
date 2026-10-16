# DSM SP3 — Mô hình nội dung nhiều media và media pipeline (ảnh + video) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho một nội dung gốc chứa nhiều media có thứ tự (ảnh đơn, album, video), tự chuẩn hóa ảnh/kiểm tra video theo từng nền tảng, và kiểm tra trước khi đăng (pre-flight) theo ma trận định dạng của roadmap.

**Architecture:** Thêm `YOUTUBE` vào `Platform`, `ALBUM` vào `ContentType`, hai bảng `ContentMedia` và `VariantMedia`. Quy tắc từng nền tảng nằm trong một bảng cấu hình thuần dữ liệu (`MEDIA_RULES`); `preflight()` là hàm thuần dùng bảng đó. Xử lý file chạy trong worker media: `sharp` cho ảnh, `ffprobe`/`ffmpeg` cho video.

**Tech Stack:** TypeScript, `sharp` (libvips), ffmpeg/ffprobe hệ thống (qua `child_process.spawn`), S3-compatible storage (`S3ObjectStorage` hiện có), node:test.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 3.1 ma trận định dạng, mục 5 M2, mục 6 quyết định 4, "Dữ liệu cần thêm"; mục 13 dòng SP3). Tiền đề: SP2.

## Quyết định trong plan (cần duyệt)

1. `ContentFormat` là khái niệm hiển thị ra người dùng: `TEXT | LINK | IMAGE | ALBUM | VIDEO | REEL | STORY | SHORT`. Định dạng của mỗi biến thể được suy ra từ nội dung gốc + nền tảng + tỉ lệ video; người dùng chỉ đổi được khi có lựa chọn (ví dụ FB video ngang → `VIDEO` hay `REEL`).
2. Ảnh gốc giữ nguyên; bản chuẩn hóa theo nền tảng là asset con (`derivedFromAssetId`, `variantKey` như `instagram-4x5`). Không ghi đè file gốc.
3. Tỉ lệ cắt mặc định: Instagram 4:5 (khóa theo ảnh đầu của carousel), TikTok ảnh 9:16, Facebook giữ tỉ lệ gốc. Người dùng chọn vùng cắt bằng tọa độ phần trăm, lưu trong `VariantMedia.crop`.
4. Giới hạn số liệu lấy từ roadmap mục 3.1; con số nào roadmap ghi "cần xác minh" (số ảnh tối đa bài Facebook nhiều ảnh) đặt là `FACEBOOK_ALBUM_MAX = 10` dạng cấu hình và có test riêng để dễ đổi.
5. Threads giữ nguyên: vẫn có biến thể Threads khi tài khoản Threads tồn tại, quy tắc giữ như hiện tại.

## Global Constraints

- Mọi ràng buộc chung của SP2 (Node, pnpm, cổng `pnpm verify`, `MIN_NODE_TESTS`, trailer commit).
- Giá trị quy tắc (từ roadmap mục 3.1): Instagram chỉ JPEG, carousel tối đa **10** mục, tối đa **5** hashtag, crop theo ảnh đầu; TikTok ảnh tối đa **35**, chỉ `PULL_FROM_URL`; YouTube không đăng ảnh; YouTube tiêu đề tối đa **100** ký tự; Facebook ảnh chưa đăng hết hạn sau khoảng 24 giờ (worker upload lúc đăng).
- Ảnh xuất ra luôn xóa toàn bộ EXIF/GPS.
- Không đổi hợp đồng HTTP cũ; route mới thêm vào cạnh route cũ.

## Review Focus

- Ảnh HEIC/PNG/WebP từ điện thoại khi đăng Instagram: phải tự chuyển JPEG, không báo lỗi người dùng → Task 3 test `chuẩn hóa PNG và HEIC thành JPEG`.
- Ảnh có tọa độ GPS: bản xuất không còn EXIF → Task 3 test `bản chuẩn hóa không còn EXIF`.
- Album 12 ảnh gửi Instagram: pre-flight báo lỗi rõ "tối đa 10", không cắt bớt âm thầm → Task 2 test `instagram album 12 ảnh lỗi IG_ALBUM_MAX`.
- Bài ảnh chọn cả YouTube: biến thể YouTube bị bỏ qua kèm lý do, các nền tảng khác vẫn đăng → Task 4 test `copyMasterToAll bỏ qua YouTube cho bài ảnh`.
- Video dọc 70 giây cho YouTube: không phải Shorts (giới hạn 3 phút thì vẫn là Shorts) — định dạng suy ra phải đúng → Task 2 test `suy ra SHORT cho video dọc dưới 180 giây`.

---

### Task 1: Mở rộng domain và schema

**Files:**
- Modify: `packages/shared/src/domain.ts`
- Modify: `packages/shared/src/repositories.ts`, `packages/shared/src/memory-repositories.ts`, `packages/database/src/prisma-repositories.ts`, `packages/database/src/mappers.ts`
- Modify: `packages/database/prisma/schema.prisma`; Create: `packages/database/prisma/migrations/0003_multi_media/migration.sql`
- Test: thêm case vào `tests/repositories/repository-contract.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Platform='FACEBOOK'|'INSTAGRAM'|'THREADS'|'TIKTOK'|'YOUTUBE';
  export type ContentType='VIDEO'|'IMAGE'|'ALBUM'|'TEXT';
  export type ContentFormat='TEXT'|'LINK'|'IMAGE'|'ALBUM'|'VIDEO'|'REEL'|'STORY'|'SHORT';
  export interface MediaAsset { /* trường cũ */ derivedFromAssetId?:string; variantKey?:string; exifStripped?:boolean; codec?:string }
  export interface ContentMedia { id:string; contentItemId:string; mediaAssetId:string; position:number }
  export interface CropBox { x:number; y:number; width:number; height:number } // phần trăm 0–100
  export interface VariantMedia { id:string; contentVariantId:string; mediaAssetId:string; position:number; crop?:CropBox; isCover:boolean }
  export interface ContentVariant { /* trường cũ */ format?:ContentFormat; title?:string; skippedReason?:string }
  // Repositories thêm: contentMedia:Repo<ContentMedia>; variantMedia:Repo<VariantMedia>
  ```

- [ ] **Step 1: Thêm vào contract** test `contentMedia giữ thứ tự position` (insert 3 bản ghi position 2,0,1 → `findBy({contentItemId})` sắp theo `position` trả 0,1,2) — hai repo phải trả đã sắp xếp.
- [ ] **Step 2: Chạy `pnpm test`** → FAIL (thuộc tính `contentMedia` không tồn tại).
- [ ] **Step 3: Cập nhật domain, repositories, schema, migration.** `masterAssetId` giữ để tương thích: khi tạo nội dung có đúng một media thì ghi cả `masterAssetId` lẫn một dòng `ContentMedia`.
- [ ] **Step 4: Chạy `pnpm test` và `pnpm typecheck`** → PASS. Sửa mọi chỗ `switch` theo `Platform` mà TypeScript báo thiếu `YOUTUBE` bằng nhánh `throw new Error('PLATFORM_NOT_SUPPORTED:YOUTUBE')` (SP7 hiện thực).
- [ ] **Step 5: Commit** `feat(shared): add album content, ordered content and variant media, YouTube platform`.

### Task 2: Bảng quy tắc định dạng và `preflight()`

**Files:**
- Create: `packages/shared/src/media-rules.ts`, `packages/shared/src/preflight.ts`
- Test: `tests/shared/preflight.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MediaFacts { kind:'IMAGE'|'VIDEO'; mimeType:string; width:number; height:number; sizeBytes:number; durationMs?:number }
  export interface PlatformRule { formats:ContentFormat[]; imageMime:string[]; albumMax?:number; hashtagMax?:number; captionMax:number; titleMax?:number; shortMaxSec?:number; videoMaxSec?:number; imageSource?:'UPLOAD'|'PULL_FROM_URL'; supportsImage:boolean }
  export const MEDIA_RULES:Record<Platform,PlatformRule>;
  export const FACEBOOK_ALBUM_MAX:number; // 10
  export interface PreflightIssue { code:string; severity:'error'|'warning'; message:string; field?:'caption'|'title'|'hashtags'|'media' }
  export interface PreflightInput { platform:Platform; format:ContentFormat; caption?:string; title?:string; hashtags:string[]; media:MediaFacts[] }
  export function preflight(input:PreflightInput):PreflightIssue[];
  export function inferFormat(platform:Platform, type:ContentType, media:MediaFacts[]):{format:ContentFormat}|{skipped:string};
  ```
  Thông điệp `message` bằng tiếng Việt.

- [ ] **Step 1: Viết test** (mỗi test assert `code` và `severity`):
  - `instagram album 12 ảnh lỗi IG_ALBUM_MAX` (error), `instagram 6 hashtag lỗi IG_HASHTAG_MAX`, `instagram ảnh PNG cảnh báo IG_IMAGE_WILL_CONVERT` (warning — pipeline tự chuyển).
  - `tiktok album 36 ảnh lỗi TT_ALBUM_MAX`.
  - `youtube tiêu đề 101 ký tự lỗi YT_TITLE_MAX`; `inferFormat youtube bài ảnh trả skipped YT_NO_IMAGE_API`.
  - `suy ra SHORT cho video dọc dưới 180 giây` (1080×1920, 70 000 ms → `SHORT`; 200 000 ms → `VIDEO`).
  - `facebook album 11 ảnh lỗi FB_ALBUM_MAX` với `FACEBOOK_ALBUM_MAX = 10`.
  - `văn bản thuần chỉ hợp lệ trên Facebook` (`inferFormat` IG/TT/YT với `TEXT` → `skipped`).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Hiện thực** theo đúng các giới hạn ở Global Constraints. `captionMax`: Instagram 2200, TikTok 2200, Facebook 63 206, YouTube mô tả 5000.
- [ ] **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat(shared): add per-platform media rules and preflight checks`.

### Task 3: Xử lý ảnh và kiểm tra video

**Files:**
- Modify: `apps/worker/package.json` (thêm `sharp`), `pnpm-workspace.yaml` (`onlyBuiltDependencies` thêm `sharp`), lockfile
- Create: `apps/worker/src/media/image-normalizer.ts`, `apps/worker/src/media/video-probe.ts`
- Create: `tests/fixtures/media/gps.jpg`, `tests/fixtures/media/sample.png`, `tests/fixtures/media/sample.heic`, `tests/fixtures/media/vertical-3s.mp4` (sinh bằng script trong Step 1, commit file nhỏ < 200 KB mỗi file)
- Create: `scripts/make-media-fixtures.mjs`
- Test: `tests/media/image-normalizer.test.ts`, `tests/media/video-probe.test.ts`
- Modify: `.github/workflows/ci.yml` (cài `ffmpeg` bằng `apt-get` trước `pnpm test`), `infrastructure/docker/Dockerfile.worker`

**Interfaces:**
- Produces:
  ```ts
  export interface NormalizeTarget { aspect?:{w:number;h:number}; crop?:CropBox; maxBytes:number; maxLongEdge:number }
  export async function normalizeImage(input:Buffer, target:NormalizeTarget):Promise<{buffer:Buffer; width:number; height:number; mimeType:'image/jpeg'}>;
  export async function probeVideo(filePath:string):Promise<{durationMs:number; width:number; height:number; codec:string}>;
  ```

- [ ] **Step 1: Viết `scripts/make-media-fixtures.mjs`** (dùng `sharp` để tạo PNG và JPEG có EXIF GPS, `ffmpeg -f lavfi -i testsrc=size=1080x1920:rate=30 -t 3` để tạo MP4); chạy một lần và commit fixture.
- [ ] **Step 2: Viết test**:
  - `chuẩn hóa PNG và HEIC thành JPEG` (mimeType `image/jpeg`, `sharp(buffer).metadata().format === 'jpeg'`).
  - `bản chuẩn hóa không còn EXIF` (`metadata().exif === undefined`).
  - `cắt 4:5 cho ảnh 1080×1080` → `width/height` = 0,8 ± 0,01.
  - `ảnh vượt maxBytes được nén lại dưới ngưỡng` (`maxBytes: 300_000`).
  - `probeVideo đọc đúng thời lượng và kích thước` (3000 ± 100 ms, 1080×1920, codec `h264`).
- [ ] **Step 3: Chạy** → FAIL.
- [ ] **Step 4: Hiện thực**: `sharp(input).rotate()` (áp hướng EXIF rồi bỏ), `extract` theo crop, `resize` theo `maxLongEdge`, `jpeg({quality})` giảm dần từ 90 tới 60 đến khi ≤ `maxBytes`; `withMetadata` **không** gọi. `probeVideo` chạy `ffprobe -v error -print_format json -show_streams -show_format`.
- [ ] **Step 5: Chạy `pnpm test`** → PASS.
- [ ] **Step 6: Commit** `feat(worker): add image normalizer and video probe`.

### Task 4: Dịch vụ nội dung nhiều media và sinh biến thể theo định dạng

**Files:**
- Modify: `apps/api/src/modules/content/content.service.ts`, `apps/api/src/modules/media/media.service.ts`
- Modify: `apps/api/src/runtime/local-api.ts` (route mới)
- Test: `tests/services/content-media.test.ts`, mở rộng `tests/integration/http-api-smoke.test.ts` bằng test mới `http api album journey`

**Interfaces:**
- Produces:
  ```ts
  ContentService.create(brandId:string, input:{type:ContentType; title:string; body?:string; hook?:string; cta?:string; productId?:string; mediaAssetIds?:string[]}, userId:string):Promise<ContentItem>
  ContentService.setMedia(brandId:string, contentId:string, mediaAssetIds:string[]):Promise<ContentMedia[]>
  ContentService.copyMasterToAll(brandId:string, contentId:string):Promise<ContentVariant[]> // đặt format hoặc skippedReason
  ContentService.setVariantMedia(brandId:string, variantId:string, items:{mediaAssetId:string; crop?:CropBox; isCover?:boolean}[]):Promise<VariantMedia[]>
  ContentService.preflightVariant(brandId:string, variantId:string):Promise<PreflightIssue[]>
  ```
  Route: `PUT /brands/:brandId/content/:id/media` body `{mediaAssetIds:string[]}`; `PUT /brands/:brandId/content/:id/variants/:variantId/media` body `{items:[…]}`; `GET /brands/:brandId/content/:id/variants/:variantId/preflight` → `{issues:PreflightIssue[]}`.

- [ ] **Step 1: Viết test**:
  - `copyMasterToAll bỏ qua YouTube cho bài ảnh` (ALBUM 3 ảnh → biến thể YOUTUBE có `skippedReason: 'YT_NO_IMAGE_API'`, `status: 'DRAFT'`; FB `ALBUM`, IG `ALBUM`, TIKTOK `ALBUM`).
  - `setMedia giữ đúng thứ tự gửi lên`.
  - `validate từ chối biến thể có lỗi preflight` (IG 11 ảnh → `publish/validate` trả lỗi `IG_ALBUM_MAX`).
  - `http api album journey`: upload 3 ảnh → tạo ALBUM → copy → preflight IG rỗng → READY → publish FB/IG/TT với FakePublisher → batch PUBLISHED.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Hiện thực.** `PublishingService.validateTargets` gộp kết quả `preflightVariant` vào `errors`/`warnings`; biến thể có `skippedReason` không được chọn để đăng (`VARIANT_SKIPPED`).
- [ ] **Step 4: Chạy `pnpm test`** → PASS.
- [ ] **Step 5: Commit** `feat(api): multi-media content, format-aware variants and preflight in validation`.

### Task 5: Worker media sinh asset con và cấp URL cho nền tảng

**Files:**
- Create: `apps/worker/src/media/media-jobs.ts`
- Modify: `apps/worker/src/publishing/publish-input.builder.ts`, `packages/platform-contracts/src/index.ts`
- Test: `tests/media/media-jobs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // PublishInput thêm:
  media?:{ url:string; mimeType:string; kind:'IMAGE'|'VIDEO'; width:number; height:number; durationMs?:number }[]
  export async function prepareVariantMedia(repos:Repositories, storage:ObjectStorage, variantId:string, rule:PlatformRule):Promise<MediaAsset[]> // trả asset con đã chuẩn hóa, theo position
  ```
  URL ảnh cho nền tảng dùng tiền tố cấu hình `PUBLIC_MEDIA_BASE_URL` (domain media công khai — TikTok xác minh ở SP6); thiếu biến này thì dùng signed URL hiện có.

- [ ] **Step 1: Viết test** `prepareVariantMedia tạo asset con JPEG theo crop và tái dùng khi gọi lại` (lần 2 không tạo asset mới: số asset có `derivedFromAssetId` không đổi) và `publish input có media theo đúng thứ tự`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Hiện thực**; `variantKey` = `${platform}-${aspectW}x${aspectH}-${cropHash}`.
- [ ] **Step 4: Chạy** → PASS; `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(worker): derive platform-ready media assets for variants`.

### Task 6: Nâng `MIN_NODE_TESTS` và tài liệu

**Files:**
- Modify: `scripts/verify-v1.mjs` (`MIN_NODE_TESTS` = số test đo được), `docs/verification/v1-acceptance.md` (mục `## Media pipeline (SP3)` `Status: CI`), `docs/runbooks/local-development.md` (cần `ffmpeg` trong PATH)

- [ ] **Step 1: Chạy `pnpm test`**, ghi số `pass`; đặt `MIN_NODE_TESTS` bằng số đó.
- [ ] **Step 2: Chạy `pnpm verify`** → PASS.
- [ ] **Step 3: Commit** `chore(verify): raise node test floor after SP3`.

## Self-review

- Roadmap 3.1 (ma trận, ràng buộc ảnh) → Task 2, 5; M2 (xử lý ảnh, sắp xếp album, cắt ảnh, pre-flight) → Task 2–5; "Dữ liệu cần thêm" (`ContentMedia`, `VariantMedia`, `ALBUM`) → Task 1. UI chọn/cắt ảnh nằm ở SP5 (Composer), dùng route của Task 4.
- Tên dùng chung cho SP4–SP7: `MEDIA_RULES`, `PlatformRule`, `preflight`, `PreflightIssue`, `ContentFormat`, `PublishInput.media`.
