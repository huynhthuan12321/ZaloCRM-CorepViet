#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/backups}"
DUMP_FILE="${DUMP_FILE:-}"
CONTAINER_NAME="${CONTAINER_NAME:-zalocrm-restore-test}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
POSTGRES_USER="${POSTGRES_USER:-crmuser}"
POSTGRES_DB="${POSTGRES_DB:-zalocrm}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-restore-test-only}"
EXPECTED_MIGRATIONS="${EXPECTED_MIGRATIONS:-}"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  scripts/ops/verify-restore.sh [--dry-run] [--dump /path/to/dump.sql.gz]

Restores the latest PostgreSQL dump into a temporary isolated container
(--network none), verifies Prisma migrations, prints table counts, measures RTO,
and always removes the temporary container on exit.

Environment overrides:
  BACKUP_ROOT=./backups
  DUMP_FILE=/path/to/dump.sql.gz
  CONTAINER_NAME=zalocrm-restore-test
  POSTGRES_IMAGE=postgres:16-alpine
  POSTGRES_USER=crmuser
  POSTGRES_DB=zalocrm
  EXPECTED_MIGRATIONS=127
EOF
}

log() {
  printf '%s\n' "$*"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "ERROR: missing required command: $1"
    exit 1
  }
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --dump)
        if [[ $# -lt 2 ]]; then
          usage
          exit 2
        fi
        DUMP_FILE="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage
        exit 2
        ;;
    esac
  done
}

validate_container_name() {
  if [[ "$CONTAINER_NAME" != zalocrm-restore-* ]]; then
    log "ERROR: CONTAINER_NAME must start with 'zalocrm-restore-': $CONTAINER_NAME"
    exit 2
  fi
}

latest_dump() {
  if [[ -n "$DUMP_FILE" ]]; then
    printf '%s\n' "$DUMP_FILE"
    return
  fi
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    return
  fi
  find "$BACKUP_ROOT" -type f -name '*.sql.gz' -printf '%T@ %p\n' | \
    sort -nr | awk 'NR==1 {$1=""; sub(/^ /, ""); print}'
}

cleanup() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

wait_postgres() {
  local deadline ready_logs consecutive
  deadline=$((SECONDS + 90))
  while (( SECONDS < deadline )); do
    ready_logs="$(docker logs "$CONTAINER_NAME" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
    if (( ready_logs >= 2 )) || docker logs "$CONTAINER_NAME" 2>&1 | grep -q 'PostgreSQL init process complete'; then
      consecutive=0
      while (( SECONDS < deadline )); do
        if docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -tAc 'select 1' >/dev/null 2>&1; then
          consecutive=$((consecutive + 1))
          if (( consecutive >= 3 )); then
            return 0
          fi
        else
          consecutive=0
        fi
        sleep 1
      done
    fi
    sleep 2
  done
  log "ERROR: temporary PostgreSQL did not become ready within 90 seconds."
  return 1
}

psql_at() {
  docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"
}

verify_migrations() {
  local total unfinished
  total="$(psql_at "select count(*) from _prisma_migrations")"
  unfinished="$(psql_at "select count(*) from _prisma_migrations where finished_at is null")"
  if [[ -n "$EXPECTED_MIGRATIONS" && "$total" != "$EXPECTED_MIGRATIONS" ]]; then
    log "ERROR: migration verification failed: expected=$EXPECTED_MIGRATIONS actual=$total"
    exit 1
  fi
  if [[ "$total" == "0" || "$unfinished" != "0" ]]; then
    log "ERROR: migration verification failed: total=$total unfinished=$unfinished"
    exit 1
  fi
  log "Prisma migrations PASS: total=$total unfinished=$unfinished"
}

print_counts() {
  psql_at "select 'organizations=' || count(*) from organizations"
  psql_at "select 'contacts=' || count(*) from contacts"
  psql_at "select 'conversations=' || count(*) from conversations"
  psql_at "select 'messages=' || count(*) from messages"
}

main() {
  parse_args "$@"
  validate_container_name
  require_cmd docker
  require_cmd find
  require_cmd sort
  require_cmd awk
  require_cmd gzip
  require_cmd gunzip

  local dump_file overall_start_ts restore_start_ts restore_end_ts overall_end_ts restore_rto total_time
  dump_file="$(latest_dump)"
  if [[ -z "$dump_file" || ! -f "$dump_file" ]]; then
    log "ERROR: no PostgreSQL dump found. Set DUMP_FILE or BACKUP_ROOT."
    exit 1
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would restore dump: $dump_file"
    run gzip -t "$dump_file"
    run docker rm -f "$CONTAINER_NAME"
    run docker run -d --name "$CONTAINER_NAME" --network none \
      --memory 1g \
      -e "POSTGRES_USER=$POSTGRES_USER" \
      -e "POSTGRES_PASSWORD=<redacted>" \
      -e "POSTGRES_DB=$POSTGRES_DB" \
      "$POSTGRES_IMAGE"
    run gunzip -c "$dump_file"
    log "Would pipe dump into: docker exec -i $CONTAINER_NAME psql -U $POSTGRES_USER -d $POSTGRES_DB -q -v ON_ERROR_STOP=1"
    run docker rm -f "$CONTAINER_NAME"
    return 0
  fi

  trap cleanup EXIT
  overall_start_ts="$(date +%s)"
  cleanup

  gzip -t "$dump_file"

  docker run -d --name "$CONTAINER_NAME" --network none \
    --memory 1g \
    -e "POSTGRES_USER=$POSTGRES_USER" \
    -e "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
    -e "POSTGRES_DB=$POSTGRES_DB" \
    "$POSTGRES_IMAGE" >/dev/null

  wait_postgres

  log "Restoring dump: $dump_file"
  restore_start_ts="$(date +%s)"
  gunzip -c "$dump_file" | docker exec -i "$CONTAINER_NAME" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1
  restore_end_ts="$(date +%s)"
  restore_rto=$((restore_end_ts - restore_start_ts))

  verify_migrations
  print_counts
  overall_end_ts="$(date +%s)"
  total_time=$((overall_end_ts - overall_start_ts))
  log "Restore test PASS. restore_RTO=${restore_rto}s total_time=${total_time}s"
}

main "$@"
