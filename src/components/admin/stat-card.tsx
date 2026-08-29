import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface StatCardProps {
    label: string;
    value: number;
    /** 与基准相比的百分比变化；null 表示无基准数据（显示 —） */
    deltaPercent?: number | null;
    /** 比较基准说明，如「较昨日」 */
    deltaLabel?: string;
}

/**
 * 统计卡片：数值在左，环比百分比在右（同一行）。
 * 上升红色、下降绿色、持平灰色。
 */
export function StatCard({ label, value, deltaPercent = null, deltaLabel = "较昨日" }: StatCardProps) {
    let tone: "up" | "down" | "flat" | "none";
    if (deltaPercent === null) {
        tone = "none";
    } else if (deltaPercent > 0) {
        tone = "up";
    } else if (deltaPercent < 0) {
        tone = "down";
    } else {
        tone = "flat";
    }

    const colorClass =
        tone === "up"
            ? "text-red-500"
            : tone === "down"
                ? "text-green-600"
                : "text-muted-foreground";

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-end justify-between gap-2">
                    <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>

                    {tone === "none" ? (
                        <span className="text-sm text-muted-foreground/60" title="暂无对比数据">—</span>
                    ) : (
                        <span className={`flex items-center gap-0.5 text-sm font-medium ${colorClass}`}>
                            {tone === "up" ? (
                                <ArrowUpRight className="size-4" />
                            ) : tone === "down" ? (
                                <ArrowDownRight className="size-4" />
                            ) : (
                                <Minus className="size-4" />
                            )}
                            {Math.abs(deltaPercent!).toFixed(1)}%
                            <span className="text-xs font-normal text-muted-foreground/70">{deltaLabel}</span>
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
