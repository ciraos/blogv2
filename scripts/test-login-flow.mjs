// 临时联调脚本：验证本地登录路由与鉴权链路
const BASE = "http://localhost:3126";

async function postLogin(payload) {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "manual",
    });
    const json = await res.json().catch(() => null);
    const setCookie = res.headers.get("set-cookie");
    console.log("POST /api/auth/login", JSON.stringify(payload), "-> HTTP", res.status,
        "| body:", JSON.stringify(json), "| set-cookie:", setCookie ? "YES" : "NO");
}

// 1) 错误凭据
await postLogin({ email: "no-such-user@test.com", password: "wrong" });
// 2) 缺字段
await postLogin({ email: "" });
await postLogin({});
// 3) 未登录访问 /admin/dashboard（应 307 到 /login）
{
    const res = await fetch(`${BASE}/admin/dashboard`, { redirect: "manual" });
    console.log("GET /admin/dashboard (no token) -> HTTP", res.status, "location:", res.headers.get("location"));
}
// 4) /login 页面
{
    const res = await fetch(`${BASE}/login`);
    const html = await res.text();
    console.log("GET /login -> HTTP", res.status, "| 含表单:", html.includes('id="email"') && html.includes("登 录"));
}
