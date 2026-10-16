# DSM SP2 — Runtime bền vững (Repository, PostgreSQL, BullMQ, worker riêng) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách lớp dữ liệu khỏi `MemoryStore` bằng repository bất đồng bộ, có bản PostgreSQL (Prisma) và hàng đợi BullMQ với worker chạy riêng, để lịch đăng không mất khi tắt máy hoặc restart.

**Architecture:** Thêm interface `Repositories` trong `packages/shared`; hai hiện thực `MemoryRepositories` (bọc `MemoryStore`, giữ chế độ dev/test hiện tại) và `PrismaRepositories` (`packages/database`). Mọi service đổi constructor từ `MemoryStore` sang `Repositories` và trở thành async. Hàng đợi qua interface `JobQueue` với `InMemoryJobQueue` và `BullJobQueue`; worker là process riêng ở chế độ postgres. Chọn runtime bằng biến `RUNTIME_STORE`.

**Tech Stack:** TypeScript (Node ≥ 24.7, strip-types), Prisma 7 + `@prisma/adapter-pg`, PostgreSQL 17, BullMQ 5 + ioredis, node:test, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-13-dsm-social-growth-platform-design.md` (mục 6 "Quyết định kỹ thuật" 1–2, 7–8; GĐ0; mục 13 dòng SP2). Tiền đề: SP1 đã merge (`docs/superpowers/plans/2026-10-13-dsm-sp1-ci-verification-gate.md`).

## Quyết định trong plan (cần duyệt)

1. Chọn runtime bằng `RUNTIME_STORE=memory|postgres`. `DEV_IN_MEMORY=1` tiếp tục có nghĩa `memory` để không phá E2E/HTTP smoke của SP1.
2. Repository là CRUD tối giản (`get`, `findBy`, `insert`, `update`, `remove`) cộng `transaction`. Không viết query builder; truy vấn đặc thù (lịch theo khoảng thời gian, job đến hạn) là method riêng có tên.
3. Test repository chạy một bộ "contract" chung trên cả hai hiện thực. Bản Postgres **không được skip** (luật 2 của lint SP1): `pnpm test` cần `DATABASE_URL_TEST`, local dùng `docker compose up -d postgres redis`, CI dùng service container.
4. BullMQ chỉ giữ lịch và thời điểm chạy; trạng thái job, số lần thử và retry vẫn do `PublishJob` trong DB và `RetryPolicy` quyết định (`attempts: 1` trong BullMQ). BullMQ `jobId` = `PublishJob.id` để chống trùng.
5. Staging: một VPS chạy Docker Compose (`web`, `api`, `worker`, `postgres`, `redis`), media ở object storage ngoài. Không làm Kubernetes.

## Global Constraints

- Node `>=24.7 <25`, pnpm 10.17.1, `pnpm install --frozen-lockfile`; mọi dependency mới phải vào lockfile trong cùng commit.
- Cổng SP1 phải xanh ở mọi commit: `pnpm verify` (lint, typecheck 3 chương trình, test, build, E2E, verify-v1). Không `skip`, `todo`, `only`, `expectFailure`.
- `MIN_NODE_TESTS` trong `scripts/verify-v1.mjs` phải tăng đúng bằng số test mới ở task cuối.
- Không đổi hợp đồng HTTP hiện có (route, status, body) của `apps/api/src/runtime/local-api.ts`; HTTP smoke và E2E của SP1 là test hồi quy.
- Token và credential vẫn mã hóa AES-GCM như hiện tại (`CredentialCryptoService`); cột DB chỉ lưu ciphertext/iv/authTag.
- Threads và Browser Gateway giữ nguyên hành vi.
- Mỗi commit kết thúc bằng hai trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` và `Claude-Session: https://claude.ai/code/session_018RMsYkjQYMMpBsy2saUHQx`.

## Review Focus

- Restart worker giữa lúc job đã lên lịch: job phải chạy đúng một lần sau khi worker mới lên → Task 8 test `restart worker không mất job`.
- Hai worker cùng nhận một job (scale ngang): chỉ một lần gọi publisher → Task 8 test `hai worker không đăng trùng` (khóa bằng cập nhật có điều kiện `status QUEUED → PROCESSING`).
- Đổi lịch hoặc hủy job đã nằm trong BullMQ: không được chạy theo giờ cũ → Task 7 test `cancel và reschedule thay job trong hàng đợi`.
- Snapshot JSON cũ (`DEV_STORE_FILE`) vẫn nạp được sau khi service chuyển sang async → Task 3 test `memory repositories nạp snapshot cũ`.
- Mất kết nối Postgres giữa chừng: API trả 503 `STORE_UNAVAILABLE`, không 500 kèm stack → Task 6 test `local-api trả 503 khi repository lỗi kết nối`.

