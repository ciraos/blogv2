// 临时探针：实测文章相关公开接口的真实响应
const API = "https://blog.ciraos.top/api";

async function get(path) {
    const res = await fetch(`${API}${path}`);
    const j = await res.json().catch(() => null);
    return { status: res.status, body: j };
}

// 1) 列表（拿 id / abbrlink）
const list = await get("/public/articles?page=1&pageSize=5");
console.log("== /public/articles ==");
console.log("HTTP", list.status, "code:", list.body?.code);
const items = list.body?.data?.list ?? [];
console.log("total:", list.body?.data?.total, "page:", list.body?.data?.page, "pageSize:", list.body?.data?.pageSize);
console.log("首条 id:", items[0]?.id, "| abbrlink:", items[0]?.abbrlink, "| title:", items[0]?.title);

if (items.length > 0) {
    const id = items[0].id;
    // 2) 详情：按 id
    const detail = await get(`/public/articles/${id}`);
    console.log(`\n== /public/articles/${id} ==`);
    console.log("HTTP", detail.status, "code:", detail.body?.code);
    console.log("data 顶层字段:", Object.keys(detail.body?.data ?? {}).join(","));
    const d = detail.body?.data;
    if (d) {
        console.log("title:", d.title, "| status:", d.status);
        console.log("content 字段存在:", "content" in d, "| markdown 字段:", Object.keys(d).filter(k => /content|markdown|html|raw/i.test(k)).join(","));
        console.log("content 长度:", (d.content ?? "").length);
    }
}

// 3) 首页推荐
const home = await get("/public/articles/home");
console.log("\n== /public/articles/home ==");
console.log("HTTP", home.status, "code:", home.body?.code, "| data 类型:", Array.isArray(home.body?.data) ? "array" : typeof home.body?.data, "| 条数:", Array.isArray(home.body?.data) ? home.body.data.length : "-");

// 4) 归档
const archives = await get("/public/articles/archives");
console.log("\n== /public/articles/archives ==");
console.log("HTTP", archives.status, "code:", archives.body?.code, "| data 类型:", Array.isArray(archives.body?.data) ? "array" : typeof archives.body?.data);
console.log("data 预览:", JSON.stringify(archives.body?.data ?? null).substring(0, 400));

// 5) 列表参数探测：keyword / category / tag
const kw = await get("/public/articles?page=1&pageSize=10&keyword=C");
console.log("\n== /public/articles?keyword=C ==", "HTTP", kw.status, "code:", kw.body?.code, "total:", kw.body?.data?.total);
