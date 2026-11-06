# blog-app · 博客前端

[简体中文](./README.md) · [English](./README.en.md)

基于 **Next.js 16（App Router）** 的博客前台与后台管理界面。

前端与后端（Go 服务）**分离部署**：后端提供数据接口且不开放 CORS，因此浏览器端的所有请求都经由本应用的 `/api/*` 同源路由转发；服务端组件（Server Components）则直连远端接口。仓库只包含前端，内容与数据来自后端。

## ✨ 功能特性

### 前台（`(blog)` 路由组）

- **文章**：首页分页列表、文章详情（目录 TOC、代码高亮、KaTeX 公式、Mermaid 图表）、随机文章
- **分类与标签**：分类 / 标签聚合页、归档时间线
- **随笔**：瀑布流 + 时间线双视图、图片灯箱
- **友链**：友链卡片、分区展示、自助申请表单
- **朋友圈**：拉取并展示友链站点动态
- **搜索**：站内搜索
- **评论**：文章评论、评论时间线、评论图片上传（支持匿名评论）
- **其它**：关于页、相册（`/album`）、音乐播放器（`/music`）、留言板、装备页（`/equipment`）、更新日志（`/update`）

### 后台（`admin` 路由组）

用户与用户组、文章 / 分类 / 标签管理、评论、随笔、友链（含健康检查）、朋友圈、相册、会员、订单、商品、捐赠、知识库、文档系列、页面管理、SEO 推送、存储、主题、插件、图片样式与缓存、站点设置等 20+ 管理页面。

### SEO 与订阅

`robots.txt`、`sitemap.xml`、RSS（`/rss.xml`）、Atom（`/atom.xml`）、`llms.txt`、PWA manifest，以及取自后端站点配置的动态图标。

### 体验

明暗主题（默认模式由后端配置决定）、响应式布局、移动端汉堡菜单、悬浮操作按钮、回到顶部、Token 过期静默登出提示。

> 说明：`air-conditioner` 等页面为预留占位，暂无内容。`equipment` 装备页与 `update` 更新日志页已接通：装备页读 site-config 的 `equipment.*`；更新日志拉官方 changelog 聚合接口（`anheyuofficialwebsiteapi.anheyu.com`，最近 10 条 Release）。

## 🧱 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Next.js 16.2（App Router、React Compiler）+ React 19 |
| 语言 | TypeScript 5.9 |
| 样式 | Tailwind CSS 4 + `tw-animate-css` |
| 组件 | shadcn/ui（`radix-nova` 风格）、radix-ui、`@base-ui/react`、lucide-react |
| 内容渲染 | MDX、highlight.js、KaTeX、Mermaid、remark-gfm |
| 图表与表格 | Recharts、TanStack Table、dnd-kit |
| 其它 | sonner（提示）、vaul（抽屉）、next-themes、zod |

## 📁 目录结构

```text
blog-app/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/          # 登录 / 注册 / 账号激活
│  │  ├─ (blog)/          # 前台页面（layout 内含 header、侧边栏、footer）
│  │  ├─ admin/           # 后台管理页面
│  │  ├─ album/ music/    # 相册、音乐播放器
│  │  ├─ api/             # 同源代理路由（auth / admin / public / search）
│  │  ├─ rss.xml/ atom.xml/ llms.txt/   # Feed 与 LLM 说明的 Route Handler
│  │  └─ sitemap.ts robots.ts manifest.ts
│  ├─ components/         # 组件：(blog) / admin / ui / (auth) / (music)
│  ├─ lib/                # api 客户端、鉴权常量、SEO、Feed、站点配置
│  ├─ types/              # 后端接口的类型定义
│  ├─ hooks/ utils/
│  └─ proxy.ts            # 请求代理（原 middleware）：登录守卫 + 注入 x-pathname
├─ scripts/               # 本地开发期的探测 / 验证脚本（已 gitignore）
├─ Dockerfile
├─ docker-compose.yml
└─ next.config.ts
```

## 🚀 快速开始

### 环境要求

- Node.js **≥ 20**
- pnpm（仓库使用 `pnpm-lock.yaml`）
- 一个可访问的后端 API 服务

### 安装与启动

```bash
pnpm install

# 配置环境变量（.env 不入版本库）
cp .env.example .env

pnpm dev        # 开发服务器：http://localhost:3126
```

### 构建与本地运行

```bash
pnpm build      # 产出 standalone 产物
pnpm copy       # 将 public / .next/static 并入 standalone（cpy-cli，跨平台）
pnpm start      # 或：PORT=3126 node .next/standalone/server.js
```

