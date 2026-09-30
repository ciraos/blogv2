<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 本地开发工作流（用户偏好）

- 启动 dev server 时**直接打开**开发页面，不要询问。
  - 用 `http://localhost:3126/`（**不要**用 `127.0.0.1`，dev 资源会被 `allowedDevOrigins` 拦截导致页面不水合）。
- 以"停止 dev server"结尾的流水线（lint / build / 提交等）跑完后，**不要**自动重启 dev。
- 改动完成后**不要**自动跑 `lint` / `build`（`tsc` 同理）：只有明确说了"跑 lint""build""提交"这类指令时才跑。
  - 日常改完只在浏览器里（`localhost:3126`）自测效果，汇报保持简短，不要每次都附一大串检查报告。
