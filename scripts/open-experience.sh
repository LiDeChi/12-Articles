#!/usr/bin/env bash

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_INPUT="${CODEX_WORKTREE_PATH:-$PROJECT_ROOT}"
HOST="127.0.0.1"
PORT="44024"
EXPERIENCE_URL="http://${HOST}:${PORT}/"
SERVER_PID=""
PREVIEW_DIR=""

if [[ ! -d "$WORKTREE_INPUT" ]]; then
  printf '无法定位 12-Articles 工作树：%s\n' "$WORKTREE_INPUT" >&2
  exit 1
fi

WORKTREE_PATH="$(cd "$WORKTREE_INPUT" && pwd -P)"

if [[ ! -f "$WORKTREE_PATH/_quarto.yml" ]] || [[ ! -f "$WORKTREE_PATH/index.qmd" ]]; then
  printf '目标不是 12-Articles Quarto 项目：%s\n' "$WORKTREE_PATH" >&2
  exit 1
fi

cd "$WORKTREE_PATH"

is_worktree_listener() {
  local listener_pid
  local listener_cwd
  local source_marker

  while IFS= read -r listener_pid; do
    [[ -n "$listener_pid" ]] || continue
    listener_cwd="$(
      lsof -a -p "$listener_pid" -d cwd -Fn 2>/dev/null |
        sed -n 's/^n//p' |
        head -n 1
    )"
    source_marker="$listener_cwd/.codex-source-worktree"
    if [[ -f "$source_marker" ]] &&
      [[ "$(sed -n '1p' "$source_marker")" == "$WORKTREE_PATH" ]]; then
      return 0
    fi
  done < <(lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)

  return 1
}

is_project_server() {
  local response

  is_worktree_listener || return 1
  response="$(curl --silent --show-error --max-time 2 "$EXPERIENCE_URL" 2>/dev/null || true)"
  [[ "$response" == *"李德驰的研究笔记"* ]] &&
    [[ "$response" == *"quarto-listing"* ]]
}

open_experience() {
  if [[ "${OPEN_EXPERIENCE_NO_OPEN:-0}" == "1" ]]; then
    printf '体验已就绪：%s\n' "$EXPERIENCE_URL"
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    open "$EXPERIENCE_URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$EXPERIENCE_URL"
  else
    printf '体验已就绪，请打开：%s\n' "$EXPERIENCE_URL"
  fi
}

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "$PREVIEW_DIR" ]] &&
    [[ "$(basename "$PREVIEW_DIR")" == codex-12-articles-preview.* ]] &&
    [[ -d "$PREVIEW_DIR" ]]; then
    rm -rf "$PREVIEW_DIR"
  fi
}

if is_project_server; then
  open_experience
  exit 0
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  printf '端口 %s 已被其他服务占用，未启动错误的项目。\n' "$PORT" >&2
  exit 1
fi

trap cleanup EXIT INT TERM
# Quarto preview removes root-level generated files tracked for the repository's
# legacy Pages setting, so run it in an isolated staging directory.
PREVIEW_DIR="$(mktemp -d "${TMPDIR:-/tmp}/codex-12-articles-preview.XXXXXX")"
rsync -a \
  --exclude=".git/" \
  --exclude=".quarto/" \
  --exclude="_site/" \
  --exclude-from="$WORKTREE_PATH/.published-site-files" \
  "$WORKTREE_PATH/" "$PREVIEW_DIR/"
printf '%s\n' "$WORKTREE_PATH" > "$PREVIEW_DIR/.codex-source-worktree"
cd "$PREVIEW_DIR"

quarto preview --host "$HOST" --port "$PORT" --no-browser &
SERVER_PID=$!

for _ in $(seq 1 120); do
  if is_project_server; then
    open_experience
    wait "$SERVER_PID"
    exit $?
  fi

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
    exit $?
  fi

  sleep 0.25
done

printf 'Quarto 预览未在预期时间内就绪：%s\n' "$EXPERIENCE_URL" >&2
exit 1
