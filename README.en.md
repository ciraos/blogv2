# blog-app · Blog Frontend

[简体中文](./README.md) · [English](./README.en.md)

A blog frontend and admin console built with **Next.js 16 (App Router)**.

The frontend and the backend (a Go service) are **deployed separately**. The backend serves the data API and does **not** enable CORS, so every browser-side request is forwarded through this app's same-origin `/api/*` routes, while Server Components talk to the remote API directly. This repository contains the frontend only — all content and data come from the backend.

## ✨ Features

### Public site (the `(blog)` route group)

- **Posts**: paginated home list, post detail (table of contents, syntax highlighting, KaTeX formulas, Mermaid diagrams), random post
- **Categories & tags**: category / tag listing pages, archives timeline
- **Essays**: waterfall and timeline views, image lightbox
- **Friend links**: link cards, grouped sections, self-service application form
- **Friend circle**: fetches and displays activity from linked sites
- **Search**: site-wide search
- **Comments**: post comments, comments timeline, image upload (anonymous comments supported)
- **Others**: about page, album (`/album`), music player (`/music`), guestbook

### Admin console (the `admin` route group)

20+ management pages: users and user groups, posts / categories / tags, comments, essays, friend links (with health checks), friend circle, albums, memberships, orders, products, donations, knowledge base, doc series, page management, SEO push, storage, themes, plugins, image styles and cache, site settings, and more.

### SEO & feeds

`robots.txt`, `sitemap.xml`, RSS (`/rss.xml`), Atom (`/atom.xml`), `llms.txt`, a PWA manifest, and dynamic icons driven by the backend site config.

### Experience

Light/dark themes (the default mode comes from the backend config), responsive layout, mobile hamburger menu, floating action buttons, scroll-to-top, and silent logout with a notice when the token expires.

> Note: pages such as `air-conditioner`, `equipment`, and `update` are placeholders with no content yet.

## 🧱 Tech Stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16.2 (App Router, React Compiler) + React 19 |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 4 + `tw-animate-css` |
| UI | shadcn/ui (`radix-nova` style), radix-ui, `@base-ui/react`, lucide-react |
| Content rendering | MDX, highlight.js, KaTeX, Mermaid, remark-gfm |
| Charts & tables | Recharts, TanStack Table, dnd-kit |
| Misc | sonner (toasts), vaul (drawers), next-themes, zod |

## 📁 Project Structure

```text
blog-app/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/          # Login / register / account activation
│  │  ├─ (blog)/          # Public pages (layout holds header, sidebar, footer)
│  │  ├─ admin/           # Admin console pages
│  │  ├─ album/ music/    # Album and music player
│  │  ├─ api/             # Same-origin proxy routes (auth / admin / public / search)
│  │  ├─ rss.xml/ atom.xml/ llms.txt/   # Route Handlers for feeds and llms.txt
│  │  └─ sitemap.ts robots.ts manifest.ts
│  ├─ components/         # Components: (blog) / admin / ui / (auth) / (music)
│  ├─ lib/                # API client, auth constants, SEO, feeds, site config
│  ├─ types/              # Type definitions for backend API payloads
│  ├─ hooks/ utils/
│  └─ proxy.ts            # Request proxy (formerly middleware): auth guard + x-pathname
├─ scripts/               # Local dev probe / verification scripts (gitignored)
├─ Dockerfile
├─ docker-compose.yml
└─ next.config.ts
```

## 🚀 Getting Started

### Requirements

- Node.js **≥ 20**
- pnpm (the repo ships a `pnpm-lock.yaml`)
- A reachable backend API service

### Install & run

```bash
pnpm install

# Configure environment variables (.env is not committed)
cp .env.example .env

pnpm dev        # Dev server at http://localhost:3126
```

### Build & run locally

```bash
pnpm build      # Produces the standalone output
pnpm copy       # Copies public / .next/static into standalone (Linux/macOS only)
pnpm start      # Or: PORT=3126 node .next/standalone/server.js
```

