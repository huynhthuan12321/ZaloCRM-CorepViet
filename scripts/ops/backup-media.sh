#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-/var/lib/docker/volumes/zalocrm-corepviet_file_storage/_data}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/zalocrm-media}"
DISK_PATH="${DISK_PATH:-/}"
DRY_RUN=0
TMP_FILE=""
LIST_FILE=""

usage() {
  cat <<'EOF'
Usage:
  scripts/ops/backup-media.sh [--dry-run]

Creates a tar backup of the media volume, verifies that the number of files in
the tar matches the number of files in the volume, and writes a sha256 checksum.

Environment overrides:
  SOURCE_DIR=/var/lib/docker/volumes/zalocrm-corepviet_file_storage/_data
  BACKUP_DIR=/opt/backups/zalocrm-media
  DISK_PATH=/
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

disk_numbers_kb() {
  df -Pk "$DISK_PATH" | awk 'NR==2 {print $(NF-4), $(NF-3)}'
}

projected_disk_gate() {
  local total used source_kb projected percent
  read -r total used < <(disk_numbers_kb)
  source_kb="$(du -sk "$SOURCE_DIR" | awk '{print $1}')"
  projected=$((used + source_kb))
  percent=$(((projected * 100 + total - 1) / total))

  if (( percent > 80 )); then
    log "ERROR: projected disk usage after media backup is ${percent}% on $DISK_PATH; gate requires <= 80%."
    log "Current used=${used}KB, source=${source_kb}KB, total=${total}KB."
    exit 1
  fi
  log "Disk gate OK: projected ${percent}% used on $DISK_PATH."
}

count_source_files() {
  local list_file="$1"
  tr -cd '\0' < "$list_file" | wc -c | awk '{print $1}'
}

count_tar_files() {
  local tar_file="$1"
  tar -tf "$tar_file" | awk '!/\/$/ {count++} END {print count + 0}'
}

cleanup() {
  if [[ -n "$TMP_FILE" ]]; then
    rm -f "$TMP_FILE"
  fi
  if [[ -n "$LIST_FILE" ]]; then
    rm -f "$LIST_FILE"
  fi
}

main() {
  parse_args "$@"
  require_cmd df
  require_cmd du
  require_cmd find
  require_cmd tar
  require_cmd sha256sum

  if [[ ! -d "$SOURCE_DIR" ]]; then
    log "ERROR: media source directory does not exist: $SOURCE_DIR"
    exit 1
  fi

  projected_disk_gate

  local stamp tar_file source_count tar_count
  stamp="$(date +%Y%m%d-%H%M%S)"
  tar_file="$BACKUP_DIR/file_storage-${stamp}.tar"
  TMP_FILE="${tar_file}.tmp"
  LIST_FILE="${tar_file}.files"
  trap cleanup EXIT

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would back up files from $SOURCE_DIR to $tar_file"
    run mkdir -p "$BACKUP_DIR"
    run find "$SOURCE_DIR" -type f -printf '%P\\0' '>' "$LIST_FILE"
    log "Would count source files with: tr -cd '\\0' < $LIST_FILE | wc -c"
    run tar -C "$SOURCE_DIR" --null -T "$LIST_FILE" -cf "$TMP_FILE"
    run mv "$TMP_FILE" "$tar_file"
    log "Would write checksum with relative file name from $BACKUP_DIR."
    run sha256sum "$(basename "$tar_file")" '>' "$(basename "$tar_file").sha256"
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  find "$SOURCE_DIR" -type f -printf '%P\0' > "$LIST_FILE"
  source_count="$(count_source_files "$LIST_FILE")"
  tar -C "$SOURCE_DIR" --null -T "$LIST_FILE" -cf "$TMP_FILE"
  mv "$TMP_FILE" "$tar_file"
  TMP_FILE=""

  tar_count="$(count_tar_files "$tar_file")"
  if [[ "$tar_count" != "$source_count" ]]; then
    mv "$tar_file" "${tar_file}.bad"
    log "ERROR: tar file count mismatch: source=$source_count tar=$tar_count"
    log "Bad tar kept for inspection: ${tar_file}.bad"
    exit 1
  fi

  (
    cd "$BACKUP_DIR"
    sha256sum "$(basename "$tar_file")" > "$(basename "$tar_file").sha256"
  )
  log "Media backup PASS: $tar_file"
  log "File count: $tar_count"
  log "Checksum: ${tar_file}.sha256"
}

main "$@"
