"use client";
import { AlertTriangle, Check, X } from "lucide-react";

/**
 * 文章 SEO 自检面板（对齐参照项目 anheyu-app-frontend 的 SeoScorePanel 思路）。
 *
 * 纯前端静态评估：不发请求、不污染数据，只是把「发布前值得检查的几项」摆出来。
 * 规则刻意宽松（都是能自己掌握的东西：标题长度、正文长度、摘要、关键词、链接、封面、分类标签）。
 */
export interface SeoCheck {
    label: string;
    /** pass=达标 / warn=有但可更好 / fail=缺 */
    level: "pass" | "warn" | "fail";
    hint: string;
}

export interface SeoInput {
    title: string;
    contentMd: string;
    summary: string;
    keywords: string;
    abbrlink: string;
    coverUrl: string;
    categoryCount: number;
    tagCount: number;
}

/** 计算分数与检查项（warn 记半分） */
export function scoreArticleSeo(input: SeoInput): { score: number; checks: SeoCheck[] } {
    const title = input.title.trim();
    // 中英文混排下按字符数判断即可（中文一个字算一个）
    const textLen = input.contentMd.replace(/\s/g, "").length;
    const headingCount = (input.contentMd.match(/^#{2,4}\s+\S/gm) ?? []).length;
    const keywordCount = input.keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean).length;

    const checks: SeoCheck[] = [
        {
            label: "标题长度",
            level: title.length === 0 ? "fail" : title.length >= 8 && title.length <= 40 ? "pass" : "warn",
            hint:
                title.length === 0
                    ? "还没写标题"
                    : title.length < 8
                      ? `偏短（${title.length} 字），建议 8–40 字`
                      : title.length > 40
                        ? `偏长（${title.length} 字），列表页会被截断`
                        : `${title.length} 字，合适`,
        },
        {
            label: "正文长度",
            level: textLen === 0 ? "fail" : textLen >= 300 ? "pass" : "warn",
            hint: textLen === 0 ? "正文还是空的" : textLen >= 300 ? `${textLen} 字` : `只有 ${textLen} 字，建议 300 字以上`,
        },
        {
            label: "小标题结构",
            level: headingCount >= 2 ? "pass" : headingCount === 1 ? "warn" : "fail",
            hint: headingCount === 0 ? "正文里还没有 ## 小标题" : `${headingCount} 个小标题`,
        },
        {
            label: "摘要",
            level: input.summary.trim() ? "pass" : "fail",
            hint: input.summary.trim() ? "已填写" : "空着会用正文开头，建议自己写一句",
        },
        {
            label: "关键词",
            level: keywordCount >= 2 && keywordCount <= 6 ? "pass" : keywordCount > 0 ? "warn" : "fail",
            hint: keywordCount === 0 ? "没填关键词" : `${keywordCount} 个${keywordCount > 6 ? "，建议 2–6 个" : ""}`,
        },
        {
            label: "自定义链接",
            level: input.abbrlink.trim() ? "pass" : "warn",
            hint: input.abbrlink.trim() ? `/${input.abbrlink.trim()}` : "留空会用默认 ID，填个英文短链更友好",
        },
        {
            label: "封面图",
            level: input.coverUrl.trim() ? "pass" : "warn",
            hint: input.coverUrl.trim() ? "已设置" : "没有封面，列表页/分享卡片会比较素",
        },
        {
            label: "分类",
            level: input.categoryCount > 0 ? "pass" : "fail",
            hint: input.categoryCount > 0 ? `${input.categoryCount} 个` : "至少选一个分类",
        },
        {
            label: "标签",
            level: input.tagCount > 0 ? "pass" : "warn",
            hint: input.tagCount > 0 ? `${input.tagCount} 个` : "建议加标签，方便归档与相关推荐",
        },
    ];

    const total = checks.reduce((sum, c) => sum + (c.level === "pass" ? 1 : c.level === "warn" ? 0.5 : 0), 0);
    return { score: Math.round((total / checks.length) * 100), checks };
}

function LevelIcon({ level }: { level: SeoCheck["level"] }) {
    if (level === "pass") return <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    if (level === "warn") return <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
    return <X className="size-3.5 shrink-0 text-destructive" />;
}

/** 侧栏里的一块：分数 + 环形进度 + 逐项检查 */
export function SeoScorePanel(props: SeoInput) {
    const { score, checks } = scoreArticleSeo(props);
    const tone =
        score >= 80
            ? { text: "text-emerald-600 dark:text-emerald-400", label: "不错", bar: "bg-emerald-500" }
            : score >= 60
              ? { text: "text-amber-600 dark:text-amber-400", label: "还行", bar: "bg-amber-500" }
              : { text: "text-destructive", label: "待改进", bar: "bg-destructive" };
    const passCount = checks.filter((c) => c.level === "pass").length;

    return (
        <section className="rounded-xl border bg-card/60 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">发布前自检</h3>
                <span className={`text-xs font-semibold tabular-nums ${tone.text}`}>
                    {score} 分 · {tone.label}
                </span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${tone.bar} transition-[width] duration-300`} style={{ width: `${score}%` }} />
            </div>
            <ul className="space-y-1.5">
                {checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-xs">
                        <LevelIcon level={c.level} />
                        <span className="min-w-0 flex-1">
                            <span className={c.level === "fail" ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                            <span className="ml-1.5 text-muted-foreground/70">{c.hint}</span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className="mt-2.5 text-[11px] text-muted-foreground/70">
                共 {checks.length} 项，已达标 {passCount} 项 —— 仅供参考，不影响发布
            </p>
        </section>
    );
}
