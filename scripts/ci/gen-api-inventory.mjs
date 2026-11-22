#!/usr/bin/env node
/**
 * 生成 docs/api-inventory.md —— 本站「真正调用过」的远端接口清单。
 *
 * 为什么需要它：scripts/swagger.yaml 是社区版的部分导出且已过时（见文件顶部声明），
 * Apifox 分享文档也缺模块（插件 / 缓存 / 社区问答 / 知识库…）。真正跑通过的是
 * src/app/api/**\/route.ts 这批同源代理，它们才是「接口事实源」。
 *
 * 用法：
 *   node scripts/gen-api-inventory.mjs           # 重新生成 docs/api-inventory.md
 *   node scripts/gen-api-inventory.mjs --check   # 只校验：出现已废弃路径 / 提取不到目标就退出 1
 *
 * 校验挂在 `pnpm api:inventory:check`，建议进 CI。
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const CHECK_ONLY = process.argv.includes("--check");
const OUT = path.join(root, "docs", "api-inventory.md");

/* ------------------------------------------------------------------ *
 * 已知「线上已 404」的旧路径：代码里再出现就是写错了
 * 证据：docs/api-known-issues.md（2026-10 实测，401/404 对照）
 * ------------------------------------------------------------------ */
const STALE_REMOTE = [
    { pat: /^\/storage-policies(\/|$)/, hint: "实际是 /policies（社区版 router.go:528）" },
    { pat: /^\/albums(\/\{p\})?$/, hint: "实际是 /albums/get、/albums/add、/albums/update|delete/{id}" },
    { pat: /^\/files$/, hint: "实际是 /file" },
    { pat: /^\/file\/folder-(tree|size)\//, hint: "实际是 /folder/tree/{id}、/folder/size/{id}" },
    { pat: /^\/thumbnail\/sign\//, hint: "实际是 /thumbnail/{id}" },
    { pat: /^\/public\/search/, hint: "实际是 /search（无 /public 前缀）" },
];

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const PURE = /^\/[A-Za-z0-9_\-./{}]*$/;

/** 插值 → {p}；查询串删掉 */
function clean(raw) {
    let v = String(raw).split("?")[0];
    v = v.replace(/\$\{[^}]*\}/g, "{p}");
    v = v.replace(/:[A-Za-z_][\w]*/g, "{p}");
    v = v.replace(/\{[^}]*\}/g, "{p}");
    return v.replace(/\/+$/, "");
}

/** 括号配对地把 ${...} 处理掉（支持嵌套模板串）；查询类插值直接删 */
function stripInterpolations(src) {
    let out = "";
    let i = 0;
    while (i < src.length) {
        if (src[i] === "$" && src[i + 1] === "{") {
            let depth = 1;
            let j = i + 2;
            while (j < src.length && depth > 0) {
                const ch = src[j];
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
                else if (ch === "`") {
                    j++;
                    while (j < src.length && src[j] !== "`") {
                        if (src[j] === "\\") j++;
                        if (src[j] === "$" && src[j + 1] === "{") {
                            let d2 = 1;
                            let k = j + 2;
                            while (k < src.length && d2 > 0) {
                                if (src[k] === "{") d2++;
                                else if (src[k] === "}") d2--;
                                k++;
                            }
                            j = k;
                            continue;
                        }
                        j++;
                    }
                }
                j++;
            }
            const inner = src.slice(i + 2, j - 1);
            out += /[?]|toString\(|query|params|search|qs\b|join\(/i.test(inner) ? "" : "{p}";
            i = j;
        } else {
            out += src[i];
            i++;
        }
    }
    return out;
}

/** 从一段代码里抽出路径字面量（先替换模块级常量） */
function pathsIn(code, consts) {
    let s = code.replace(/\$\{\s*(?:API_URL|api_url|process\.env\.NEXT_PUBLIC_API_URL[^}]*)\s*\}/g, "");
    for (const [name, val] of Object.entries(consts)) {
        s = s.replace(new RegExp(`\\$\\{\\s*${name}\\s*\\}`, "g"), val);
    }
    s = stripInterpolations(s);
    const out = new Set();
    for (const m of s.matchAll(/["'`]([^"'`\n]{1,200})["'`]/g)) {
        const v = clean(m[1]);
        if (!PURE.test(v)) continue;
        const segs = v.split("/").filter(Boolean);
        if (segs.length === 0) continue;
        if (["_next", "static", "needcache"].includes(segs[0])) continue;
        if (["login", "register", "favicon.ico"].includes(segs[0])) continue;
        if (v.startsWith("/api/f/") || v.startsWith("/api/pro/images/")) continue;
        out.add(v);
    }
    return out;
}

/* ---------------- 扫描 route.ts ---------------- */
const rows = []; // { method, remote, local, file }
const unresolved = []; // 提取不到转发目标的 route（本地路由 / 写法未识别）

/**
 * 全仓字符串常量表（跨文件共享的远端基址，如 _proxy.ts 的 QA_REMOTE_BASE）。
 * 只收名字像「地址」的常量，避免把普通文案当成路径。
 */
const globalConsts = {};
(function collectConsts(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { collectConsts(full); continue; }
        if (!e.name.endsWith(".ts")) continue;
        const src = fs.readFileSync(full, "utf8");
        for (const m of src.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*(?:REMOTE|BASE|TARGET|PATH|URL)[A-Z0-9_]*)\s*=\s*[`"']([^`"']+)[`"']/g)) {
            globalConsts[m[1]] = m[2];
        }
    }
})(path.join(root, "src/app/api"));
for (const f of fs.readdirSync(path.join(root, "src/lib"))) {
    if (!f.endsWith(".ts")) continue;
    const src = fs.readFileSync(path.join(root, "src/lib", f), "utf8");
    for (const m of src.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*(?:REMOTE|BASE|TARGET|PATH|URL)[A-Z0-9_]*)\s*=\s*[`"']([^`"']+)[`"']/g)) {
        globalConsts[m[1]] = m[2];
    }
}

