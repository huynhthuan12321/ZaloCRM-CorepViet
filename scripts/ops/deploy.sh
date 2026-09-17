#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-app}"
IMAGE_NAME="${IMAGE_NAME:-zalocrm-corepviet-app}"
HEALTH_URL="${HEALTH_URL:-http://172.17.0.1:${APP_PORT:-3080}/health/ready}"
DISK_PATH="${DISK_PATH:-/}"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  scripts/ops/deploy.sh [--dry-run] <SHA>
  scripts/ops/deploy.sh [--dry-run] rollback <OLD_SHA>

Deploy mode:
  - aborts when disk usage is > 80%
  - aborts when the git worktree is dirty
  - fetches origin before resolving <SHA>
  - tags the current app image as IMAGE_NAME:<current-git-sha>
    using the running container image if it differs from IMAGE_NAME:latest
  - git checkout <SHA>
  - docker compose -f docker-compose.yml build app
  - tags the new image as IMAGE_NAME:<SHA>
  - docker compose -f docker-compose.yml up -d --no-deps app
  - waits up to 3 minutes for /health/ready HTTP 200

Rollback mode:
  - does not run disk or dirty-worktree gates
  - warns and continues if git fetch fails
  - verifies IMAGE_NAME:<OLD_SHA> exists before git checkout
  - git checkout <OLD_SHA>
  - retags IMAGE_NAME:<OLD_SHA> as IMAGE_NAME:latest
  - docker compose -f docker-compose.yml up -d --no-deps --no-build app
  - does not rebuild

Environment overrides:
  IMAGE_NAME, COMPOSE_FILE, COMPOSE_SERVICE, HEALTH_URL, DISK_PATH
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

disk_used_percent() {
  df -P "$DISK_PATH" | awk 'NR==2 {value=$(NF-1); gsub("%", "", value); print value}'
}

check_disk_gate() {
  local used
  used="$(disk_used_percent)"
  if [[ -z "$used" || ! "$used" =~ ^[0-9]+$ ]]; then
    log "ERROR: cannot read disk usage for $DISK_PATH"
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Disk gate dry-run: ${used}% used on $DISK_PATH."
    if (( used > 80 )); then
      log "WOULD FAIL: disk usage is ${used}% on $DISK_PATH; deploy gate requires <= 80%."
    else
      log "Would pass: disk usage is <= 80%."
    fi
    return
  fi
  if (( used > 80 )); then
    log "ERROR: disk usage is ${used}% on $DISK_PATH; deploy gate requires <= 80%."
    exit 1
  fi
  log "Disk gate OK: ${used}% used on $DISK_PATH."
}

ensure_clean_worktree() {
  if [[ "${ALLOW_DIRTY:-0}" == "1" ]]; then
    return
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    run git -C "$REPO_ROOT" diff --quiet --ignore-submodules --
    run git -C "$REPO_ROOT" diff --cached --quiet --ignore-submodules --
    log "Dry-run: deploy would stop if the git worktree has uncommitted changes."
    return
  fi
  if ! git -C "$REPO_ROOT" diff --quiet --ignore-submodules -- || \
     ! git -C "$REPO_ROOT" diff --cached --quiet --ignore-submodules --; then
    log "ERROR: git worktree has uncommitted changes. Set ALLOW_DIRTY=1 only for an explicitly approved ops run."
    exit 1
  fi
}

wait_ready() {
  local rollback_sha="$1"
  local deadline status
  deadline=$((SECONDS + 180))
  log "Waiting for ready check: $HEALTH_URL"
  while (( SECONDS < deadline )); do
    status="$(curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
    if [[ "$status" == "200" ]]; then
      log "Ready check PASS: HTTP 200."
      return 0
    fi
    sleep 5
  done

  log "ERROR: ready check did not return HTTP 200 within 3 minutes."
  log "Manual rollback command, after approval:"
  log "  scripts/ops/deploy.sh rollback $rollback_sha"
  return 1
}

short_sha() {
  git -C "$REPO_ROOT" rev-parse --short=7 "$1"
}

fetch_origin() {
  run git fetch --quiet origin
}

