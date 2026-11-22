#!/usr/bin/env node
/**
 * 一条命令把当前分支（以及可选 tag）同时推到 GitHub 和 CNB。
 *
 * 为什么不直接在 git config 里配两个 pushurl：
 *   CNB **不支持 SSH**（官方文档明确：只提供 HTTPS + 令牌），而 GitHub 这边用的是
 *   SSH remote。两个 remote 认证方式不同，pushurl 混在一起没法统一加凭据。
 *
 * 用法：
 *   node scripts/ci/push-all.mjs                 # 推当前分支到两个远端
 *   node scripts/ci/push-all.mjs --tag v1.8.4    # 顺带推这个 tag（CNB 上会触发打包流水线）
 *   node scripts/ci/push-all.mjs --only cnb      # 只推一个
 *
 * 凭据：
 *   CNB_TOKEN   —— CNB 访问令牌（仓库设置 → 访问令牌，需要 repo 读写权限）
 *                  没设置时 CNB 那一步会被跳过，不会让整个命令失败
 *   GitHub 走本机已有的 SSH key，不需要额外变量
 *
 * 令牌不会写进 .git/config，也不会进 url（只作为本次 push 的临时 URL 参数）。
 */

import { execFileSync } from "node:child_process";

const CNB_HOST = "https://cnb.cool";
const CNB_REPO = "ciraos.top/demoblog-ciraos"; // 只在这里改仓库路径
const CNB_USER = "cnb"; // CNB 的 git 用户名固定为 cnb，密码才是令牌

const args = process.argv.slice(2);
const tagFlag = args.indexOf("--tag");
const tag = tagFlag >= 0 ? args[tagFlag + 1] : "";
const onlyFlag = args.indexOf("--only");
const only = onlyFlag >= 0 ? args[onlyFlag + 1] : "";

const git = (gitArgs, options = {}) =>
    execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
const token = (process.env.CNB_TOKEN ?? "").trim();

const results = [];

function run(label, gitArgs) {
    process.stdout.write(`\n▶ ${label}\n`);
    try {
        const out = execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        process.stdout.write(out || "  (无输出)\n");
        results.push({ label, ok: true });
    } catch (error) {
        const stderr = error.stderr?.toString?.() ?? String(error);
        process.stderr.write(`  ✗ 失败：${stderr.split("\n").filter(Boolean).slice(-3).join("\n  ")}\n`);
        results.push({ label, ok: false });
    }
}

/* 1. GitHub（SSH，走本机 key） */
if (only !== "cnb") {
    run(`GitHub  ${branch}`, ["push", "origin", branch]);
    if (tag) run(`GitHub  tag ${tag}`, ["push", "origin", tag]);
}

/* 2. CNB（HTTPS + 令牌） */
if (only !== "origin") {
    if (!token) {
        process.stdout.write("\n⚠ 没设置 CNB_TOKEN，跳过 CNB。设置后再跑：\n");
        process.stdout.write('  $env:CNB_TOKEN = "你的访问令牌"   # PowerShell\n');
        process.stdout.write("  node scripts/ci/push-all.mjs\n");
        results.push({ label: "CNB", ok: null, skipped: true });
    } else {
        const url = `https://${CNB_USER}:${encodeURIComponent(token)}@${CNB_HOST.replace(/^https:\/\//, "")}/${CNB_REPO}.git`;
        run(`CNB     ${branch}`, ["push", url, `refs/heads/${branch}:refs/heads/${branch}`]);
        if (tag) run(`CNB     tag ${tag}`, ["push", url, `refs/tags/${tag}:refs/tags/${tag}`]);
    }
}

/* 3. 汇总 */
process.stdout.write("\n──────── 结果 ────────\n");
for (const r of results) {
    const mark = r.skipped ? "跳过" : r.ok ? "成功" : "失败";
    process.stdout.write(`  ${mark}  ${r.label}\n`);
}
process.exit(results.some((r) => r.ok === false) ? 1 : 0);