## 🔧 Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Public origin of the site (no path). Used for SEO, sitemap, icons, etc. |
| `NEXT_PUBLIC_API_URL` | ✅ | Remote API base URL (**must include the `/api` suffix**), used by server-side code |
| `NEXT_PUBLIC_GRAVATAR_URL` | — | Avatar service URL, defaults to `https://cravatar.cn/` |
| `BACKEND_URL` | — | Development only: backend base URL for the `rewrites()` proxy (no `/api`) |
| `API_URL` | — | Production only: same as above |

The `rewrites()` backend base falls back in this order: `BACKEND_URL` (dev) / `API_URL` (prod) → `NEXT_PUBLIC_SITE_URL` → generic default. **When the backend and the site share an origin, no extra configuration is needed** — the first two variables are enough.

> ⚠️ `NEXT_PUBLIC_*` variables are inlined at **build time**, so changing them requires a rebuild (`pnpm build` or `docker compose up -d --build`).

## 🏗 Architecture

### Request flow

Because the backend does not enable CORS, browsers cannot call the remote API directly. There are two paths:

```text
Browser ──▶ local /api/* (Route Handler) ──▶ remote backend /api/*
                   (merges data, normalizes response shape)

Server Component ──▶ remote backend (direct, no CORS involved)
```

Static and media assets are proxied to the backend by `rewrites()` in `next.config.ts`:

- `/f/*` → backend file links (the backend serves these under `/api/f/`)
- `/needcache/*` → cached files
- `/static/*` → backend-uploaded images etc. (files in `public/` take precedence)

> `/api/*` is deliberately **not** in `rewrites()`, so it cannot shadow the same-origin routes under `src/app/api/*`.

### Authentication

- On successful login, `/api/auth/login` sets an **httpOnly cookie** (`token`, valid for 7 days; a `refresh_token` lasts 30 days). The client never stores a token.
- `src/proxy.ts` guards auth state: unauthenticated requests to `/admin/**` redirect to `/login`; authenticated requests to `/login` redirect to `/admin/dashboard`. It also injects an `x-pathname` header so server layouts can branch on the current path.
- When a token expires, the `(blog)` layout flags `authExpired` and a client component logs the user out silently with a notice.

## 🐳 Deployment

### Docker Compose (recommended)

`docker compose` automatically reads the `.env` in the same directory and interpolates `${VAR}`:

```bash
docker compose up -d --build
# Served at http://<host>:3126 (map the port in docker-compose.yml as needed)
```

### Docker

`.env` is not copied into the image, so browser-side variables must be injected at build time via `--build-arg`:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://blog.example.com \
  --build-arg NEXT_PUBLIC_API_URL=https://blog.example.com/api \
  -t blog-app .

docker run -d -p 3126:3126 --name blog-app blog-app
```

The image is based on `node:20-alpine`, uses a multi-stage build, runs as a non-root user, and ships the `standalone` output.

## 📜 Available Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the dev server (port 3126) |
| `pnpm build` | Production build (standalone) |
| `pnpm start` | Start the Next server |
| `pnpm lint` | Run ESLint |
| `pnpm copy` | Copy `public/` and `.next/static` into the standalone output (requires `cp`; Linux/macOS only) |
| `pnpm deploy` | Install deps → build → copy → `node .next/standalone/server.js` |

## 📄 License

This project talks to the [anzhiyu-c/anheyu-app](https://github.com/anzhiyu-c/anheyu-app) backend over HTTP, licensed under **GPL-3.0**. As a derivative work, this repository is released under the **GNU GPL v3.0** (or any compatible later version). See [LICENSE](./LICENSE).

- Any modification and redistribution must follow GPL-3.0 copyleft terms (keep the copyright notice, provide the source, and never relicense under a more permissive license).
- Assets (the AnZHiYu icon font in `public/iconfont/`, the vinyl music images, etc.) carry their own licensing terms and are not automatically redistributable along with the code; please attribute them in a NOTICE or README.
- The backend this frontend talks to is also a GPL open-source project in the Anzhiyu ecosystem.
