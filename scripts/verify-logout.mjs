// 验证登出不跳转模式
const BASE = "http://localhost:3126";

// 1) ?redirect=0 → JSON 200（不跳转，带清 cookie）
{
    const r = await fetch(`${BASE}/api/auth/logout?redirect=0`, { redirect: "manual" });
    console.log("?redirect=0 → HTTP", r.status, "| location:", r.headers.get("location"), "| set-cookie:", !!r.headers.get("set-cookie"));
}

// 2) 默认 → 307 跳登录
{
    const r = await fetch(`${BASE}/api/auth/logout`, { redirect: "manual" });
    console.log("默认 → HTTP", r.status, "| location:", r.headers.get("location"));
}
