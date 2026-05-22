思维导图任务管理 · 前端源码包
================================

本压缩包仅含前端源码与构建配置（不含 server、node_modules、dist）。

解压后在此目录执行：
  npm ci          （或 npm install）
  npm run dev     开发（默认会代理 /api 到 127.0.0.1:3001，无后端则设 .env.development.local 中 VITE_USE_API=false）
  npm run build   生产构建

静态演示包（不接后端、可双击打开）在完整仓库中执行：
  npm run build:static-demo

与需求文档一并分发时，可使用仓库根目录打包命令生成的：
  mindmap-docs-and-frontend.zip
内含 docs/superpowers、HANDOFF.md、.env.example 与本前端目录清单。
详见 HANDOFF.md。
