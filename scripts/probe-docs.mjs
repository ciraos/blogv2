// 抓取文章相关接口的独立 markdown 文档
const BASE = "https://s.apifox.cn/e8218a9e-0538-443f-81bd-267a7a2f32a6";

// 接口名 -> 文档 id（来自 llms.txt 索引）
const targets = {
    "前台文章列表 /public/articles": "387222657e0",
    "单篇公开文章 /public/articles/{id}": "387222661e0",
    "首页推荐 /public/articles/home": "387222659e0",
    "归档摘要 /public/articles/archives": "387222658e0",
    "随机文章 /public/articles/random": "387222660e0",
    "后台文章列表 /articles": "387222569e0",
    "后台单篇 /articles/{id}": "387222575e0",
};

for (const [name, id] of Object.entries(targets)) {
    const res = await fetch(`${BASE}/${id}.md`);
    const text = await res.text();
    console.log(`\n################ ${name} (HTTP ${res.status}) ################`);
    console.log(text.substring(0, 5000));
}