---

### Task 1: Hợp đồng `Repositories` và bộ test contract

**Files:**
- Create: `packages/shared/src/repositories.ts`
- Create: `tests/repositories/repository-contract.ts`
- Create: `tests/repositories/memory-repositories.test.ts`
- Create: `packages/shared/src/memory-repositories.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Repo<T extends {id:string}> {
    get(id:string):Promise<T|undefined>;
    findBy(where:Partial<T>):Promise<T[]>;
    insert(row:T):Promise<T>;            // ném 'DUPLICATE_ID' nếu id đã có
    update(id:string, patch:Partial<T>):Promise<T>; // ném 'NOT_FOUND'
    remove(id:string):Promise<void>;
  }
  export interface AppendRepo<T> { append(row:T):Promise<void>; findBy(where:Partial<T>):Promise<T[]> }
  export interface PublishJobRepo extends Repo<PublishJob> {
    findDue(now:number, limit:number):Promise<PublishJob[]>;      // status QUEUED|RETRYING, scheduledAt<=now, sắp theo scheduledAt
    claim(id:string, from:JobStatus[], to:JobStatus):Promise<boolean>; // cập nhật có điều kiện, true nếu thắng
    findInRange(brandId:string, from:number, to:number):Promise<PublishJob[]>;
  }
  export interface Repositories {
    users:Repo<User>; workspaces:Repo<Workspace>; brands:Repo<Brand>;
    memberships:AppendRepo<WorkspaceMember>;
    products:Repo<Product>; media:Repo<MediaAsset>; contents:Repo<ContentItem>; variants:Repo<ContentVariant>; campaigns:Repo<Campaign>;
    authSessions:Repo<AuthSession>; audit:AppendRepo<AuditLog>;
    socialAccounts:Repo<SocialAccount>; credentials:Repo<EncryptedCredential>;
    browserNodes:Repo<BrowserNode>; browserProfiles:Repo<BrowserProfile>; browserRegistrations:Repo<BrowserRegistration & {id:string}>;
    publishBatches:Repo<PublishBatch>; publishJobs:PublishJobRepo; publishAttempts:AppendRepo<PublishAttempt>;
    publishedPosts:Repo<PublishedPost>; postMetrics:AppendRepo<PostMetric>;
    trackedLinks:Repo<TrackedLink>; clickEvents:AppendRepo<ClickEvent>;
    transaction<R>(fn:(tx:Repositories)=>Promise<R>):Promise<R>;
  }
  export class MemoryRepositories implements Repositories { constructor(store:MemoryStore) }
  export function runRepositoryContract(name:string, make:()=>Promise<{repos:Repositories; reset():Promise<void>; close():Promise<void>}>):void
  ```
  `BrowserRegistration` dùng `id = nodeId`.

- [ ] **Step 1: Viết bộ contract** trong `tests/repositories/repository-contract.ts`: hàm `runRepositoryContract` đăng ký các test (mỗi test gọi `reset()` trước):
  - `insert rồi get trả đúng bản ghi` (Product đủ trường, kể cả `cost:'8'`, `sellingPrice:'29'`).
  - `insert trùng id ném DUPLICATE_ID`.
  - `update gộp patch và trả bản mới`; `update id không tồn tại ném NOT_FOUND`.
  - `findBy lọc theo nhiều trường` (variants theo `contentItemId` + `platform`).
  - `findDue chỉ trả QUEUED/RETRYING đến hạn, theo scheduledAt tăng dần, tôn trọng limit` (5 job: 2 đến hạn QUEUED, 1 RETRYING đến hạn, 1 chưa đến hạn, 1 PUBLISHED; limit 2 → 2 job sớm nhất).
  - `claim chỉ một lần thắng khi gọi song song` (`Promise.all` 10 lần `claim(id,['QUEUED'],'PROCESSING')` → đúng 1 `true`).
  - `transaction rollback khi fn ném` (insert product trong fn rồi ném → `get` trả `undefined`).
