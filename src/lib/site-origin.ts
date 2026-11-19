/**
 * 「站点绝对地址」的最后兜底：SITE_URL 与环境变量都取不到时用它（SEO 的 sitemap / RSS 需要
 * 绝对地址，不能留空）。
 *
 * 端口**不在代码里另写一份**：next.config.ts 构建时从 package.json 的 `dev` 脚本
 * （`next dev -p 3126`）解析出端口、注入成 `APP_DEV_PORT`，这里只读注入值；
 * 只有注入值缺失（例如单独跑了某个脚本）才退回 3126。想换端口改 package.json 的 `-p` 即可。
 */
export function localSiteOrigin(): string {
    const port = (process.env.APP_DEV_PORT ?? "").trim() || "3126";
    return `http://localhost:${port}`;
}