fetch_origin_for_mode() {
  if [[ "$MODE" == "rollback" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      run git fetch --quiet origin
      log "Dry-run: rollback would warn and continue if git fetch fails."
      return
    fi
    if ! git fetch --quiet origin; then
      log "WARNING: git fetch failed; continuing rollback because rollback uses local commit/image state."
    fi
    return
  fi

  fetch_origin
}

require_rollback_image() {
  local tag="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    run docker image inspect "$IMAGE_NAME:$tag"
    return 0
  fi
  if ! docker image inspect "$IMAGE_NAME:$tag" >/dev/null 2>&1; then
    log "ERROR: rollback image not found: $IMAGE_NAME:$tag"
    log "No git checkout was performed."
    exit 1
  fi
}

running_container_id() {
  docker compose -f "$COMPOSE_FILE" ps -q "$COMPOSE_SERVICE" 2>/dev/null || true
}

running_image_id() {
  local container_id="$1"
  if [[ -z "$container_id" ]]; then
    return 0
  fi
  docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || true
}

latest_image_id() {
  docker image inspect --format '{{.Id}}' "$IMAGE_NAME:latest" 2>/dev/null || true
}

tag_current_rollback_image() {
  local current_short="$1"
  local container_id container_image latest_image source_ref

  if [[ "$DRY_RUN" -eq 1 ]]; then
    run docker compose -f "$COMPOSE_FILE" ps -q "$COMPOSE_SERVICE"
    run docker inspect --format '{{.Image}}' '<running-container-id>'
    run docker image inspect --format '{{.Id}}' "$IMAGE_NAME:latest"
    log "Dry-run: if running container image differs from $IMAGE_NAME:latest, tag the running image ID."
    run docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:$current_short"
    return 0
  fi

  container_id="$(running_container_id)"
  container_image="$(running_image_id "$container_id")"
  latest_image="$(latest_image_id)"
  source_ref="$IMAGE_NAME:latest"

  if [[ -n "$container_image" && -n "$latest_image" && "$container_image" != "$latest_image" ]]; then
    log "WARNING: running app container image differs from $IMAGE_NAME:latest; tagging running image for rollback."
    source_ref="$container_image"
  elif [[ -z "$latest_image" && -n "$container_image" ]]; then
    log "WARNING: $IMAGE_NAME:latest not found; tagging running container image for rollback."
    source_ref="$container_image"
  fi

  docker tag "$source_ref" "$IMAGE_NAME:$current_short"
}

tag_same_sha_previous_image() {
  local current_short="$1"
  local stamp prev_tag
  stamp="$(date +%Y%m%d%H%M%S)"
  prev_tag="${current_short}-prev-${stamp}"
  log "ALLOW_SAME_SHA=1: preserving current image as $IMAGE_NAME:$prev_tag before rebuild."
  tag_current_rollback_image "$prev_tag"
  HEALTH_ROLLBACK_SHA="$prev_tag"
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
        break
        ;;
    esac
  done

  if [[ $# -lt 1 ]]; then
    usage
    exit 2
  fi

  MODE="deploy"
  TARGET_SHA="$1"
  if [[ "$1" == "rollback" ]]; then
    MODE="rollback"
    if [[ $# -ne 2 ]]; then
      usage
      exit 2
    fi
    TARGET_SHA="$2"
  elif [[ $# -ne 1 ]]; then
    usage
    exit 2
  fi
}

main() {
  parse_args "$@"
  require_cmd git
  require_cmd docker
  require_cmd df
  require_cmd awk
  require_cmd curl

  cd "$REPO_ROOT"
  fetch_origin_for_mode
  git rev-parse --verify "$TARGET_SHA^{commit}" >/dev/null
  TARGET_SHORT="$(short_sha "$TARGET_SHA")"

  if [[ "$MODE" == "rollback" ]]; then
    log "Rollback to $TARGET_SHORT without rebuild."
    require_rollback_image "$TARGET_SHORT"
    run git checkout "$TARGET_SHA"
    run docker tag "$IMAGE_NAME:$TARGET_SHORT" "$IMAGE_NAME:latest"
    run docker compose -f "$COMPOSE_FILE" up -d --no-deps --no-build "$COMPOSE_SERVICE"
    HEALTH_ROLLBACK_SHA="$TARGET_SHORT"
  else
    CURRENT_SHORT="$(short_sha HEAD)"
    if [[ "$TARGET_SHORT" == "$CURRENT_SHORT" && "${ALLOW_SAME_SHA:-0}" != "1" ]]; then
      log "ERROR: target SHA equals current SHA ($CURRENT_SHORT). Set ALLOW_SAME_SHA=1 only for an explicitly approved rebuild."
      exit 1
    fi
    check_disk_gate
    ensure_clean_worktree
    if [[ "$TARGET_SHORT" == "$CURRENT_SHORT" ]]; then
      log "Deploy $TARGET_SHORT with ALLOW_SAME_SHA=1."
      tag_same_sha_previous_image "$CURRENT_SHORT"
    else
      log "Deploy $TARGET_SHORT; current rollback image tag will be $CURRENT_SHORT."
      tag_current_rollback_image "$CURRENT_SHORT"
      HEALTH_ROLLBACK_SHA="$CURRENT_SHORT"
    fi
    run git checkout "$TARGET_SHA"
    run docker compose -f "$COMPOSE_FILE" build "$COMPOSE_SERVICE"
    run docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:$TARGET_SHORT"
    run docker compose -f "$COMPOSE_FILE" up -d --no-deps "$COMPOSE_SERVICE"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Dry-run complete; health check not executed."
  else
    wait_ready "$HEALTH_ROLLBACK_SHA"
  fi
}

main "$@"