- [ ] **Step 2: Viết `tests/repositories/memory-repositories.test.ts`** gọi `runRepositoryContract('memory', …)` với `new MemoryRepositories(new MemoryStore())`.
- [ ] **Step 3: Chạy `pnpm test`** → FAIL: `Cannot find module '…/memory-repositories.ts'`.
- [ ] **Step 4: Hiện thực `packages/shared/src/repositories.ts` (chỉ kiểu) và `MemoryRepositories`.** Mỗi `Repo` bọc đúng `Map`/mảng của `MemoryStore`; trả bản sao (`structuredClone`) để caller không sửa store gián tiếp. `transaction` trên memory: chụp `structuredClone` toàn store, chạy `fn(this)`, ném lại và khôi phục khi lỗi. `claim` đồng bộ trong một tick nên an toàn.
- [ ] **Step 5: Chạy `pnpm test` và `pnpm typecheck`** → toàn bộ PASS (42 + 7 test contract).
- [ ] **Step 6: Commit** `feat(shared): add async repository contract and memory implementation`.

### Task 2: Prisma client chạy được và schema khớp domain

**Files:**
- Modify: `pnpm-workspace.yaml` (thêm `onlyBuiltDependencies: ['@prisma/engines','prisma']`)
- Modify: `packages/database/prisma/schema.prisma`, `packages/database/package.json` (script `generate`, `migrate:deploy`, `migrate:reset:test`)
- Create: `packages/database/prisma/migrations/0002_align_domain/migration.sql`
- Modify: `.gitignore` (thư mục client sinh ra của Prisma)
- Modify: `package.json` root (script `db:generate`; `typecheck` chạy `db:generate` trước)
- Test: `tests/repositories/schema-alignment.test.ts`

**Interfaces:**
- Produces: Prisma client import được từ `packages/database/src/client.ts`: `export function createPrismaClient(databaseUrl:string):PrismaClient`.

- [ ] **Step 1: Viết test `schema-alignment.test.ts`**: đọc `schema.prisma` bằng `fs`, với mỗi interface domain trong bảng dưới assert model tương ứng có đủ cột (tên camelCase):

  | Domain | Model | Cột bắt buộc |
  |---|---|---|
  | `PublishJob` | `PublishJob` | `scheduledAt`, `status`, `attemptCount`, `maxAttempts`, `idempotencyKey` (unique), `remoteCorrelationId`, `errorCode`, `errorMessage` |
  | `ContentVariant` | `ContentVariant` | `hashtags` (Json), `assetId`, `status` |
  | `EncryptedCredential` | `EncryptedCredential` | `ciphertext`, `iv`, `authTag`, `refreshCiphertext`, `expiresAt`, `scopes` |
  | `TrackedLink` | `TrackedLink` | `code` (unique), `utmSource`, `utmMedium`, `utmCampaign`, `utmContent` |
- [ ] **Step 2: Chạy test** → FAIL ở các cột còn thiếu (ghi lại danh sách thực tế làm căn cứ cho migration).
- [ ] **Step 3: Sửa `schema.prisma` và viết migration `0002_align_domain`** cho đủ các cột; thời gian lưu `BigInt` epoch-ms để khớp domain (`number`). Không xóa cột cũ.
- [ ] **Step 4: Chạy** `docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis`, `pnpm db:generate`, `DATABASE_URL=$DATABASE_URL_TEST pnpm --filter @app/database migrate:deploy`, rồi `pnpm test` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `build(database): generate Prisma client and align schema with domain`.

### Task 3: `PrismaRepositories` qua cùng bộ contract

**Files:**
- Create: `packages/database/src/prisma-repositories.ts`, `packages/database/src/mappers.ts`
- Create: `tests/repositories/postgres-repositories.test.ts`
- Create: `tests/repositories/memory-snapshot.test.ts`

**Interfaces:**
- Consumes: `Repositories`, `runRepositoryContract` (Task 1), `createPrismaClient` (Task 2).
- Produces: `export class PrismaRepositories implements Repositories { constructor(client:PrismaClient) }`.

