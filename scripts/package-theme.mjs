#!/usr/bin/env node
/**
 * 把本项目打成 Anheyu 主题市场的「SSR 主题」包（tar.gz）。
 *
 * 规范来源（文档 + 后端代码）：
 *  · 官方 dev.anheyu.com/docs/theme-development
 *  · pkg/ssr/manager.go：Install() 下载 tar.gz → extractTarGz 解压到 themes/<themeName>/
 *    · 每解压一个条目会**剥掉第一段路径**（"./server.js" → "server.js"），所以包内顶层必须是 "."
 *    · extractTarGz 只支持 TypeDir / TypeReg —— 遇到**符号链接直接报错**
 *      线上报错原文：`不支持的归档文件类型: ./node_modules/next`
 *
 * 因此打包前必须把 pnpm 的软链实体化（dereference）。这一步要求文件系统允许**读取**软链，
 * 而 Windows 上 Next 连创建 standalone 都会 EPERM（next.config.ts 有长篇注释），
 * 所以**请在 Linux / CI 上打包**，Windows 只用于开发调试。
 *
 * 用法：
 *   pnpm theme:package             # 用 .next/standalone 打包
 *   pnpm theme:package -- --zip    # 额外产出一份 .zip（仅供分发预览）
 *   pnpm theme:package -- --keep   # 保留 dist/<name>-<version>/ 暂存目录，便于排查
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const THEME_JSON = path.join(ROOT, "theme.json");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const DIST = path.join(ROOT, "dist");

const LIMITS = { maxCompressedMB: 256, maxExtractedMB: 512, maxEntries: 10000, maxFileMB: 100 };

const args = new Set(process.argv.slice(2));
const alsoZip = args.has("--zip");
const keepStage = args.has("--keep");

const fail = (message) => {
    console.error(`✗ ${message}`);
    process.exit(1);
};
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

/* ---------- 1. 校验 theme.json（对齐后端 validateThemeMetadata） ---------- */
if (!fs.existsSync(THEME_JSON)) fail("缺少 theme.json");

let theme;
try {
    theme = JSON.parse(fs.readFileSync(THEME_JSON, "utf8"));
} catch (error) {
    fail(`theme.json 不是合法 JSON：${error.message}`);
}

const errors = [];
if (!/^theme-[a-z0-9-]+$/.test(theme.name ?? "")) errors.push("name 必须以 theme- 开头，且只含小写字母/数字/连字符");
if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9-.]+)?$/.test(theme.version ?? "")) errors.push("version 必须是语义化版本，如 1.0.0");
for (const key of ["displayName", "description"]) {
    if (!theme[key] || String(theme[key]).trim() === "") errors.push(`${key} 不能为空`);
}
if (!theme.author) errors.push("author 不能为空");
if (theme.renderMode !== "ssr") errors.push('SSR 主题必须声明 "renderMode": "ssr"');
if (Number(theme.engineVersion) < 2) errors.push('"engineVersion" 应为 2');
if (errors.length) fail(`theme.json 校验失败：\n  - ${errors.join("\n  - ")}`);

/* ---------- 2. 检查 standalone ---------- */
if (!fs.existsSync(path.join(STANDALONE, "server.js"))) {
    fail(
        [
            "找不到 .next/standalone/server.js。",
            "",
            "在 Linux / CI 上执行（Windows 会因为无法创建符号链接而失败）：",
            "  NEXT_SKIP_STANDALONE=0 pnpm build && pnpm theme:package",
            "",
            "Windows 用户：请用仓库里的 GitHub Actions（.github/workflows/theme-package.yml），",
            "推一个 tag 就会自动构建并上传 tar.gz 到 Release。",
        ].join("\n")
    );
}

/* ---------- 3. 解引用复制到暂存目录（关键：不能有任何软链） ---------- */
const stageName = `${theme.name}-${theme.version}`;
const stage = path.join(DIST, stageName);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

const SKIP_NAMES = new Set([".env", ".env.local", ".env.production", ".env.development", "cache", ".bin"]);
/** 运行时用不到的文件后缀：source map 又多又大 */
const SKIP_SUFFIXES = [".map"];
let fileCount = 0;
let byteCount = 0;
let biggest = { name: "", size: 0 };
/** 当前递归链上的真实目录（只用于阻断 a→b→a 这类环，不做全局去重） */
const ancestorDirs = new Set();

/** 把 src 的「真实内容」复制到 dest；src 是软链时先解引用再复制 */
function copyReal(src, dest) {
    const stat = fs.lstatSync(src);
    if (stat.isSymbolicLink()) {
        const target = path.resolve(path.dirname(src), fs.readlinkSync(src));
        copyReal(target, dest);
        return;
    }
    if (stat.isDirectory()) {
        const real = fs.realpathSync(src);
        if (ancestorDirs.has(real)) return; // 环：同一条链上重复出现，跳过以免无限递归
        ancestorDirs.add(real);
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            if (SKIP_NAMES.has(entry)) continue;
            if (SKIP_SUFFIXES.some((suffix) => entry.endsWith(suffix))) continue;
            copyReal(path.join(src, entry), path.join(dest, entry));
        }
        ancestorDirs.delete(real);
        return;
    }
    fileCount += 1;
    byteCount += stat.size;
    if (stat.size > biggest.size) biggest = { name: dest.replace(stage, ""), size: stat.size };
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

