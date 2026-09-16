# ZaloCRM VPS Deploy Checklist

> **Production VPS rules (2026-09-16).** Every command that changes production (deploy, migration,
> restart, `.env` edit, volume/container removal) needs explicit owner approval first.
> No production Prisma migration without a verified backup + restore test
> (`docs/runbooks/BACKUP-RESTORE.md`). Messenger stays `MESSENGER_ENABLED=false` until the pilot gate.

## Pre-Deploy

1. VPS: Ubuntu 22+ or Debian 12+, Docker Engine 24+, Docker Compose V2.
2. DNS: create an A record from the production domain to the VPS IP.
3. Firewall: expose only 80, 443, and 22. Docker-published ports bypass `ufw` — verify with
   `docker ps --format '{{.Names}} {{.Ports}}'` / `ss -ltnp`, bind internal ports to `127.0.0.1`.
4. Copy `backend/.env.example` to `.env` and replace all defaults/placeholders.
5. Generate secrets: `JWT_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`), and MinIO credentials.
   Never change `ENCRYPTION_KEY` or `TOKEN_ENCRYPTION_KEY` on a running system — existing data becomes undecryptable.

## First Deploy

1. Clone the repository.
2. Create `.env` from `backend/.env.example`.
3. Edit `.env`: domain, secrets, DB password, storage, and AI provider keys.
4. Build images: `docker compose build`.
5. Start dependencies: `docker compose up -d db redis minio`.
6. Wait for healthy dependencies: `docker compose ps`.
7. Run Prisma migrations from the app image or host: `npx prisma migrate deploy`.
8. Start the stack: `docker compose -f docker-compose.yml up -d`.
9. Caddy overlay (`docker-compose.caddy.yml`) **only on a fresh VPS without another reverse proxy**.
   The current production VPS uses the shared Caddy in `/opt/n8n` → `172.17.0.1:3080`; do NOT start the overlay there.
10. Verify readiness: `curl https://<domain>/health/ready`.
11. Verify API banner: `curl https://<domain>/api/v1/status`.

## Update Deploy

Pre-flight (all required): a DB dump newer than 24h that passed `gzip -t`; `git log -1` recorded as the rollback point;
if the release contains a migration, a restore test of that dump passed.

1. Record current commit: `git rev-parse --short HEAD` (rollback target).
2. `git pull`
3. `docker compose -f docker-compose.yml build app`
4. Tag the image with the commit for rollback: `docker tag <app-image> <app-image>:<commit>`.
5. `docker compose -f docker-compose.yml up -d --no-deps app` — recreates only the app; db/redis/minio/backup stay untouched.
6. Verify health: `curl https://<domain>/health/ready` (HTTP 200; `messenger.status` is informational only).
7. Check logs: `docker compose logs app --tail 50` (no `FATAL: Production config validation failed`).

This is a controlled single-container restart, not zero-downtime deployment.

## Rollback

Application rollback (no schema change):

1. `git checkout <previous-commit>` or reuse the image tagged `<previous-commit>`.
2. `docker compose -f docker-compose.yml build app` (skip if re-using the tagged image).
3. `docker compose -f docker-compose.yml up -d --no-deps app`

Schema rollback: migrations in this project are additive/expand-contract. Never run a destructive down-migration on
production; roll the app back and leave additive columns/tables in place.

Messenger rollback (after the first real Messenger message this is the only rollback): set `MESSENGER_ENABLED=false`,
recreate the app, stop Messenger workers, abandon pending outbound commands. Data is kept.

## Backup

The `backup` service (`prodrigestivill/postgres-backup-local`) dumps PostgreSQL on `@daily` (00:00 Asia/Ho_Chi_Minh)
with 7 daily / 4 weekly / 3 monthly retention into `./backups`.

It does **not** run on start, does **not** back up the media volume, and stores dumps on the same disk only.
A running/healthy container is not proof a dump exists. Full procedure, restore test and gate checklist:
`docs/runbooks/BACKUP-RESTORE.md`.

## Monitoring

- Health: `GET /health/ready` every 30 seconds.
- Logs: `docker compose logs -f app`.
- Disk: `df -h`, especially Docker volumes.
- Redis memory: `docker exec zalo-crm-redis redis-cli info memory`.
- PostgreSQL connections: `docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT count(*) FROM pg_stat_activity"`.

## Resource Sizing

Tune resource limits in `.env` for the real VPS:

- 2GB RAM: `APP_MEMORY_LIMIT=1G`, `DB_MEMORY_LIMIT=512M`, Redis maxmemory 256mb.
- 4GB RAM: `APP_MEMORY_LIMIT=2G`, `DB_MEMORY_LIMIT=1G`, Redis maxmemory 512mb.
- 8GB RAM: `APP_MEMORY_LIMIT=4G`, `DB_MEMORY_LIMIT=2G`, Redis maxmemory 1G.

## Known Residual Risks

1. The AI rate limiter is in-memory and assumes one app replica. With two app containers, effective quota can double. Move to Redis when scaling beyond one instance.
2. Circuit breaker state is in-memory. Restarting the app resets providers to closed until the threshold is reached again.
3. Single-container updates have short downtime. Blue-green or rolling deployment is out of scope for this VPS PR.
4. Logging remains console-based rather than structured JSON. A Pino/Winston migration should be a separate PR.
5. Backups live on the same disk as the database until off-site sync is set up.

## D0D Port 3080 hardening note (2026-09-17)

Production D0D changed `docker-compose.yml` so the app port is bound to `172.17.0.1:${APP_PORT:-3080}:3000` instead of `0.0.0.0:3080`. The VPS backup made during D0D is:

`/root/zalocrm-ops/config-backups/docker-compose.yml.20260917-191230`

Important rollback/deploy caveat: deploying or rolling back to a SHA that does not contain local commit `99e16ca` (`chore(ops): bind app port to docker bridge 172.17.0.1 (D0D)`) will reopen public `0.0.0.0:3080`. Any such rollback/deploy must include an explicit gate to close 3080 again or verify the compose blob still matches the D0D hardened version.
