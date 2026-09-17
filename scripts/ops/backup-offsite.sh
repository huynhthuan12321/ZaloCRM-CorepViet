#!/usr/bin/env bash
set -euo pipefail
umask 077

PATH="${OPS_SHIM_PATH:-}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

SCRIPT_NAME="backup-offsite.sh"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/root/zalocrm-ops/backup.env}"

OPS_DIR="${OPS_DIR:-/root/zalocrm-ops}"
DUMP_DIR="${DUMP_DIR:-$OPS_DIR/backups}"
STATE_DIR="${STATE_DIR:-$OPS_DIR/state}"
DB_CONTAINER="${DB_CONTAINER:-zalo-crm-db}"
DB_USER="${DB_USER:-crmuser}"
DB_NAME="${DB_NAME:-zalocrm}"
MEDIA_SOURCE="${MEDIA_SOURCE:-/var/lib/docker/volumes/zalocrm-corepviet_file_storage/_data}"
REMOTE="${REMOTE:-gdrive-crypt:}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
BWLIMIT="${BWLIMIT:-10M}"
KEEP_LOCAL_DUMPS="${KEEP_LOCAL_DUMPS:-7}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-5000000}"
DISK_MAX_PCT="${DISK_MAX_PCT:-85}"
HC_DAILY_URL="${HC_DAILY_URL:-}"
HC_WEEKLY_URL="${HC_WEEKLY_URL:-}"

MODE=""
DRY_RUN=0
STARTED=0
STATUS="failed"
CURRENT_TMP=""
STEP_DUMP_SECONDS=""
STEP_UPLOAD_SECONDS=""
STEP_MEDIA_SECONDS=""

usage() {
  cat <<'USAGE'
Usage: backup-offsite.sh --mode daily|weekly [--dry-run]

Automated ZaloCRM DB + media off-site backup runner.
Configuration defaults may be overridden by environment variables or by
/root/zalocrm-ops/backup.env when present. backup.env must be owned by root and mode 600.
USAGE
}

log() {
  printf '%s %s\n' "$(date -Is)" "$*"
}

redact_cmd() {
  printf '%q ' "$@"
  printf '\n'
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf 'DRY-RUN: '
    redact_cmd "$@"
  else
    "$@"
  fi
}

ping_hc() {
  local suffix="${1:-}" url
  [[ -n "$HC_URL" ]] || { log "WARNING: healthcheck URL not configured; skip ping ${suffix:-success}"; return 0; }
  url="$HC_URL$suffix"
  curl -fsS -m 10 --retry 3 "$url" >/dev/null 2>&1 || log "WARNING: healthcheck ping failed (${suffix:-success})"
}

on_exit() {
  local ec=$?
  if [[ -n "$CURRENT_TMP" && -e "$CURRENT_TMP" ]]; then
    rm -f -- "$CURRENT_TMP"
  fi
  if [[ "$DRY_RUN" -eq 0 && "$STARTED" -eq 1 ]]; then
    if [[ "$ec" -eq 0 && "$STATUS" == "success" ]]; then
      ping_hc ""
    else
      ping_hc "/fail"
    fi
  fi
  exit "$ec"
}
trap on_exit EXIT

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        [[ $# -ge 2 ]] || { usage >&2; exit 2; }
        MODE="$2"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      --help|-h) usage; exit 0 ;;
      *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
  done
  [[ "$MODE" == "daily" || "$MODE" == "weekly" ]] || { usage >&2; exit 2; }
}

validate_env_file() {
  [[ -e "$BACKUP_ENV_FILE" ]] || return 0
  local owner mode
  owner="$(stat -c '%U' "$BACKUP_ENV_FILE")"
  mode="$(stat -c '%a' "$BACKUP_ENV_FILE")"
  if [[ "$owner" != "root" || "$mode" != "600" ]]; then
    echo "ERROR: $BACKUP_ENV_FILE must be owner root and mode 600" >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  set -a; . "$BACKUP_ENV_FILE"; set +a
}