## 🔧 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | ✅ | 站点对外 origin（不带路径），用于 SEO、站点地图、图标等 |
| `NEXT_PUBLIC_API_URL` | — | 远端 API 基址（**带 `/api` 后缀**）。不填时自动用 `NEXT_PUBLIC_SITE_URL + /api`，只有后端独立域名时才需要 |
| `NEXT_PUBLIC_GRAVATAR_URL` | — | 头像服务地址，默认 `https://cravatar.cn/` |
| `BACKEND_URL` | — | 仅开发环境：`rewrites()` 代理后端时的基址（不带 `/api`） |
| `API_URL` | — | 仅生产环境：同上 |

`rewrites()` 的后端基址按 `BACKEND_URL`(dev) / `API_URL`(prod) → `NEXT_PUBLIC_SITE_URL` → 通用兜底 的顺序回退。**后端与站点同源时无需额外配置**，只填前两个变量即可。

> ⚠️ `NEXT_PUBLIC_*` 会在**构建期**内联进产物，修改后必须重新构建（`pnpm build` 或 `docker compose up -d --build`）。

## 🏗 架构说明

### 请求链路

后端不开放 CORS，浏览器无法直连远端接口，因此分两条路径：

```text
浏览器 ──▶ 本站 /api/*（Route Handler）──▶ 远端后端 /api/*
                （合并数据、统一响应形状）

Server Component ──▶ 远端后端（直连，无 CORS 限制）
```

静态与媒体资源由 `next.config.ts` 的 `rewrites()` 代理到后端：

- `/f/*` → 后端文件直链（后端路由在 `/api/f/` 下）
- `/needcache/*` → 缓存文件
- `/static/*` → 后端上传的图片等（优先命中 `public/` 中的同名文件）

> `/api/*` **不在** `rewrites()` 中代理，避免抢占 `src/app/api/*` 的同源路由。

### 鉴权

- 登录成功后由 `/api/auth/login` 写入 **httpOnly cookie**（`token`，有效期 7 天；另有 `refresh_token` 30 天），客户端不保存 token。
- `src/proxy.ts` 负责登录态守卫：未登录访问 `/admin/**` 跳转 `/login`；已登录访问 `/login` 跳转 `/admin/dashboard`；并为所有请求注入 `x-pathname` 头，供服务端 layout 判断页面类型。
- Token 失效时，`(blog)` layout 标记 `authExpired`，由客户端组件静默登出并提示。

## 🐳 部署

### Docker Compose（推荐）

`docker compose` 会自动读取同目录的 `.env` 做 `${VAR}` 插值：

```bash
docker compose up -d --build
# 服务地址：http://<host>:3126（端口可在 docker-compose.yml 中映射）
```

### Docker

`.env` 不会打进镜像，浏览器端变量必须在构建时通过 `--build-arg` 注入：

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://blog.example.com \
  --build-arg NEXT_PUBLIC_API_URL=https://blog.example.com/api \
  -t blog-app .

docker run -d -p 3126:3126 --name blog-app blog-app
```

镜像基于 `node:20-alpine`，采用多阶段构建、以非 root 用户运行，最终产物为 `standalone` 输出。

## 📜 可用脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器（端口 3126） |
| `pnpm build` | 生产构建（standalone） |
| `pnpm start` | 启动 Next 服务 |
| `pnpm lint` | ESLint 检查 |
| `pnpm copy` | 将 `public/`、`.next/static` 并入 standalone 产物（cpy-cli 实现，Windows / Linux / macOS 通用） |
| `pnpm deploy` | 安装依赖 → 构建 → 拷贝 → `node .next/standalone/server.js` |

## 📄 许可证

> **本项目是 anheyu-app 的第三方前端，与 anheyu 官方无隶属关系，也不属于官方发行版。**

本项目的后端接口对接 [anzhiyu-c/anheyu-app](https://github.com/anzhiyu-c/anheyu-app)（**GPL-3.0** 许可）。本仓库作为衍生作品，以 **GNU GPL v3.0**（或兼容的后续版本）发布，详见 [LICENSE](./LICENSE)。

- 修改与再分发须遵循 GPL-3.0 的 copyleft 条款（保留版权声明、提供源码、不得改成更宽松许可）。
- 第三方组件、字体（站酷快乐体 OFL-1.1）与媒体素材的授权说明见 [NOTICE](./NOTICE)；`public/iconfont/` 的 AnZHiYu 图标库、音乐唱片等素材来源各自有授权，不随代码自动获得再分发权。
- 本前端配套的后端亦为 anzhiyu 生态的 GPL 开源项目。