- [ ] **Step 1: Viết `postgres-repositories.test.ts`**: nếu thiếu `process.env.DATABASE_URL_TEST` thì `throw new Error('DATABASE_URL_TEST is required (docker compose up -d postgres)')` ở mức module — không skip. `reset()` chạy `TRUNCATE … RESTART IDENTITY CASCADE` mọi bảng; `close()` gọi `$disconnect`. Gọi `runRepositoryContract('postgres', …)`.
- [ ] **Step 2: Viết `memory-snapshot.test.ts` (`memory repositories nạp snapshot cũ`)**: ghi một snapshot JSON định dạng hiện tại của `JsonStorePersistence` (1 brand, 1 product, 1 credential) vào thư mục `mkdtemp`, nạp bằng `JsonStorePersistence.load()`, bọc `MemoryRepositories`, assert `products.findBy({brandId})` có 1 phần tử và credential giữ nguyên ciphertext.
- [ ] **Step 3: Chạy `pnpm test`** → FAIL `Cannot find module …/prisma-repositories.ts`.
- [ ] **Step 4: Hiện thực `PrismaRepositories`.** `mappers.ts` có cặp `toDomainX(row)`/`toRowX(entity)` cho mỗi model (BigInt ↔ number, Json ↔ mảng). `claim` dùng `updateMany({where:{id, status:{in:from}}, data:{status:to}})` và trả `count===1`. `transaction` dùng `client.$transaction(async tx => fn(new PrismaRepositories(tx)))`. Lỗi unique `P2002` → `DUPLICATE_ID`; `P2025` → `NOT_FOUND`.
- [ ] **Step 5: Chạy `pnpm test`** với Postgres đang chạy → PASS cả hai bộ contract và snapshot.
- [ ] **Step 6: Commit** `feat(database): add Prisma repositories passing the shared contract`.

