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

## 版本号工作流（用户偏好）

- 交付一批改动时，先判断「这轮够不够格升版本」：跨多个功能或修复、或自上个 tag 以来积累了较多提交 → 该升。
- **顺序固定：先把功能提交 push 完，再更新版本号**，不要混在同一个提交里。
  1. 提交并推送功能改动；
  2. 改 `package.json` 的 `version`（功能新增升 minor，纯修复升 patch），单独提交 `chore(release): vX.Y.Z`；
  3. 推送后再打同名 tag（`git tag vX.Y.Z && git push origin vX.Y.Z`）——
     站点 `/update` 页的前端更新日志就是读 GitHub 的 tag/release，不打 tag 就不会出现新版本。
- 升版本时可以在提交说明里写清这轮的主线（换行分段、`【小节】` 可用），它会作为该版本的更新说明展示。
