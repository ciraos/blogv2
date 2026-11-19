"use client";

import { useEffect, useRef, useState } from "react";
import { HeartPulse, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    getLinkHealthCheckStatusApi,
    triggerLinkHealthCheckApi,
    type LinkHealthCheckStatus,
} from "@/lib/api";

const POLL_INTERVAL_MS = 2000;
/** 最多轮询 3 分钟：后端 10 并发、单条超时 10s，140 条友链最坏情况也要近两分钟 */
const MAX_ATTEMPTS = 90;

/**
 * 汇总健康检查结果文案。
 * 后端实际返回 `{ is_running, start_time, end_time, result: { total, healthy, unhealthy, unhealthy_ids }, error }`，
 * 所以只看 result / error —— 之前按 total/ok/failed 这种"猜的字段名"读，永远读不到值。
 */
function summarize(st: LinkHealthCheckStatus): string {
    if (st.error) return `健康检查失败：${st.error}`;
    const result = st.result;
    if (!result) return "健康检查已完成，但没有拿到统计结果";
    return `健康检查完成：共 ${result.total} 条，${result.healthy} 条正常，${result.unhealthy} 条失联`;
}

/** 判断检查是否已结束：只有结果或错误落库才算，`is_running: false` 在"刚触发还没起来"时也会出现 */
function isFinished(st: LinkHealthCheckStatus): boolean {
    return Boolean(st.result || st.error);
}

/** 友链健康检查按钮：点击触发后端后台执行 → 提示执行中 → 轮询状态 → 结果 toast */
export function LinkHealthCheckButton() {
    const [running, setRunning] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const intervalRef = useRef<number | null>(null);

    const stopPolling = () => {
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setRunning(false);
    };

    // 卸载时清理定时器
    useEffect(() => () => stopPolling(), []);

    async function handleClick() {
        if (running) return;
        setRunning(true);

        const loadingId = toast.loading("正在执行友链健康检查…");

        try {
            await triggerLinkHealthCheckApi();
        } catch (err) {
            const message = err instanceof Error ? err.message : "触发健康检查失败";
            // 409 = 后端已在跑：不用报错，直接开始轮询那次任务的结果
            if (message.includes("正在执行") || message.includes("409")) {
                toast.dismiss(loadingId);
                toast.info("已有一次健康检查在执行，直接等它的结果");
            } else {
                toast.dismiss(loadingId);
                toast.error(message);
                stopPolling();
                return;
            }
        }

        // 触发成功：右上角提示已进入后台执行
        toast.dismiss(loadingId);
        toast.info("健康检查正在执行中······");

        let attempts = 0;
        const poll = async () => {
            attempts += 1;
            let st: LinkHealthCheckStatus;
            try {
                st = await getLinkHealthCheckStatusApi();
            } catch {
                toast.error("获取健康检查状态失败");
                stopPolling();
                return;
            }

            if (isFinished(st)) {
                toast.success(summarize(st));
                stopPolling();
                return;
            }

            if (attempts >= MAX_ATTEMPTS) {
                toast.info("健康检查仍在后台执行，稍后可再次查看");
                stopPolling();
                return;
            }

            // 仍在执行：无操作，等待下一次轮询
        };

        // 先立即查一次，再周期性轮询
        poll();
        intervalRef.current = window.setInterval(poll, POLL_INTERVAL_MS);
    }

    return (
        <>
            {/* 维护类动作，跟旁边三个按钮同一层：细线面 + 常规字色。
                原来是实心紫按钮，一个「健康检查」比「新建友链」还抢眼 ——
                颜色应该留给主操作，维护动作靠图标（心跳）就认得出。 */}
            <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setConfirmOpen(true)}
                disabled={running}
                aria-label={running ? "检查中" : "健康检查"}
                title={running ? "检查中…" : "健康检查"}
            >
                {running ? <LoaderCircle className="size-4 animate-spin" /> : <HeartPulse className="size-4" />}
                <span className="hidden sm:inline">{running ? "检查中…" : "健康检查"}</span>
            </Button>

            {/* 确认对话框：无右上角关闭按钮，仅 取消 / 确认 */}
            {confirmOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => setConfirmOpen(false)}
                >
                    <div
                        className="w-full max-w-sm soft-surface p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 text-base font-semibold">健康检查确认</div>
                        <p className="text-sm text-muted-foreground">即将对全部友链执行健康检查，是否继续？</p>
                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                                取消
                            </Button>
                            <Button
                                className="bg-purple-600 text-white hover:bg-purple-600/90"
                                disabled={running}
                                onClick={() => {
                                    setConfirmOpen(false);
                                    handleClick();
                                }}
                            >
                                确认
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
