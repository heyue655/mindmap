#!/usr/bin/env bash
# ============================================================
# scripts/clear-db.sh — 清空数据库所有业务表
#
# 用法：
#   npm run db:clear          # 交互模式（需输入 yes 确认）
#   npm run db:clear -- --yes # 静默模式（CI / 脚本调用）
#
# 说明：
#   - 通过 prisma db execute 执行，无需本地安装 mysql 客户端
#   - 关闭外键检查后 TRUNCATE 全部 15 张业务表，再重新开启
#   - 不删除表结构，不影响 _prisma_migrations 记录
#   - 清空后需手动在 MySQL 执行 scripts/clear-db.sql 重建 admin 用户
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "错误：找不到 $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"

# ── 二次确认 ────────────────────────────────────────────────
SKIP_CONFIRM=false
for arg in "$@"; do
  [[ "$arg" == "--yes" || "$arg" == "-y" ]] && SKIP_CONFIRM=true
done

if [[ "$SKIP_CONFIRM" == false ]]; then
  echo ""
  echo "  ⚠️  即将清空数据库：$DB_NAME"
  echo "  此操作将删除所有业务数据，不可恢复！"
  echo ""
  read -r -p "  确认清空？输入 yes 继续：" confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "已取消。"
    exit 0
  fi
fi

echo ""
echo "正在清空数据库 $DB_NAME ..."

cd "$PROJECT_ROOT"

npx --yes prisma db execute --stdin <<'SQL'
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE calendar_syncs;
TRUNCATE TABLE mention_events;
TRUNCATE TABLE node_shares;
TRUNCATE TABLE attachments;
TRUNCATE TABLE task_logs;
TRUNCATE TABLE relationships;
TRUNCATE TABLE nodes;
TRUNCATE TABLE mindmaps;
TRUNCATE TABLE app_notifications;
TRUNCATE TABLE work_reports;
TRUNCATE TABLE follow_grants;
TRUNCATE TABLE assignments;
TRUNCATE TABLE org_relations;
TRUNCATE TABLE users;
TRUNCATE TABLE departments;

SET FOREIGN_KEY_CHECKS = 1;
SQL

echo ""
echo "✓ 数据库已清空（$DB_NAME）"
echo ""
echo "  别忘了在 MySQL 执行 scripts/clear-db.sql 重建 admin 用户。"
echo ""
