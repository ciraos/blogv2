// 同源代理的客户端信息透传 helper（浏览器 → 本应用 Route Handler → 后端 API）。
//
// 为什么需要它：后端在创建评论时，会从**请求本身**推断三项元信息 ——
// 「位置」来自客户端 IP 查归属地，「操作系统与版本 / 浏览器」来自 User-Agent 解析
// （swagger 的 dto.CreateRequest 里只有 content/nickname/email/... 等业务字段，
//  没有 ip/os/browser，见 scripts/swagger.yaml 的 /public/comments POST）。
// 也就是说：代理若不转发这两个头，后端拿到的只有「Next.js 服务器自身的 IP」和
// 「服务端 fetch 客户端的 UA（undici/node 之类）」，解析结果只能是「未知」。
import type { NextRequest } from "next/server";

/**
 * 取访客 IP：优先入站 `x-forwarded-for` 的第一段（最靠近客户端的一段），
 * 退化到 `x-real-ip`；都取不到返回 null（调用方据此**不写该头**，避免出现字面量 "undefined"）。
 *
 * 实测注意（Next.js 自身行为）：入站请求若**没有** XFF，Next 服务器会用连接源 IP 补上一条
 * （本地开发即 `x-forwarded-for: ::1`）；若已有 XFF 则原样透传、不追加。
 * 所以出站时首个可用的 IP 一般来自入站 XFF。已知的例外：反代只设 `X-Real-IP` 而不设 XFF 时，
 * 入站 XFF 会是反代自己的地址（如 127.0.0.1），此时应以 `X-Real-IP` 为准 —— 若线上归属地仍为「未知」，
 * 优先排查这一点（把反代改成同时设置 `X-Forwarded-For $proxy_add_x_forwarded_for`）。
 *
 * ⚠️ 安全前提：`x-forwarded-for` / `x-real-ip` 都是普通请求头，**客户端可以随便伪造**。
 * 只有当本站前面有一层**可信反向代理**（Nginx / CDN / 平台网关，且由它覆写这两个头）时，
 * 这里取到的才是真实客户端 IP。本站直连公网、或本地 `localhost` 开发时，该值不可信。
 * 因此：
 *   1. 只把它当作「展示用元信息」透传，绝不用它做鉴权、限流、风控等安全判断；
 *   2. 后端同样只应用于归属地展示，不作为安全边界；
 *   3. 若未来要把它用于安全场景，必须先在本应用侧（或反代侧）校验来源可信度并覆写该头。
 */
function clientIp(request: NextRequest): string | null {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
    }
    const realIp = request.headers.get("x-real-ip")?.trim();
    return realIp || null;
}

/**
 * 构造要转发给后端的「客户端信息」请求头（不含业务头，调用方可自行追加 Content-Type / Authorization）。
 * 透传 User-Agent（后端据此解析操作系统与浏览器）与客户端真实 IP（后端据此查归属地）。
 * 取不到就不写，交给后端按「未知」处理。
 */
export function clientForwardHeaders(request: NextRequest): Headers {
    const headers = new Headers();

    const userAgent = request.headers.get("user-agent");
    if (userAgent) {
        headers.set("User-Agent", userAgent);
    }

    const ip = clientIp(request);
    if (ip) {
        // X-Forwarded-For 用单个 IP（不追加链路）：后端一般取第一段，写单个最不易被误解析；
        // X-Real-IP 一并带上，兼容只读它的实现。
        headers.set("X-Forwarded-For", ip);
        headers.set("X-Real-IP", ip);
    }

    return headers;
}