### Task 4: Service nhóm danh tính, sản phẩm, nội dung, media chuyển sang `Repositories`

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`, `identity/brand-access.service.ts`, `products/products.service.ts`, `content/content.service.ts`, `media/media.service.ts`, `audit/audit.service.ts`
- Modify: `tests/smoke/runtime.test.ts`, `apps/api/src/testing/v1-acceptance-harness.ts` (dùng `MemoryRepositories`)
- Test: `tests/services/content-service.test.ts`

**Interfaces:**
- Consumes: `Repositories`.
- Produces: các class giữ tên cũ, constructor nhận `repos:Repositories` thay `store:MemoryStore`, mọi method public trả `Promise`. Ví dụ: `ContentService.copyMasterToAll(brandId:string, contentId:string):Promise<ContentVariant[]>`, `ProductsService.create(brandId:string, input:CreateProductInput):Promise<Product>`.

- [ ] **Step 1: Viết `content-service.test.ts`** chạy trên `MemoryRepositories`: `copyMasterToAll tạo đúng một biến thể mỗi nền tảng và gọi lần hai không tạo trùng` (lần 1 → 4 phần tử; lần 2 → vẫn 4 bản ghi trong `variants.findBy({contentItemId})`).
- [ ] **Step 2: Chạy** → FAIL vì constructor còn nhận `MemoryStore`.
- [ ] **Step 3: Đổi 6 service sang `Repositories` + async.** Không đổi logic nghiệp vụ; chỗ đọc rồi ghi nhiều bảng (tạo content + audit) bọc trong `repos.transaction`.
- [ ] **Step 4: Sửa harness và `runtime.test.ts`** để dựng `MemoryRepositories`; chạy `pnpm test` → PASS toàn bộ (harness vẫn ra đúng số ở SP1).
- [ ] **Step 5: Commit** `refactor(api): move identity, product, content and media services onto repositories`.

### Task 5: Service tài khoản, browser, publishing, tracking, analytics, campaign chuyển sang `Repositories`

**Files:**
- Modify: `apps/api/src/modules/accounts/accounts.service.ts`, `browser-nodes/*.service.ts`, `browser-profiles/browser-profiles.service.ts`, `publishing/publishing.service.ts`, `publishing/batch-status.service.ts`, `tracking/tracking.service.ts`, `analytics/analytics.service.ts`, `campaigns/*.service.ts`
- Modify: `apps/worker/src/publishing/job-runner.service.ts`, `apps/worker/src/analytics/metrics-sync.service.ts`, `apps/worker/src/maintenance/recovery.service.ts`, `apps/worker/src/runtime/local-worker.ts`
- Test: `tests/services/job-runner.test.ts`

**Interfaces:**
- Produces: `JobRunner.run(jobId:string, buildInput:(job:PublishJob)=>Promise<PublishInput>):Promise<'PUBLISHED'|'RETRYING'|'FAILED'|'SKIPPED'>` — trả `'SKIPPED'` khi `claim(jobId,['QUEUED','RETRYING'],'PROCESSING')` thua.

- [ ] **Step 1: Viết `job-runner.test.ts`**: `chạy song song hai lần cùng job chỉ gọi publisher một lần` (FakePublisher đếm `publish`; `Promise.all([run(id), run(id)])` → kết quả gồm đúng một `'PUBLISHED'` và một `'SKIPPED'`, đếm = 1).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Chuyển các service và worker sang `Repositories`**; `JobRunner` bắt đầu bằng `claim`. `LocalWorkerRuntime.tick()` dùng `publishJobs.findDue(Date.now(), 20)`.
- [ ] **Step 4: Chạy `pnpm test`** → PASS (gồm harness, HTTP smoke).
- [ ] **Step 5: Commit** `refactor(api,worker): move publishing, tracking and analytics onto repositories`.

### Task 6: Router và runtime chọn kho dữ liệu

**Files:**
- Modify: `apps/api/src/runtime/local-api.ts` (await mọi service; map lỗi kết nối)
- Modify: `apps/api/src/runtime/dev-runtime.ts` → tách `createRuntime({env})` chọn theo `RUNTIME_STORE`
- Modify: `apps/api/src/main.ts`, `.env.example`
- Test: `tests/integration/store-unavailable.test.ts`

**Interfaces:**
- Produces: `export async function createRuntime(options:{env:Record<string,string|undefined>}):Promise<{repos:Repositories; runtime:LocalApiRuntime; registry:PublisherRegistry; services:DevServices; close():Promise<void>}>`. `createDevelopmentRuntime` giữ làm alias cho chế độ memory (HTTP smoke SP1 dùng nó).
- Biến môi trường: `RUNTIME_STORE` (`memory` mặc định khi `DEV_IN_MEMORY=1`, ngược lại `postgres`), `DATABASE_URL`, `REDIS_URL`.

- [ ] **Step 1: Viết `store-unavailable.test.ts` (`local-api trả 503 khi repository lỗi kết nối`)**: dựng runtime memory, thay `repos.products.findBy` bằng hàm ném `Object.assign(new Error('connect ECONNREFUSED'),{code:'ECONNREFUSED'})`, gọi `GET /brands/local-brand/products` qua `startApiServer(0, runtime)` → status 503, body `{error:'STORE_UNAVAILABLE'}`.
- [ ] **Step 2: Chạy** → FAIL (hiện trả 500).
- [ ] **Step 3: Hiện thực**: `local-api.ts` await mọi lời gọi; `mapError` thêm mã `ECONNREFUSED`, `P1001`, `P1017` → 503 `STORE_UNAVAILABLE`. `createRuntime` dựng `PrismaRepositories` khi `postgres`, seed owner/brand chỉ khi `DEV_SEED=1`.
- [ ] **Step 4: Chạy `pnpm verify`** → toàn bộ xanh (E2E vẫn chạy chế độ memory).
- [ ] **Step 5: Commit** `feat(api): select memory or postgres store at runtime`.

### Task 7: `JobQueue` với bản in-memory và BullMQ

**Files:**
- Create: `packages/shared/src/job-queue.ts`
- Create: `apps/worker/src/queue/bull-job-queue.ts`
- Modify: `apps/api/src/modules/publishing/publishing.service.ts` (gọi `queue.schedule` khi tạo job; `cancel`/`reschedule` qua route calendar)
- Test: `tests/queue/job-queue-contract.ts`, `tests/queue/in-memory-job-queue.test.ts`, `tests/queue/bull-job-queue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface JobQueue {
    schedule(jobId:string, runAt:number):Promise<void>;   // idempotent theo jobId
    reschedule(jobId:string, runAt:number):Promise<void>;
    cancel(jobId:string):Promise<void>;
    close():Promise<void>;
  }
  export class InMemoryJobQueue implements JobQueue { constructor(onDue:(jobId:string)=>Promise<void>, now?:()=>number) ; tick():Promise<number> }
  export class BullJobQueue implements JobQueue { constructor(connection:{url:string}, queueName?:string /* PUBLISH_API_QUEUE */) }
  ```

- [ ] **Step 1: Viết bộ contract `job-queue-contract.ts`**: `schedule hai lần cùng jobId chỉ chạy một lần`, `cancel và reschedule thay job trong hàng đợi` (schedule t+200ms, reschedule t+600ms → không chạy trước 500ms, chạy sau 700ms; cancel → không chạy). Hai file test gọi contract; bản Bull bắt buộc `REDIS_URL_TEST` (ném nếu thiếu, không skip).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Hiện thực.** Bull: `queue.add('publish', {jobId}, {jobId, delay:max(0,runAt-now), attempts:1, removeOnComplete:1000, removeOnFail:5000})`; `reschedule` = `remove` + `add`; `cancel` = `remove`. Worker xử lý gọi `JobRunner.run`.
- [ ] **Step 4: Chạy `pnpm test`** → PASS.
- [ ] **Step 5: Commit** `feat(worker): add JobQueue with in-memory and BullMQ implementations`.

### Task 8: Worker process riêng và khôi phục sau restart

**Files:**
- Modify: `apps/worker/src/main.ts`, `apps/worker/src/entry.ts`, `apps/worker/src/maintenance/recovery.service.ts`
- Test: `tests/integration/worker-restart.test.ts`

**Interfaces:**
- Produces: `export async function startWorker(options:{env:Record<string,string|undefined>; registry?:PublisherRegistry}):Promise<{close():Promise<void>}>`; `RecoveryService.requeueMissing(queue:JobQueue, now:number):Promise<number>` — đưa lại vào hàng đợi mọi job `QUEUED|RETRYING` trong DB; job `PROCESSING` quá `STALE_PROCESSING_MS = 10 * 60_000` chuyển về `RETRYING`.

- [ ] **Step 1: Viết `worker-restart.test.ts`** (Postgres + Redis thật, FakePublisher):
  - `restart worker không mất job`: tạo job `scheduledAt = now+1500`, `startWorker`, đóng worker sau 300ms, xóa job khỏi Redis (`queue.obliterate`) để mô phỏng mất hàng đợi, `startWorker` lại → trong 5 giây job thành `PUBLISHED`, FakePublisher đếm 1.
  - `hai worker không đăng trùng`: 2 worker cùng lúc, 5 job đến hạn → đếm publish = 5, mỗi job 1 `PublishedPost`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Hiện thực `startWorker`**: dựng `PrismaRepositories`, `BullJobQueue`, BullMQ `Worker` (concurrency `WORKER_CONCURRENCY`, mặc định 4), gọi `requeueMissing` lúc khởi động và mỗi 60 giây; xử lý `SIGTERM` bằng `worker.close()` rồi `$disconnect`. API ở chế độ postgres không chạy worker nhúng.
- [ ] **Step 4: Chạy `pnpm test`** → PASS.
- [ ] **Step 5: Commit** `feat(worker): run publishing worker as a separate process with restart recovery`.

### Task 9: CI có Postgres/Redis và gói triển khai staging

**Files:**
- Modify: `.github/workflows/ci.yml` (services `postgres:17`, `redis:7`; env `DATABASE_URL_TEST`, `REDIS_URL_TEST`; bước `pnpm db:generate` và `migrate:deploy` trước `pnpm test`)
- Create: `infrastructure/docker/Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.web`, `infrastructure/docker/docker-compose.staging.yml`
- Create: `docs/runbooks/staging-deploy.md` (dựng VPS, biến môi trường, migrate, backup `pg_dump` hằng ngày ra object storage, khôi phục)
- Modify: `docs/runbooks/local-development.md` (bật Postgres/Redis trước `pnpm verify`), `scripts/verify-v1.mjs` (`MIN_NODE_TESTS` = số test sau SP2)
- Modify: `docs/verification/v1-acceptance.md` (mục `Local-first persistence` → `## Persistent runtime (SP2)` `Status: CI`)

