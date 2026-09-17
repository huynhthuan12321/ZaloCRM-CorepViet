#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/ops/backup-offsite.sh"
TEST_ROOT="${TMPDIR:-/tmp}/zalocrm-backup-offsite-test-$$"
PASS_COUNT=0
FAIL_COUNT=0

log_case() { printf '\n== %s ==\n' "$1"; }
pass() { printf 'PASS: %s\n' "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf 'FAIL: %s\n' "$1" >&2; FAIL_COUNT=$((FAIL_COUNT + 1)); }
assert_file() { [[ -e "$1" ]] || { echo "missing file: $1" >&2; return 1; }; }
assert_not_file() { [[ ! -e "$1" ]] || { echo "unexpected file: $1" >&2; return 1; }; }
assert_grep() { grep -Eq "$1" "$2" || { echo "pattern not found: $1 in $2" >&2; return 1; }; }
assert_no_grep() { ! grep -Eq "$1" "$2" || { echo "forbidden pattern found: $1 in $2" >&2; return 1; }; }

make_shims() {
  local dir="$1/bin"
  mkdir -p "$dir"
  cat > "$dir/flock" <<'SH'
#!/usr/bin/env bash
if [[ "${LOCK_HELD:-0}" == "1" ]]; then
  if [[ "${1:-}" == "-w" ]]; then exit 1; fi
  if [[ "${1:-}" == "-n" ]]; then exit 1; fi
fi
exit 0
SH
  cat > "$dir/df" <<'SH'
#!/usr/bin/env bash
pct="${DF_PCT:-40}"
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf '/dev/fake 1000000 %s %s %s%% /\n' "$((pct * 10000))" "$(((100 - pct) * 10000))" "$pct"
SH
  cat > "$dir/docker" <<'SH'
#!/usr/bin/env bash
printf 'docker %q ' "$@" >> "$ARGV_LOG"; printf '\n' >> "$ARGV_LOG"
if [[ "${1:-}" == "exec" && "${3:-}" == "pg_dump" ]]; then
  if [[ "${DOCKER_PGDUMP_FAIL:-0}" == "1" ]]; then
    printf 'partial dump\n'
    exit 42
  fi
  bytes="${DUMP_BYTES:-20000}"
  dd if=/dev/urandom bs="$bytes" count=1 2>/dev/null
  exit 0
fi
if [[ "${1:-}" == "exec" && "$*" == *"_prisma_migrations"* ]]; then
  printf '%s\n' "${MIGRATIONS_COUNT:-127}"
  exit 0
fi
exit 0
SH
  cat > "$dir/rclone" <<'SH'
#!/usr/bin/env bash
printf 'rclone %q ' "$@" >> "$ARGV_LOG"; printf '\n' >> "$ARGV_LOG"
case "${1:-}" in
  copy) printf 'Transferred: 1 / 1, 100%%\n' ;;
  cryptcheck) printf '0 differences found\n' ;;
esac
exit 0
SH
  cat > "$dir/curl" <<'SH'
