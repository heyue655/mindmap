需求文档 + 前端源码 — 分发包说明
====================================

本压缩包（mindmap-docs-and-frontend.zip）适用于产品设计阶段结束后，向**前端 / 后端**同事交接（对齐接口字段与交互）。

包含：
- docs/superpowers/     规格与里程碑（主需求文档 specs/2026-04-27-mindmap-task-tool-design.md，当前 **v2.3**）
- HANDOFF.md            研发运行、目录、钉钉环境变量说明
- docs-pack-README.txt / frontend-pack-README.txt
- .env.example          环境变量示例（本包无 server，仅供对照）
- 前端源码与构建配置   src/、public/、index.html、package.json、vite/tsconfig/tailwind/components.json 等（不含 server、node_modules、dist）

v2.3 与后端相关摘要：
- 甘特图为导图内 **同一 Node.task** 的派生视图；持久化需在任务 JSON 中支持可选字段 **ganttStart**（YYYY-MM-DD）、**ganttDurationDays**（number）。

解压后：
1. 阅读 docs/superpowers/specs 下设计文档
2. 在压缩包根目录执行 npm ci && npm run dev（完整后端与钉钉联调需另取含 server/ 的仓库，见 HANDOFF.md §2.A）

生成日期：以打包当日为准；重新打包请在仓库根目录执行 HANDOFF.md「§2.B」中的 zip 命令。
