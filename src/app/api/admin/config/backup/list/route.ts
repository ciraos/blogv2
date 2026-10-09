import { adminProxyFetch } from "@/lib/admin-api";

// 配置备份列表：GET 转发到远端 /config/backup/list（router.go:883，需管理员登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 响应形状 { code, message, data: BackupInfo[] }（无分页）：
// 每项字段 filename / size / created_at / description / is_auto（backup_service.go:22-28）。
export async function GET() {
    return adminProxyFetch("/config/backup/list", { method: "GET" });
}