copyReal(STANDALONE, stage);

// ⚠️ Next 的 standalone **不含** .next/static（前端 JS/CSS chunk）和 public（图片/字体）：
// 少了它们 HTML 能出、但所有静态资源 404，页面会白屏。必须从项目根补进来。
const STATIC_SRC = path.join(ROOT, ".next", "static");
const STATIC_DEST = path.join(stage, ".next", "static");
if (fs.existsSync(STATIC_SRC)) {
    copyReal(STATIC_SRC, STATIC_DEST);
    console.log("  补入 .next/static");
} else {
    fail("找不到 .next/static（构建产物不完整）");
}

const PUBLIC_SRC = path.join(ROOT, "public");
const PUBLIC_DEST = path.join(stage, "public");
if (fs.existsSync(PUBLIC_SRC)) {
    copyReal(PUBLIC_SRC, PUBLIC_DEST);
    console.log("  补入 public");
}

// theme.json 必须在包根（后端 themes/<name>/theme.json 就是读设置的地方）
fs.copyFileSync(THEME_JSON, path.join(stage, "theme.json"));

/* ---------- 4. 自检：暂存目录里不允许有软链 ---------- */
const symlinks = [];
(function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
            symlinks.push(p.replace(stage, ""));
            continue;
        }
        if (entry.isDirectory()) scan(p);
    }
})(stage);

if (symlinks.length) {
    fail(
        [
            `暂存目录里还有 ${symlinks.length} 个符号链接，后端解压时会报「不支持的归档文件类型」：`,
            ...symlinks.slice(0, 5).map((p) => `  ${p}`),
            "",
            "这说明解引用阶段没生效（常见于在 Windows 上跑：读取软链目标会 EPERM）。",
        ].join("\n")
    );
}

console.log(`  解引用完成：${fileCount} 个文件 / ${mb(byteCount)}MB / 残留软链 ${symlinks.length} 个`);
if (fileCount > LIMITS.maxEntries) fail(`条目数 ${fileCount} 超过上限 ${LIMITS.maxEntries}`);
if (byteCount / 1024 / 1024 > LIMITS.maxExtractedMB) fail(`解压后 ${mb(byteCount)}MB 超过 ${LIMITS.maxExtractedMB}MB`);
if (biggest.size / 1024 / 1024 > LIMITS.maxFileMB) fail(`单文件 ${biggest.name} 有 ${mb(biggest.size)}MB，超过 ${LIMITS.maxFileMB}MB`);

/* ---------- 5. 产物完整性硬校验（HTML 能开 ≠ 能用） ---------- */
for (const required of ["server.js", "theme.json", ".next", path.join(".next", "static"), "node_modules"]) {
    if (!fs.existsSync(path.join(stage, required))) {
        fail(`打包产物缺少 ${required}：装上后前端资源会 404`);
    }
}
if (!fs.existsSync(path.join(stage, ".next", "static", "chunks"))) {
    fail("打包产物缺少 .next/static/chunks：JS 分包没进包");
}

/* ---------- 6. 打包（-C stage . → 条目都以 ./ 开头，符合后端剥前缀逻辑） ---------- */
fs.mkdirSync(DIST, { recursive: true });
const tarPath = path.join(DIST, `${stageName}.tar.gz`);
fs.rmSync(tarPath, { force: true });
execFileSync("tar", ["-czf", tarPath, "-C", stage, "."], { stdio: "inherit" });

const tarSize = fs.statSync(tarPath).size;
if (tarSize / 1024 / 1024 > LIMITS.maxCompressedMB) fail(`压缩包 ${mb(tarSize)}MB 超过 ${LIMITS.maxCompressedMB}MB`);

let zipName = "";
if (alsoZip) {
    zipName = `${stageName}.zip`;
    const zipPath = path.join(DIST, zipName);
    fs.rmSync(zipPath, { force: true });
    execFileSync("tar", ["-a", "-c", "-f", zipPath, "-C", stage, "."], { stdio: "inherit" });
}

if (!keepStage) fs.rmSync(stage, { recursive: true, force: true });

/* ---------- 7. 汇报 ---------- */
console.log("");
console.log(`✓ dist/${stageName}.tar.gz`);
console.log(`  名称 ${theme.name}  (${theme.displayName})  v${theme.version}  SSR 内核 v${theme.engineVersion}`);
console.log(`  解压 ${mb(byteCount)}MB / ${fileCount} 个文件   压缩 ${mb(tarSize)}MB   无软链 ✓`);
console.log(`  最大文件 ${biggest.name} (${mb(biggest.size)}MB)`);
if (zipName) console.log(`  另存 dist/${zipName}（仅供分发预览）`);
console.log("");
console.log("安装（SSR 主题）：");
console.log(`  { "themeName": "${theme.name}", "version": "${theme.version}", "downloadUrl": "<公网直链>" }`);
console.log("  直链自检：curl -s <url> | head -c 2 | xxd   → 期望 1f 8b");
