// 验证朋友圈抓取代理路由
// 1. 状态路由（无 cookie → 401 JSON）
const s1 = await fetch("http://localhost:3126/api/admin/moments/fetch/status");
let s1body = "not json";
try { s1body = JSON.stringify(await s1.json()); } catch {}
console.log("GET status (no cookie):", s1.status, s1body);

// 2. 触发路由（无 cookie → 401 JSON）
const s2 = await fetch("http://localhost:3126/api/admin/moments/fetch", { method: "POST" });
let s2body = "not json";
try { s2body = JSON.stringify(await s2.json()); } catch {}
console.log("POST trigger (no cookie):", s2.status, s2body);
