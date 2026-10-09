import { redirect } from "next/navigation";

/**
 * /admin 根路径：照官方 app/admin/page.tsx 直接重定向到仪表盘。
 * 之前没有这个文件，访问 /admin 会 404（侧边栏等处都是直接链到 /admin/xxx，所以只在手输地址时暴露）。
 */
export default function AdminIndex() {
    redirect("/admin/dashboard");
}