init_after_config() {
  export RCLONE_CONFIG
  HC_URL=""
  case "$MODE" in
    daily) HC_URL="$HC_DAILY_URL" ;;
    weekly) HC_URL="$HC_WEEKLY_URL" ;;
  esac
}

ensure_dirs_and_lock() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would mkdir -p $DUMP_DIR $STATE_DIR"
    log "DRY-RUN: would acquire flock $STATE_DIR/backup.lock"
    return 0
  fi
  mkdir -p "$DUMP_DIR" "$STATE_DIR"
  exec 9>"$STATE_DIR/backup.lock"
  if ! flock -n 9; then
    log "Another backup is already running; exit 0"
    exit 0
  fi
}

disk_gate() {
  local pct
  pct="$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')"
  if [[ "$pct" -gt "$DISK_MAX_PCT" ]]; then
    echo "ERROR: disk usage ${pct}% exceeds DISK_MAX_PCT=${DISK_MAX_PCT}%" >&2
    exit 1
  fi
  log "Disk gate OK: / usage ${pct}% <= ${DISK_MAX_PCT}%"
}

sha256_of_file() {
  local file="$1" base
  base="$(basename "$file")"
  (cd "$(dirname "$file")" && sha256sum "$base") | awk '{print $1}'
}

count_files() {
  find "$1" -type f 2>/dev/null | wc -l | tr -d ' '
}

retention_local() {
  local keep="$KEEP_LOCAL_DUMPS" old tmp_old f
  mapfile -t old < <(find "$DUMP_DIR" -maxdepth 1 -type f -regextype posix-extended \
    -regex ".*/zalocrm-[0-9]{8}-[0-9]{6}\.sql\.gz" -printf '%f\n' | sort -r | tail -n +$((keep + 1)))
  for f in "${old[@]:-}"; do
    [[ -n "$f" ]] || continue
    rm -f -- "$DUMP_DIR/$f" "$DUMP_DIR/$f.sha256"
    log "Retention removed old dump: $f"
  done
  mapfile -t tmp_old < <(find "$DUMP_DIR" -maxdepth 1 -type f -name 'zalocrm-*.sql.gz.tmp' -mtime +1 -printf '%p\n')
  for f in "${tmp_old[@]:-}"; do
    rm -f -- "$f"
    log "Retention removed stale tmp: $(basename "$f")"
  done
}

