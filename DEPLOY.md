# ZaloCRM VPS Deploy Checklist

## Pre-Deploy

1. VPS: Ubuntu 22+ or Debian 12+, Docker Engine 24+, Docker Compose V2.
2. DNS: create an A record from the production domain to the VPS IP.
3. Firewall: expose only 80, 443, and 22.
4. Copy `backend/.env.example` to `.env` and replace all defaults/placeholders.
5. Generate secrets: `JWT_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD`, and MinIO credentials.

## First Deploy

1. Clone the repository.
2. Create `.env` from `backend/.env.example`.
3. Edit `.env`: domain, secrets, DB password, storage, and AI provider keys.
4. Build images: `docker compose build`.
5. Start dependencies: `docker compose up -d db redis minio`.
6. Wait for healthy dependencies: `docker compose ps`.
7. Run Prisma migrations from the app image or host: `npx prisma migrate deploy`.
8. Start the stack: `docker compose up -d`.
9. With Caddy: `docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d`.
10. Verify readiness: `curl https://<domain>/health/ready`.
11. Verify API banner: `curl https://<domain>/api/v1/status`.

## Update Deploy

1. `git pull`
2. `docker compose build app`
3. `docker compose up -d app`
4. Verify health: `curl https://<domain>/health/ready`.
5. Check logs: `docker compose logs -f app --tail 50`.

This is a controlled single-container restart, not zero-downtime deployment.

## Rollback

1. `git checkout <previous-commit>`
2. `docker compose build app`
3. `docker compose up -d app`

If Caddy is not needed, stop the overlay service: `docker compose down caddy`.

## Backup

Automatic backups run daily via the `backup` service with 7 daily, 4 weekly, and 3 monthly retention.

Manual backup:

```bash
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup.sql
```

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
