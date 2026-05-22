#!/bin/sh
set -e

echo "[entrypoint] 正在执行 prisma db push（同步数据库 schema）..."
npx prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] 启动 Next.js 应用..."
exec node server.js
