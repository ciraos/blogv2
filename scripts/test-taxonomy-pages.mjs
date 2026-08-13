// 临时联调：验证归档/分类/标签页面
const BASE = "http://localhost:3126";

async function check(path, expect = []) {
    const res = await fetch(`${BASE}${path}`);
    // React 在文本节点间插入 <!-- --> 注释，比对前先剔除
    const html = (await res.text()).replace(/<!-- -->/g, "");
    const ok = expect.every((e) => html.includes(e));
    console.log(`${path.padEnd(45)} HTTP ${res.status}  ${ok ? "PASS" : "FAIL"}${ok ? "" : " 缺: " + expect.filter((e) => !html.includes(e)).join(",")}`);
}

await check("/archives", ["归档", "2026", "4 月", "1 篇"]);
await check("/archives?year=2026&month=4", ["2026 年 4 月", "C 语言基础入门", "/posts/gVrO"]);
await check("/archives?year=2025", ["2025 年", "该时间段暂无文章"]);
await check("/categories", ["全部分类", "vscode", "1 篇"]);
await check("/categories?name=vscode", ["分类：vscode", "C 语言基础入门", "/posts/gVrO"]);
await check("/categories?name=no-such", ["分类：no-such", "该分类暂无文章"]);
await check("/tags", ["全部标签", "#vscode"]);
await check("/tags?name=vscode", ["标签：# vscode", "C 语言基础入门", "/posts/gVrO"]);
await check("/tags?name=no-such", ["标签：# no-such", "该标签暂无文章"]);
