// 从本地 git 生成前端更新日志（ciraos/blogv2 是私有仓库，GitHub API 拿不到，只能本地生成后提交）。
// 用法：node scripts/gen-frontend-changelog.mjs
// 产物：src/data/frontend-changelog.json —— 每次发版（打 tag）后重跑一次，和 tag 一起提交。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const tags = git("tag", "--list", "--sort=-v:refname").split("\n").filter(Boolean);

const releases = tags.map((tag) => {
    const date = git("log", "-1", "--format=%aI", tag);
    const body = git("log", "-1", "--format=%B", tag);
    const [titleLine, ...rest] = body.split("\n");
    // 首行形如「chore(release): v1.4.0 —— 摘要」，取破折号后的摘要当标题
    const title = titleLine.includes("——") ? titleLine.split("——").slice(1).join("——").trim() : "";
    // 【小节标题】转成 Markdown 二级标题，方便渲染成小标题而不是普通段落
    const markdown = rest
        .join("\n")
        .replace(/^\s*【(.+?)】\s*$/gm, "## $1")
        .trim();

    return {
        version: tag,
        date,
        title,
        body: markdown,
        url: `https://github.com/ciraos/blogv2/releases/tag/${tag}`,
    };
});

const outFile = path.join(process.cwd(), "src", "data", "frontend-changelog.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(releases, null, 2)}\n`, "utf8");
console.log(`wrote ${releases.length} releases to ${outFile}`);
