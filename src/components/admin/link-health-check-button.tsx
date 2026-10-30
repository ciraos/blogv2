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
const MAX_ATTEMPTS = 12;

/** 汇总健康检查结果文案（后端 status 字段命名可能不同，按常见字段兜底读取） */
function summarize(st: LinkHealthCheckStatus): string {
    const total = st.total ?? st.count;
    if (typeof total === "number") {
        const ok = st.ok ?? st.success;
        const failed = st.failed ?? st.fail ?? st.error;
        const parts: string[] = [];
        if (typeof ok === "number") parts.push(`${ok} 正常`);
        if (typeof failed === "number") parts.push(`${failed} 异常`);
        if (parts.length === 0) parts.push(`${total} 条已检查`);
        return `健康检查完成：${parts.join("，")}`;
    }
    return "健康检查完成";
}

/** 判断检查是否已结束 */
function isFinished(st: LinkHealthCheckStatus): boolean {
    if (st.finished === true) return true;
    if (typeof st.total === "number") {
        const ok = st.ok ?? st.success;
        const failed = st.failed ?? st.fail ?? st.error;
        if (typeof ok === "number" && typeof failed !== "number") return false;
        if (typeof ok === "number" || typeof failed === "number") return true;
        return true;
    }
    const s = (st.status || "").toLowerCase();
    if (s === "running" || s === "pending" || s === "processing") return false;
    if (s) return true;
    return false;
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
            toast.dismiss(loadingId);
            toast.error(err instanceof Error ? err.message : "触发健康检查失败");
            stopPolling();
            return;
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
            <Button
                className="bg-purple-600 text-white hover:bg-purple-600/90"
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
                        className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl"
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
