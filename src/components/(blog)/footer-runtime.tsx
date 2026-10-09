import { FooterRuntimeTicker } from "@/components/(blog)/footer-runtime-ticker";
import { parseLaunchTime, resolveRuntimeState } from "@/lib/footer-runtime";
import type { FooterConfig } from "@/types/site-config";

interface FooterRuntimeProps {
    /** footer.runtime 配置段（enable / launch_time / work_* / offduty_*） */
    config?: FooterConfig["runtime"];
}

/**
 * 页脚「运行时间」（官方 `footer.pug` 的 `#workboard`）：
 *   状态图（上班 / 休息，随访客本地小时切换，取 runtime_js 的 `9 <= 小时 < 18` 规则）
 *   + 状态文案（work_description / offduty_description）
 *   + 官方同款的「本站居然运行了 X 天 YY 小时 MM 分 SS 秒」（按 launch_time 计算）。
 *
 * 为什么拆成「服务端初值 + 客户端走字」两层：
 *   - 若只在客户端算，首屏 HTML 里就没有运行时间（无 JS / SEO / 抓 HTML 验证都看不到）；
 *   - 但时间必须每秒走字、状态要按访客本地时区判断，所以 SSR 先写一份初值，
 *     挂载后交给客户端组件接管（客户端首帧复用初值，不会 hydration 不一致）。
 *
 * `enable` 未开启、或 launch_time 解析不出来（含未填写）时整块不渲染。
 */
export function FooterRuntime({ config }: FooterRuntimeProps) {
    if (!config?.enable) return null;

    const launchDate = parseLaunchTime(config.launch_time);
    if (!launchDate) return null;

    const launchTime = launchDate.getTime();

    return (
        <FooterRuntimeTicker
            launchTime={launchTime}
            initial={resolveRuntimeState(launchTime, new Date())}
            work={{ img: config.work_img, description: config.work_description }}
            offduty={{ img: config.offduty_img, description: config.offduty_description }}
        />
    );
}
