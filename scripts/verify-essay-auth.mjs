// 验证 /essay 页面的鉴权逻辑
const BASE = "http://localhost:3126";

// 1) 未登录 → 应 307 到 /login
{
    const res = await fetch(`${BASE}/essay`, { redirect: "manual" });
    console.log("未登录 GET /essay -> HTTP", res.status, "location:", res.headers.get("location"));
}

// 2) 假 token → 页面应检测 401 → 跳登出
{
    const res = await fetch(`${BASE}/essay`, { headers: { Cookie: "token=fake" } });
    const html = await res.text();
    console.log("假 token GET /essay -> HTTP", res.status, "| 含登出跳转:", html.includes("/api/auth/logout"));
}