daily() {
  local stamp day dump tmp base dump_sha start elapsed media_count bytes
  stamp="$(date +%Y%m%d-%H%M%S)"
  day="${stamp%%-*}"
  base="zalocrm-${stamp}.sql.gz"
  dump="$DUMP_DIR/$base"
  tmp="$dump.tmp"

  disk_gate
  if [[ "$DRY_RUN" -eq 0 ]]; then ping_hc "/start"; STARTED=1; fi

  log "Daily dump start: $base"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would run pg_dump pipeline to $tmp, gzip -t, size gate, mv to $dump, sha256"
  else
    start=$(date +%s)
    CURRENT_TMP="$tmp"
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip -1 > "$tmp"
    gzip -t "$tmp"
    bytes="$(stat -c '%s' "$tmp")"
    if [[ "$bytes" -lt "$MIN_DUMP_BYTES" ]]; then
      echo "ERROR: dump too small: ${bytes} < ${MIN_DUMP_BYTES}" >&2
      exit 1
    fi
    mv "$tmp" "$dump"
    CURRENT_TMP=""
    (cd "$DUMP_DIR" && sha256sum "$base" > "$base.sha256")
    dump_sha="$(sha256_of_file "$dump")"
    elapsed=$(( $(date +%s) - start ))
    STEP_DUMP_SECONDS="$elapsed"
    log "Daily dump PASS: file=$base bytes=$bytes sha256=$dump_sha seconds=$elapsed"
  fi

  start=$(date +%s)
  run_cmd rclone copy "$DUMP_DIR" "${REMOTE%/}db/$day/" --include "$base" --include "$base.sha256" --bwlimit "$BWLIMIT"
  run_cmd rclone cryptcheck "$DUMP_DIR" "${REMOTE%/}db/$day/" --include "$base" --one-way
  STEP_UPLOAD_SECONDS=$(( $(date +%s) - start ))
  log "DB off-site upload/cryptcheck completed seconds=$STEP_UPLOAD_SECONDS"

  start=$(date +%s)
  media_count="$(count_files "$MEDIA_SOURCE")"
  run_cmd rclone copy "$MEDIA_SOURCE" "${REMOTE%/}media-mirror/" --bwlimit "$BWLIMIT" --transfers 4 --checkers 8 --stats-one-line --stats 5m
  STEP_MEDIA_SECONDS=$(( $(date +%s) - start ))
  log "Media mirror copy completed source_file_count=$media_count seconds=$STEP_MEDIA_SECONDS"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would apply retention in $DUMP_DIR and write $STATE_DIR/last-daily-success"
  else
    retention_local
    dump_sha="$(sha256_of_file "$dump")"
    {
      printf 'stamp=%s\n' "$stamp"
      printf 'dump=%s\n' "$dump"
      printf 'dump_bytes=%s\n' "$(stat -c '%s' "$dump")"
      printf 'dump_sha256=%s\n' "$dump_sha"
      printf 'dump_seconds=%s\n' "$STEP_DUMP_SECONDS"
      printf 'db_upload_seconds=%s\n' "$STEP_UPLOAD_SECONDS"
      printf 'media_seconds=%s\n' "$STEP_MEDIA_SECONDS"
      printf 'completed_at=%s\n' "$(date -Is)"
    } > "$STATE_DIR/last-daily-success"
  fi
  STATUS="success"
  log "Daily backup PASS"
}

latest_dump() {
  find "$DUMP_DIR" -maxdepth 1 -type f -regextype posix-extended \
    -regex ".*/zalocrm-[0-9]{8}-[0-9]{6}\.sql\.gz" -printf '%f\n' | sort -r | head -n 1
}

weekly() {
  local dump_base dump expected
  disk_gate
  if [[ "$DRY_RUN" -eq 0 ]]; then ping_hc "/start"; STARTED=1; fi

  dump_base="$(latest_dump)"
  [[ -n "$dump_base" ]] || { echo "ERROR: no dump found in $DUMP_DIR" >&2; exit 1; }
  dump="$DUMP_DIR/$dump_base"
  log "Weekly restore verification dump: $dump_base"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would query finished migrations, run verify-restore.sh, cryptcheck media, check last daily freshness, write weekly state"
  else
    expected="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc "select count(*) from _prisma_migrations where finished_at is not null")"
    EXPECTED_MIGRATIONS="$expected" "$OPS_DIR/verify-restore.sh" --dump "$dump"
    rclone cryptcheck "$MEDIA_SOURCE" "${REMOTE%/}media-mirror/" --one-way
    if [[ ! -f "$STATE_DIR/last-daily-success" ]] || ! find "$STATE_DIR" -maxdepth 1 -name last-daily-success -mmin -2160 | grep -q .; then
      echo "ERROR: last-daily-success is missing or older than 36h" >&2
      exit 1
    fi
    {
      printf 'dump=%s\n' "$dump"
      printf 'expected_migrations=%s\n' "$expected"
      printf 'completed_at=%s\n' "$(date -Is)"
    } > "$STATE_DIR/last-weekly-success"
  fi
  STATUS="success"
  log "Weekly verification PASS"
}

main() {
  parse_args "$@"
  validate_env_file
  init_after_config
  ensure_dirs_and_lock
  case "$MODE" in
    daily) daily ;;
    weekly) weekly ;;
  esac
}

main "$@"