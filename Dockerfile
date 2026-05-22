# ────────────────────────────────────────────────────────────────
# Stage 1: 安装依赖（含 devDependencies，用于构建）
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# 安装 libc6-compat，解决 alpine 下部分 native 模块兼容问题
RUN apk add --no-cache libc6-compat

COPY package*.json ./
COPY prisma ./prisma/

# 安装全部依赖（包括 devDependencies）并生成 Prisma Client
RUN npm ci && npx prisma generate

# ────────────────────────────────────────────────────────────────
# Stage 2: 构建 Next.js 应用
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 构建时需要 NEXT_PUBLIC_USE_API=true 使 API 模式生效
ENV NEXT_PUBLIC_USE_API=true
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

RUN npm run build

# ────────────────────────────────────────────────────────────────
# Stage 3: 最小化运行时镜像
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# 安全：以非 root 用户运行
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# 拷贝 standalone 产物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 拷贝 Prisma schema 及生成的 Client（运行时 db push 需要）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 拷贝启动脚本
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 时区：规范 2-2 北京时间
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
