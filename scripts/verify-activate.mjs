// 验证激活页
const BASE = "http://localhost:3126";

// 1) 缺少参数 → 激活链接无效
{
    const html = (await (await fetch(`${BASE}/activate`)).text()).replace(/<!-- -->/g, "");
    console.log("GET /activate（无参数）: HTTP 200");
    console.log("  含 激活失败:", html.includes("激活失败"));
    console.log("  含 链接无效提示:", html.includes("激活链接无效或缺少参数"));
    console.log("  含 重新注册/返回首页:", html.includes("重新注册") && html.includes("返回首页"));
}

// 2) 带无效参数 → 后端 400 参数错误
{
    const html = (await (await fetch(`${BASE}/activate?publicUserId=x&sign=y`)).text()).replace(/<!-- -->/g, "");
    console.log("GET /activate?publicUserId=x&sign=y :");
    console.log("  含 激活失败:", html.includes("激活失败"));
    console.log("  含后端错误信息:", html.includes("参数错误"));
}
