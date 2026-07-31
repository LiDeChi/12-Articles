#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN="${PUBLISH_DRY_RUN:-0}"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$PROJECT_ROOT"

for required_command in git node quarto; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf '缺少发布所需命令：%s\n' "$required_command" >&2
    exit 1
  fi
done

if [[ "$DRY_RUN" != "1" ]]; then
  CURRENT_BRANCH="$(git branch --show-current)"
  if [[ "$CURRENT_BRANCH" != "main" ]]; then
    printf '快速发布只能在 main 分支运行；当前分支是 %s。\n' "${CURRENT_BRANCH:-（游离状态）}" >&2
    exit 1
  fi

  OUTSIDE_CHANGES=()
  while IFS= read -r changed_path; do
    [[ -n "$changed_path" ]] || continue
    case "$changed_path" in
      posts/* | assets/articles/*)
        ;;
      *)
        OUTSIDE_CHANGES+=("$changed_path")
        ;;
    esac
  done < <(
    {
      git -c core.quotepath=false diff --name-only
      git -c core.quotepath=false diff --cached --name-only
      git -c core.quotepath=false ls-files --others --exclude-standard
    } | sort -u
  )

  if (( ${#OUTSIDE_CHANGES[@]} > 0 )); then
    printf '检测到文章目录之外的未提交改动，发布已停止：\n' >&2
    printf '  - %s\n' "${OUTSIDE_CHANGES[@]}" >&2
    printf '请先单独处理这些改动，避免把程序配置误带入文章发布。\n' >&2
    exit 1
  fi

  git fetch origin main
  if [[ "$(git rev-list --count HEAD..origin/main)" != "0" ]]; then
    printf '远端 main 有更新，请先同步后再发布。\n' >&2
    exit 1
  fi
  if [[ "$(git rev-list --count origin/main..HEAD)" != "0" ]]; then
    printf '本地 main 含有尚未推送的提交，请先检查或推送后再发布。\n' >&2
    exit 1
  fi
fi

printf '1/3 为新笔记分配序号…\n'
node scripts/number-posts.mjs

printf '2/3 检查文章元数据与发布顺序…\n'
node scripts/check-content.mjs

printf '3/3 构建 Quarto 文章站…\n'
quarto render

if [[ "$DRY_RUN" == "1" ]]; then
  printf '干运行通过：编号、内容检查与完整构建均成功；未提交、未推送。\n'
  exit 0
fi

git add -A -- posts assets/articles

if git diff --cached --quiet; then
  printf '没有需要发布的文章改动。\n'
  exit 0
fi

PUBLISH_LABEL="${*:-$(date '+%Y-%m-%d %H:%M')}"
PUBLISH_LABEL="${PUBLISH_LABEL//$'\n'/ }"
git commit -m "content: publish ${PUBLISH_LABEL}"
git push origin main

printf '\n文章已推送。GitHub Pages 通常会在 1–2 分钟内更新：\n'
printf '  文章站：https://lidechi.github.io/blog/\n'
printf '  主页博客：https://wordm.us/blog/\n'
