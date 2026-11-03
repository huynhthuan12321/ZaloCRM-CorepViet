#!/usr/bin/env bash
# Read-only gate. Intentionally independent of Docker, env files and databases.
set -euo pipefail

root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$root"
git rev-parse --show-toplevel >/dev/null
failed=0

reject() {
  printf 'ERROR: %s: %q\n' "$1" "$2" >&2
  failed=1
}

# Capture first so a Git failure cannot disappear inside process substitution.
tracked="$(git -c core.quotePath=true status --porcelain=v1 --untracked-files=no --ignore-submodules=none)"
if [[ -n "$tracked" ]]; then
  printf 'ERROR: tracked changes (including staged changes/submodules):\n%s\n' "$tracked" >&2
  failed=1
fi

# Git quotes unusual path names.
# Non-ignored untracked files are always rejected, even outside the build inputs.
untracked="$(git -c core.quotePath=true ls-files --others --exclude-standard)"
if [[ -n "$untracked" ]]; then
  printf 'ERROR: untracked paths:\n%s\n' "$untracked" >&2
  failed=1
fi

# Git ignore is not Docker ignore. Reject ignored files/directories beneath all
# build-input roots, except known local outputs that .dockerignore also excludes.
# Exclude entire output directories in Git's pathspec before walking their files.
ignored="$(git -c core.quotePath=true ls-files --others --ignored --exclude-standard -- \
  backend frontend docker \
  ':(exclude,glob)**/node_modules/**' ':(exclude,glob)**/dist/**' \
  ':(exclude)backend/static' ':(exclude,glob)**/.env' \
  ':(exclude,glob)**/.env.*' ':(exclude,glob)**/.DS_Store' \
  ':(exclude,glob)**/*.log')"
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  reject "ignored build-input path" "$path"
done <<< "$ignored"

# A Dockerfile-specific ignore file overrides the root policy. Do not silently
# allow a second policy (tracked or ignored) to bypass the packaging contract.
if [[ -e docker/Dockerfile.dockerignore || -L docker/Dockerfile.dockerignore ]]; then
  reject "unsupported Docker ignore override" "docker/Dockerfile.dockerignore"
fi

if (( failed )); then
  printf '%s\n' \
    'Deploy blocked. Review the listed paths; commit approved release inputs or move local helpers/data outside this checkout.' \
    'Do not delete user files or use ALLOW_DIRTY to bypass this gate. Git ignore alone does not make a build input safe.' >&2
  exit 1
fi
printf '%s\n' 'Build worktree gate OK: tracked/untracked inputs are clean; ignored build-input paths checked.'
