// 验证注册页昵称字段与本地路由校验
const BASE = "http://localhost:3126";

// 1) 页面含昵称输入框
{
    const html = (await (await fetch(`${BASE}/register`)).text()).replace(/<!-- -->/g, "");
    console.log("注册页含昵称输入:", html.includes("怎么称呼你？"));
}

// 2) 本地路由：缺昵称 → 400
async function post(body) {
    const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    console.log("  ->", res.status, JSON.stringify(j?.message));
}
console.log("== /api/auth/register 昵称校验 ==");
await post({ email: "a@b.com", password: "123456", repeat_password: "123456" }); // 缺昵称
await post({ nickname: "小明", email: "a@b.com", password: "123456", repeat_password: "123456" }); // 带昵称（会转发到远端）
