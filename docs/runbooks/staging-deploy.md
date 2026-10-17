# Staging deployment (SP2)

Use one Linux VPS with Docker Compose, PostgreSQL 17, Redis 7, the API, worker, and Web. Put HTTPS reverse proxies in front of Web and API. Store media and database backups in an external private object storage bucket. Keep the VPS firewall closed to PostgreSQL and Redis; this Compose file does not publish either port.

## 1. Prepare the host

Install Docker Engine and the Compose plugin. Clone this repository at the reviewed commit. Create `.env.staging` in the repository root (it is gitignored) with permissions limited to the deployment user:

```dotenv
POSTGRES_USER=dsm
POSTGRES_PASSWORD=<long-random-password>
POSTGRES_DB=dsm
DATABASE_URL=postgresql://dsm:<url-encoded-password>@postgres:5432/dsm
CREDENTIAL_ENCRYPTION_KEY=<32-random-bytes-as-base64>
JWT_ACCESS_SECRET=<long-random-secret>
WEB_ORIGINS=https://staging.example.com
PUBLIC_API_BASE_URL=https://api.staging.example.com
S3_ENDPOINT=https://objects.example.com
S3_REGION=us-east-1
S3_ACCESS_KEY=<private-key-id>
S3_SECRET_KEY=<private-secret>
S3_BUCKET=dsm-staging-media
IMAGE_TAG=staging
WEB_LISTEN_PORT=3000
API_LISTEN_PORT=4000
WORKER_CONCURRENCY=4
```

Use the same `CREDENTIAL_ENCRYPTION_KEY` on API and worker, and keep it across restarts. Rotating it requires a credential re-encryption procedure. `PUBLIC_API_BASE_URL` is baked into the Web image; rebuild Web if it changes. Configure the reverse proxy to forward the public hostnames to ports 3000 and 4000 with TLS. Set `WEB_ORIGINS` to the exact Web origin.

## 2. Build and start

```bash
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml config --quiet
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml build
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml up -d
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml ps
```

The one-shot `migrate` service applies Prisma migrations after PostgreSQL is healthy. API and worker wait for that service and Redis. Check `https://api.staging.example.com/health` and log in through Web after provisioning an owner account. `DEV_SEED=1` is only for disposable staging data; leave it unset for a populated environment.

## 3. Daily backup to object storage

Schedule this on the VPS with cron or a systemd timer, using credentials that can write only to a private backup prefix. Keep backup retention and access policies on the object storage service.

```bash
set -euo pipefail
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml exec -T postgres \
  pg_dump -U dsm -d dsm -Fc > "backups/dsm-${stamp}.dump"
aws s3 cp "backups/dsm-${stamp}.dump" "s3://<private-backup-bucket>/dsm-staging/${stamp}.dump"
```

Use the configured `POSTGRES_USER` and `POSTGRES_DB` values if they differ from the example. Monitor the exit status and object size. Periodically restore a backup into an isolated database to verify it.

## 4. Restore

Stop API and worker, keep PostgreSQL running, and create a fresh backup before replacing staging data. Download the chosen dump to the VPS. Restore into a newly created database first, check application data, then switch `DATABASE_URL` and restart the services.

```bash
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml stop api worker web
aws s3 cp "s3://<private-backup-bucket>/dsm-staging/<stamp>.dump" backups/restore.dump
docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml exec -T postgres \
  createdb -U dsm dsm_restore
cat backups/restore.dump | docker compose --env-file .env.staging -f infrastructure/docker/docker-compose.staging.yml exec -T postgres \
  pg_restore -U dsm -d dsm_restore --no-owner --no-acl
```

After inspection, set the database name in `.env.staging` and redeploy. The PostgreSQL container must create the target database or it must already exist. Keep the old database until the restored application is verified. Redis holds delivery timing only; the worker reconstructs its queue from PostgreSQL on restart.