#!/usr/bin/env bash
printf 'curl %q ' "$@" >> "$ARGV_LOG"; printf '\n' >> "$ARGV_LOG"
exit 0
SH
  chmod +x "$dir"/*
}

new_case() {
  local name="$1" dir
  dir="$TEST_ROOT/$name"
  mkdir -p "$dir/ops/backups" "$dir/ops/state" "$dir/media"
  make_shims "$dir"
  printf 'media\n' > "$dir/media/a.txt"
  cat > "$dir/ops/verify-restore.sh" <<'SH'
#!/usr/bin/env bash
printf 'verify EXPECTED_MIGRATIONS=%s args=%s\n' "${EXPECTED_MIGRATIONS:-}" "$*" >> "$ARGV_LOG"
exit 0
SH
  chmod +x "$dir/ops/verify-restore.sh"
  printf '%s\n' "$dir"
}

run_backup() {
  local dir="$1"; shift
  env -i \
    PATH="/usr/bin:/bin" \
    HOME="$HOME" \
    TMPDIR="${TMPDIR:-/tmp}" \
    OPS_SHIM_PATH="$dir/bin:" \
    ARGV_LOG="$dir/argv.log" \
    OPS_DIR="$dir/ops" \
    DUMP_DIR="$dir/ops/backups" \
    STATE_DIR="$dir/ops/state" \
    MEDIA_SOURCE="$dir/media" \
    REMOTE="gdrive-crypt:" \
    RCLONE_CONFIG="$dir/rclone.conf" \
    BWLIMIT="10M" \
    KEEP_LOCAL_DUMPS="7" \
    MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-5000}" \
    DISK_MAX_PCT="85" \
    HC_DAILY_URL="https://hc.example/daily-secret" \
    HC_WEEKLY_URL="https://hc.example/weekly-secret" \
    DF_PCT="${DF_PCT:-40}" \
    DUMP_BYTES="${DUMP_BYTES:-20000}" \
    DOCKER_PGDUMP_FAIL="${DOCKER_PGDUMP_FAIL:-0}" \
    LOCK_HELD="${LOCK_HELD:-0}" \
    MIGRATIONS_COUNT="${MIGRATIONS_COUNT:-127}" \
    BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$dir/no-backup.env}" \
    BACKUP_ENV_SKIP_OWNER_CHECK="${BACKUP_ENV_SKIP_OWNER_CHECK:-0}" \
    bash "$SCRIPT" "$@"
}

case_daily_happy() {
  log_case "daily happy path"
  local dir out
  dir="$(new_case daily_happy)"
  out="$dir/out.log"
  run_backup "$dir" --mode daily >"$out" 2>&1 || return 1
  ls "$dir/ops/backups"/zalocrm-*.sql.gz >/dev/null || return 1
  ls "$dir/ops/backups"/zalocrm-*.sql.gz.sha256 >/dev/null || return 1
  assert_grep 'docker .*pg_dump' "$dir/argv.log" || return 1
  assert_grep 'rclone copy .*gdrive-crypt:db/' "$dir/argv.log" || return 1
  assert_grep 'rclone cryptcheck .*gdrive-crypt:db/' "$dir/argv.log" || return 1
  assert_grep 'rclone copy .*gdrive-crypt:media-mirror/' "$dir/argv.log" || return 1
  assert_grep 'curl .*daily-secret/start' "$dir/argv.log" || return 1
  assert_grep 'curl .*daily-secret' "$dir/argv.log" || return 1
  pass "daily happy path"
}

case_pg_dump_fail() {
  log_case "pg_dump failure"
  local dir out
  dir="$(new_case pg_dump_fail)"; out="$dir/out.log"
  DOCKER_PGDUMP_FAIL=1 run_backup "$dir" --mode daily >"$out" 2>&1 && return 1 || true
  ! ls "$dir/ops/backups"/*.sql.gz >/dev/null 2>&1 || return 1
  assert_no_grep '^rclone ' "$dir/argv.log" || return 1
  assert_grep 'curl .*daily-secret/fail' "$dir/argv.log" || return 1
  pass "pg_dump failure fails safely"
}

case_small_dump() {
  log_case "small dump failure"
  local dir out
  dir="$(new_case small_dump)"; out="$dir/out.log"
  DUMP_BYTES=10 MIN_DUMP_BYTES=5000 run_backup "$dir" --mode daily >"$out" 2>&1 && return 1 || true
  ! ls "$dir/ops/backups"/*.sql.gz >/dev/null 2>&1 || return 1
  assert_grep 'dump too small' "$out" || return 1
  pass "small dump fails"
}

case_disk_gate() {
  log_case "disk gate"
  local dir out
  dir="$(new_case disk_gate)"; out="$dir/out.log"
  DF_PCT=90 run_backup "$dir" --mode daily >"$out" 2>&1 && return 1 || true
  [[ ! -s "$dir/argv.log" ]] || return 1
  pass "disk 90% fails before dump"
}

case_retention() {
  log_case "retention"
  local dir out i ts
  dir="$(new_case retention)"; out="$dir/out.log"
  for i in $(seq 1 10); do
    ts="202601$(printf '%02d' "$i")-010101"
    printf x > "$dir/ops/backups/zalocrm-$ts.sql.gz"
    printf 'hash  zalocrm-%s.sql.gz\n' "$ts" > "$dir/ops/backups/zalocrm-$ts.sql.gz.sha256"
  done
  printf minio > "$dir/ops/backups/minio-data-20260101-010101.tar"
  printf weird > "$dir/ops/backups/keep-me.txt"
  run_backup "$dir" --mode daily >"$out" 2>&1 || return 1
  [[ "$(find "$dir/ops/backups" -maxdepth 1 -name 'zalocrm-*.sql.gz' | wc -l | tr -d ' ')" == "7" ]] || return 1
  assert_file "$dir/ops/backups/minio-data-20260101-010101.tar" || return 1
  assert_file "$dir/ops/backups/keep-me.txt" || return 1
  pass "retention keeps 7 dumps and preserves unrelated files"
}

case_no_forbidden_rclone() {
  log_case "forbidden rclone verbs"
  if grep -R -E 'rclone (sync|move|delete|purge|dedupe)( |$)' "$TEST_ROOT" "$SCRIPT" >/dev/null 2>&1; then
    return 1
  fi
  pass "no forbidden rclone verbs in argv logs"
}

case_lock_held() {
  log_case "lock held"
  local dir out
  dir="$(new_case lock_held)"; out="$dir/out.log"
  LOCK_HELD=1 run_backup "$dir" --mode daily >"$out" 2>&1
  [[ ! -s "$dir/argv.log" ]] || return 1
  assert_grep 'Another backup is already running' "$out" || return 1
  pass "lock held exits 0 without fail ping"
}

case_env_mode() {
  log_case "backup.env mode 644"
  local dir out envf
  dir="$(new_case env_mode)"; out="$dir/out.log"; envf="$dir/backup.env"
  printf 'BWLIMIT=1M\n' > "$envf"
  chmod 644 "$envf"
  BACKUP_ENV_FILE="$envf" run_backup "$dir" --mode daily >"$out" 2>&1 && return 1 || true
  assert_grep 'must be owner root and mode 600' "$out" || return 1
  pass "backup.env 644 fails"
}

case_hc_not_in_output() {
  log_case "HC URL redaction"
  local dir out
  dir="$(new_case hc_redact)"; out="$dir/out.log"
  run_backup "$dir" --mode daily >"$out" 2>&1 || return 1
  assert_no_grep 'hc\.example|daily-secret|weekly-secret' "$out" || return 1
  pass "healthcheck URL not in stdout/stderr"
}

case_dry_run() {
  log_case "dry-run"
  local dir out
  dir="$(new_case dry_run)"; out="$dir/out.log"
  run_backup "$dir" --mode daily --dry-run >"$out" 2>&1 || return 1
  ! ls "$dir/ops/backups"/*.sql.gz >/dev/null 2>&1 || return 1
  [[ ! -e "$dir/argv.log" || ! -s "$dir/argv.log" ]] || return 1
  assert_grep 'DRY-RUN' "$out" || return 1
  pass "dry-run does not create files or call shims"
}

case_weekly() {
  log_case "weekly"
  local dir out old
  dir="$(new_case weekly)"; out="$dir/out.log"
  printf dump > "$dir/ops/backups/zalocrm-20260101-010101.sql.gz"
  printf 'stamp=old\n' > "$dir/ops/state/last-daily-success"
  run_backup "$dir" --mode weekly >"$out" 2>&1 || return 1
  assert_grep 'verify EXPECTED_MIGRATIONS=127' "$dir/argv.log" || return 1
  assert_grep 'rclone cryptcheck .*gdrive-crypt:media-mirror/.*--one-way.*--min-age' "$dir/argv.log" || return 1
  old="$(new_case weekly_old_daily)"; out="$old/out.log"
  printf dump > "$old/ops/backups/zalocrm-20260101-010101.sql.gz"
  printf 'stamp=old\n' > "$old/ops/state/last-daily-success"
  touch -d '40 hours ago' "$old/ops/state/last-daily-success"
  run_backup "$old" --mode weekly >"$out" 2>&1 && return 1 || true
  assert_grep 'older than 36h' "$out" || return 1
  pass "weekly passes expected migrations and fails stale daily"
}


case_weekly_lock_timeout() {
  log_case "weekly lock timeout"
  local dir out
  dir="$(new_case weekly_lock_timeout)"; out="$dir/out.log"
  printf dump > "$dir/ops/backups/zalocrm-20260101-010101.sql.gz"
  LOCK_HELD=1 run_backup "$dir" --mode weekly >"$out" 2>&1 && return 1 || true
  assert_grep 'lock wait timeout' "$out" || return 1
  pass "weekly lock wait timeout fails"
}

case_backup_env_load_order() {
  log_case "backup.env load order"
  local dir out envf
  dir="$(new_case env_load_order)"; out="$dir/out.log"; envf="$dir/backup.env"
  mkdir -p "$dir/ops2" "$dir/media2"
  printf 'media2\n' > "$dir/media2/b.txt"
  cat > "$envf" <<EOF
OPS_DIR=$dir/ops2
MEDIA_SOURCE=$dir/media2
MIN_DUMP_BYTES=5000
EOF
  chmod 600 "$envf"
  env -i \
    PATH="/usr/bin:/bin" \
    HOME="$HOME" \
    TMPDIR="${TMPDIR:-/tmp}" \
    OPS_SHIM_PATH="$dir/bin:" \
    ARGV_LOG="$dir/argv.log" \
    REMOTE="gdrive-crypt:" \
    RCLONE_CONFIG="$dir/rclone.conf" \
    HC_DAILY_URL="" \
    BACKUP_ENV_FILE="$envf" \
    BACKUP_ENV_SKIP_OWNER_CHECK=1 \
    DUMP_BYTES=20000 \
    DF_PCT=40 \
    bash "$SCRIPT" --mode daily >"$out" 2>&1
  ls "$dir/ops2/backups"/zalocrm-*.sql.gz >/dev/null || return 1
  assert_file "$dir/ops2/state/last-daily-success" || return 1
  pass "backup.env sourced before derived defaults"
}

case_cron_logrotate_newline() {
  log_case "cron/logrotate newline and cron format"
  local cron_file logrotate_file cron_base job_count
  cron_file="$ROOT_DIR/scripts/ops/cron/zalocrm-backup"
  logrotate_file="$ROOT_DIR/scripts/ops/logrotate/zalocrm-backup"
  [[ "$(tail -c1 "$cron_file" | od -An -c | tr -d ' ')" == "\\n" ]] || return 1
  [[ "$(tail -c1 "$logrotate_file" | od -An -c | tr -d ' ')" == "\\n" ]] || return 1
  job_count="$(grep -Ec '^[0-9]+[[:space:]]+[0-9]+[[:space:]]+[*0-9]+[[:space:]]+[*0-9]+[[:space:]]+[*0-9]+[[:space:]]+root[[:space:]]+' "$cron_file")"
  [[ "$job_count" == "2" ]] || return 1
  awk 'BEGIN{ok=1} /^30 2 \* \* \* root / || /^30 4 \* \* 0 root / { if (NF < 7) ok=0; count++ } END{ exit !(ok && count==2) }' "$cron_file" || return 1
  cron_base="$(basename "$cron_file")"
  [[ "$cron_base" != *.* ]] || return 1
  pass "cron/logrotate newline and cron format"
}
main() {
  rm -rf "$TEST_ROOT"
  mkdir -p "$TEST_ROOT"
  cases=(
    case_daily_happy
    case_pg_dump_fail
    case_small_dump
    case_disk_gate
    case_retention
    case_no_forbidden_rclone
    case_lock_held
    case_env_mode
    case_hc_not_in_output
    case_dry_run
    case_weekly
    case_weekly_lock_timeout
    case_backup_env_load_order
    case_cron_logrotate_newline
  )
  for c in "${cases[@]}"; do
    if "$c"; then :; else fail "$c"; fi
  done
  printf '\nSummary: PASS=%s FAIL=%s\n' "$PASS_COUNT" "$FAIL_COUNT"
  [[ "$FAIL_COUNT" -eq 0 ]] || return 1
}

main "$@"