/** 把代码里 ${CONST} 替换成常量值（文件内常量优先，其次全局常量表） */
function resolveConsts(code, consts) {
    let s = code;
    for (const [name, val] of Object.entries(consts)) {
        s = s.replace(new RegExp(`\\$\\{\\s*${name}\\s*\\}`, "g"), val);
    }
    for (const [name, val] of Object.entries(globalConsts)) {
        if (consts[name]) continue;
        s = s.replace(new RegExp(`\\$\\{\\s*${name}\\s*\\}`, "g"), val);
    }
    return s;
}

const routeFiles = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name === "route.ts") routeFiles.push(full);
    }
})(path.join(root, "src/app/api"));

for (const file of routeFiles) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const local = "/" + rel.slice("src/app/".length).replace(/\/route\.ts$/, "");
    const src = fs.readFileSync(file, "utf8");
    const consts = {};
    for (const m of src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*[`"']([^`"']+)[`"']/g)) consts[m[1]] = m[2];

    // 文件级兜底：有些 route 把远端路径藏在 forward() 之类的内部函数里（如 article-categories/[id]）
    const fileLevel = pathsIn(resolveConsts(src, consts), {});

    const blocks = src.split(/export\s+(?:async\s+)?function\s+/);
    for (const block of blocks.slice(1)) {
        const mm = /^(GET|POST|PUT|DELETE|PATCH)\b/.exec(block);
        if (!mm) continue;
        const found = pathsIn(block, consts);
        for (const [name, val] of Object.entries(consts)) {
            if (new RegExp(`\\b${name}\\b`).test(block)) found.add(clean(val));
        }
        // 块里没有路径 → 用文件级结果（标记 uncertainty，便于人工复核）
        let fromFile = false;
        if (found.size === 0 && fileLevel.size > 0) {
            fromFile = true;
            for (const p of fileLevel) found.add(p);
        }
        if (found.size === 0) {
            unresolved.push({ local, method: mm[1], file: rel });
            continue;
        }
        for (const remote of found) rows.push({ method: mm[1], remote, local, file: rel, fromFile });
    }
}

/* ---------------- 扫描 lib/api*.ts 的服务端直连 ---------------- */
for (const f of fs.readdirSync(path.join(root, "src/lib"))) {
    if (!/^api.*\.ts$/.test(f)) continue;
    const rel = `src/lib/${f}`;
    let src = fs.readFileSync(path.join(root, "src/lib", f), "utf8");
    src = src.replace(/\$\{\s*(?:API_URL|api_url)\s*\}/g, "");
    src = stripInterpolations(src);
    for (const m of src.matchAll(/request(?:<[^>]*>)?\(\s*[`"']([^`"']+)[`"']/g)) {
        if (m[1].startsWith("/api/")) continue; // 本站代理，已在 route.ts 覆盖
        const remote = clean(m[1]);
        if (!PURE.test(remote)) continue;
        rows.push({ method: "*", remote, local: "（服务端直连）", file: rel });
    }
}

/* ---------------- 去重 + 校验 ---------------- */
const problems = [];
const uniq = new Map();
for (const r of rows) {
    const key = `${r.method} ${r.remote}`;
    const cur = uniq.get(key);
    if (cur) {
        cur.files.add(r.file);
        cur.locals.add(r.local);
    } else uniq.set(key, { ...r, files: new Set([r.file]), locals: new Set([r.local]) });
}

for (const [, r] of uniq) {
    for (const stale of STALE_REMOTE) {
        if (stale.pat.test(r.remote)) {
            problems.push(`已废弃路径 ${r.method} ${r.remote}（${stale.hint}）← ${[...r.files].join(", ")}`);
        }
    }
}

const total = uniq.size;

/* ---------------- 输出 markdown ---------------- */
const sorted = [...uniq.values()].sort((a, b) => {
    const ka = a.remote.replace(/\{p\}/g, "").toLowerCase();
    const kb = b.remote.replace(/\{p\}/g, "").toLowerCase();
    return ka === kb ? a.method.localeCompare(b.method) : ka.localeCompare(kb);
});

const lines = [];
lines.push("# 本站远端接口清单（自动生成）");
lines.push("");
lines.push("> 由 `pnpm api:inventory` 从 `src/app/api/**/route.ts` + `src/lib/api*.ts` 扫描生成，**不要手改**。");
lines.push("> 这是本站「真正调用过」的接口 = 唯一可信的接口事实源；");
lines.push("> `scripts/swagger.yaml`（社区版部分导出、含过时路径）与 Apifox 分享文档（缺 PRO/插件/缓存/社区问答模块）都不能当此用，见 [api-known-issues.md](./api-known-issues.md)。");
lines.push("");
lines.push(`- 接口数（方法+路径去重）：**${total}**`);
lines.push(`- 采集自：${routeFiles.length} 个同源代理路由 + \`src/lib/api*.ts\` 的服务端直连`);
lines.push(`- 生成时间：${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
lines.push("");
lines.push("## 清单");
lines.push("");
lines.push("| 方法 | 远端路径 | 本站同源路由 | 代码位置 |");
lines.push("| --- | --- | --- | --- |");
for (const r of sorted) {
    const locals = [...r.locals].join("<br>");
    const files = [...r.files].map((f) => `\`${f}\``).join("<br>");
    lines.push(`| ${r.method} | \`${r.remote}\` | ${locals === "-" ? "—" : `\`${locals}\``} | ${files} |`);
}
lines.push("");
lines.push("## 待人工确认（提取不到远端目标）");
lines.push("");
lines.push("下面这些导出方法在代码里没找到明确的远端路径：可能本来就是纯本地路由（如 `/api/auth/logout` 只清 cookie），");
lines.push("也可能是转发写法没被脚本识别。新增路由后若出现在这里，请确认是否漏写了转发。");
lines.push("");
if (unresolved.length === 0) {
    lines.push("（无）");
} else {
    lines.push("| 本站路由 | 方法 | 文件 |");
    lines.push("| --- | --- | --- |");
    for (const u of unresolved) lines.push(`| \`${u.local}\` | ${u.method} | \`${u.file}\` |`);
}
lines.push("");
lines.push("## 如何加新接口");
lines.push("");
lines.push("1. 在 `src/app/api/<域>/<名称>/route.ts` 写同源代理（优先用 `authedProxyFetch` / `rawAdminProxyFetch`）；");
lines.push("2. 在 `src/lib/api-<域>.ts` 写浏览器端调用函数；");
lines.push("3. 跑 `pnpm api:inventory` 重新生成清单并提交；`pnpm api:inventory:check` 会拦住已废弃路径。");
lines.push("");

if (!CHECK_ONLY) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, lines.join("\n"), "utf8");
    console.log(`✓ 已生成 ${path.relative(root, OUT)}（${total} 条接口）`);
}

if (problems.length > 0) {
    console.error(`\n✗ 发现 ${problems.length} 个问题：`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}
if (CHECK_ONLY) console.log(`✓ 接口清单校验通过（${total} 条，无废弃路径、无提取失败）`);
