# syntax=docker/dockerfile:1

# =============================================================================
# 博客前端镜像（Next.js 16 standalone）
# =============================================================================
# 分三阶段：deps（装依赖）→ builder（构建）→ runner（只带 standalone 产物）。
#
# ⚠️ 本仓库此前 Dockerfile 是 0 字节（README 承诺了 docker 部署但文件是空的），
#    这份是按 README 的口径补的：node:20-alpine + 多阶段 + 非 root + standalone + 3126。
#    **尚未在 CI/本地实际构建验证过**（开发机上没有 docker），首次上传后请先跑一次：
#       docker build --build-arg NEXT_PUBLIC_SITE_URL=https://blog.example.com \
#                    --build-arg NEXT_PUBLIC_API_URL=https://blog.example.com/api -t blog-app .
#
# NEXT_PUBLIC_* 是**构建期**内联进产物的（改完必须重新构建），所以走 ARG 而不是运行时 env。
# .env 不会进镜像（见 .dockerignore）。
# =============================================================================

FROM node:20-alpine AS base
# corepack 提供 pnpm；pnpm-lock.yaml 的 lockfileVersion 是 9.0，对应 pnpm 9/10 均可
RUN corepack enable
WORKDIR /app

# ---------- 依赖 ----------
FROM base AS deps
# pnpm-workspace.yaml 里是 pnpm 的 allowBuilds 配置，缺了会导致依赖的构建脚本行为与本地不一致
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- 构建 ----------
FROM base AS builder
# 浏览器端变量：构建期内联，必须在这里给
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GRAVATAR_URL
# 服务端变量：next.config.ts 的 rewrites() 在构建期求值，后端基址也在这里定
ARG BACKEND_URL
ARG API_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_GRAVATAR_URL=${NEXT_PUBLIC_GRAVATAR_URL} \
    BACKEND_URL=${BACKEND_URL} \
    API_URL=${API_URL} \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build → .next/standalone（output: "standalone"，见 next.config.ts）
RUN pnpm build

# 把静态资源并进 standalone：等价于 package.json 的 `pnpm copy`（脚本用了 cp，仅 Linux/macOS）
RUN cp -r public .next/standalone/ \
    && mkdir -p .next/standalone/.next \
    && cp -r .next/static .next/standalone/.next/

# ---------- 运行 ----------
FROM node:20-alpine AS runner
WORKDIR /app

# 非 root 运行（与 README 一致）
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

ENV NODE_ENV=production \
    PORT=3126 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 3126

# standalone 产物自带 server.js
CMD ["node", "server.js"]