- [ ] **Step 1: Đổi `MIN_NODE_TESTS` trước** bằng số test thực tế đo được ở Task 8 cộng 0, chạy `pnpm verify` → PASS; thử giảm một test → `verify-v1` FAIL (red-check).
- [ ] **Step 2: Viết workflow và Dockerfile.** Dockerfile dùng `node:24-bookworm-slim`, `corepack enable`, `pnpm install --frozen-lockfile --prod=false`, chạy bằng `node --experimental-strip-types`.
- [ ] **Step 3: Kiểm** `docker compose -f infrastructure/docker/docker-compose.staging.yml config` không lỗi; `docker build -f infrastructure/docker/Dockerfile.api .` thành công.
- [ ] **Step 4: Chạy `pnpm verify`** với Postgres/Redis local → PASS.
- [ ] **Step 5: Commit** `ci: run Postgres and Redis in CI and add staging deployment bundle`.

## Self-review

- Roadmap quyết định 1 (repository → PostgreSQL) → Task 1–6; quyết định 2 (BullMQ, idempotency) → Task 7–8; quyết định 7–8 (vận hành, VPS, backup) → Task 9; điều kiện đóng GĐ0 "restart worker không mất job" → Task 8.
- Tên dùng chung: `Repositories`, `PublishJobRepo.claim/findDue/findInRange`, `JobQueue.schedule/reschedule/cancel`, `createRuntime`, `startWorker` — SP3–SP11 dùng đúng các tên này.
