// 把 Google Fonts 的「站酷快乐体」整套 unicode-range 分片镜像到本地 public/fonts/zcool-kuaile/，
// 并生成 src/app/zcool-kuaile.css（@import 到 globals.css）。
//
// 为什么要自托管：字体走字体 CDN 时，弱网/被墙会出现「部分字先回退系统字体」的抖动；
// 放到自己域名下（Next 静态资源，强缓存）后一次也不会跨域。
//
// 用法：node scripts/mirror-zcool-kuaile.mjs
import fs from "node:fs";
import path from "node:path";

const CSS_URL = "https://fonts.googleapis.cn/css2?family=ZCOOL+KuaiLe&display=swap";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const outDir = path.join(process.cwd(), "public", "fonts", "zcool-kuaile");
const outCss = path.join(process.cwd(), "src", "app", "zcool-kuaile.css");

fs.mkdirSync(outDir, { recursive: true });

const css = await (await fetch(CSS_URL, { headers: { "User-Agent": UA } })).text();
const urls = [...new Set([...css.matchAll(/https:\/\/fonts\.gstatic\.cn\/[^)]+\.woff2/g)].map((m) => m[0]))];
console.log("css 里发现", urls.length, "个分片");

let downloaded = 0;
let bytes = 0;
const urlMap = new Map();

for (const url of urls) {
    const fileName = url.split("/").pop();
    const dest = path.join(outDir, fileName);
    if (!fs.existsSync(dest)) {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) {
            console.warn("下载失败，跳过：", url, res.status);
            continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        downloaded++;
        bytes += buf.length;
    } else {
        bytes += fs.statSync(dest).size;
    }
    urlMap.set(url, `/fonts/zcool-kuaile/${fileName}`);
}

let localCss = css
    .replace(/\/\* [^*]*\*\//g, "")
    .replace(/https:\/\/fonts\.gstatic\.cn\/[^)]+\.woff2/g, (u) => urlMap.get(u) ?? u);

localCss = `/* 站酷快乐体（OFL）—— 由 scripts/mirror-zcool-kuaile.mjs 从 Google Fonts 镜像到本地，
   不要手改；重新生成请跑 pnpm fonts:mirror。 */
${localCss.trim()}
`;

fs.writeFileSync(outCss, localCss, "utf8");
console.log(`完成：下载 ${downloaded} 个新分片，合计 ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log("CSS 输出：", outCss);
