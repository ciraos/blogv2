#!/usr/bin/env node
/**
 * 校验「package.json / workflow 里引用的脚本文件是否真的存在」。
 *
 * 为什么需要：`.gitignore` 把 `/scripts/*` 整片忽略（里面还有几百 MB 的后端源码快照和
 * 300 多个一次性探测脚本）。一旦 CI 要用的脚本被忽略、没提交，CI 会在
 *
 *   node: Cannot find module '.../scripts/gen-api-inventory.mjs'
 *
 * 这种**和本次改动毫无关系**的地方红掉，而且报错信息完全看不出是「文件没进版本库」。
 * 2026-11-22 的 checks 就是连续挂在这个坑上。
 *
 * 约定：需要进库的脚本放 `scripts/ci/`（.gitignore 已放行该目录），其余继续忽略。
 * 本脚本在 CI 里跑，引用到仓库外的脚本会立刻失败并指明是哪个命令。
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const problems = [];

/** 从一条命令里抽出「node 后面跟的本地产物路径」 */
function scriptPathsOf(command) {
    const out = [];
    // node [--flag ...] <path>   （忽略 -e/-p 这种内联执行的）
    const re = /\bnode\s+((?:--?[\w-]+(?:=\S+)?\s+)*)([^\s"'|&;]+)/g;
    let m;
    while ((m = re.exec(command))) {
        const target = m[2];
        if (target.startsWith("-")) continue;
        if (!/\.(mjs|cjs|js|ts)$/.test(target)) continue;
        out.push(target);
    }
    return out;
}

function check(where, command) {
    for (const rel of scriptPathsOf(command)) {
        // 构建产物 / 依赖目录不是「仓库里的脚本」，跑之前自然不存在，跳过
        if (/^(\.next|node_modules|dist|out)\//.test(rel)) continue;
        if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) {
            problems.push(`${where}: 使用了绝对路径 ${rel}（CI 上必然找不到）`);
            continue;
        }
        if (!fs.existsSync(path.join(ROOT, rel))) {
            problems.push(
                `${where}: 引用的脚本不存在 → ${rel}\n` +
                    `    若它是 CI 需要的，请移动到 scripts/ci/ 后再提交（.gitignore 只放行该目录）`
            );
        }
    }
}

/* 1. package.json 的 scripts */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (typeof command === "string") check(`package.json → ${name}`, command);
}

/* 2. workflow 里直接 run 的命令 */
const wfDir = path.join(ROOT, ".github", "workflows");
if (fs.existsSync(wfDir)) {
    for (const file of fs.readdirSync(wfDir)) {
        if (!/\.ya?ml$/.test(file)) continue;
        const lines = fs.readFileSync(path.join(wfDir, file), "utf8").split("\n");
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return;
            // 只认真实执行的行（run: 之后 / 续行块里的命令）
            check(`${file}:${index + 1}`, trimmed);
        });
    }
}

if (problems.length) {
    console.error(`✗ 有 ${problems.length} 处脚本引用不存在：`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}
console.log("✓ 所有被引用的脚本都存在（package.json + workflows）");
