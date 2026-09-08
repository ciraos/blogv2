# =============================================================================
# blog-app 前端 Docker 构建（Next.js 16, output: standalone）
#
# 与 package.json 的 deploy/copy 脚本一致：
#   build -> next build（standalone 产物）
#   copy  -> cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
#   run   -> PORT=3126 node .next/standalone/server.js
#
# 构建时需通过 --build-arg 注入浏览器端内联的 NEXT_PUBLIC_* 变量（.env 不入镜像）：
#   docker build \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://blog.example.com \
#     --build-arg NEXT_PUBLIC_API_URL=https://blog.example.com/api \
#     -t blog-app .
#
# 运行（端口按需映射）：
#   docker run -d -p 3126:3126 --name blog-app blog-app
# =============================================================================

# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 先拷贝依赖清单，充分利用 Docker 层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Next 公开变量（构建期内联到产物）
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1

# 拷贝源码并构建（standalone 产物 + public/.next/static 并入）
COPY . .
RUN pnpm build && pnpm copy

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3126 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# 非 root 运行
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# 独立产物：server.js + 服务端 chunk + node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 静态资源（standalone 不默认包含，需手动并入）
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3126

CMD ["node", "server.js"]
