"use client";

import { useState } from "react";
import { Loader2, PencilLine, Plus, Send } from "lucide-react";

interface LinkApplyFormProps {
    /** 提交成功后回调 */
    onSubmitted?: () => void;
}

type ApplyMode = "create" | "update";

/** 公共表单字段（新增/修改共用） */
interface BaseForm {
    name: string;
    logo: string;
    url: string;
    description: string;
    siteshot: string;
    email: string;
    rss: string;
}

const EMPTY_BASE: BaseForm = {
    name: "",
    logo: "",
    url: "",
    description: "",
    siteshot: "",
    email: "",
    rss: "",
};

/** 输入框包装（label + input） */
function Field({
    label,
    required,
    optional,
    value,
    onChange,
    placeholder,
    type = "text",
}: {
    label: string;
    required?: boolean;
    optional?: boolean;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
                {label}
                {required && <span className="ml-0.5 text-red-500">*</span>}
                {optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">（可选）</span>}
            </span>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
            />
        </label>
    );
}

/** 公共 7 字段表单（网站名称/Logo/链接/简介/截图/邮箱 + RSS 单独行） */
function BaseFields({
    form,
    onChange,
}: {
    form: BaseForm;
    onChange: <K extends keyof BaseForm>(key: K, value: string) => void;
}) {
    return (
        <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="网站名称" required value={form.name} onChange={(v) => onChange("name", v)} placeholder="你的网站名称" />
                <Field label="Logo链接" required value={form.logo} onChange={(v) => onChange("logo", v)} placeholder="https://example.com/logo.png" />
                <Field label="网站链接" required value={form.url} onChange={(v) => onChange("url", v)} placeholder="https://example.com" />
                <Field label="网站简介" required value={form.description} onChange={(v) => onChange("description", v)} placeholder="一句话介绍你的网站" />
                <Field label="网站截图" optional value={form.siteshot} onChange={(v) => onChange("siteshot", v)} placeholder="https://example.com/shot.png" />
                <Field label="联系邮箱" optional type="email" value={form.email} onChange={(v) => onChange("email", v)} placeholder="you@example.com" />
            </div>

            {/* RSS 单独一行（下方带说明小字） */}
            <div className="mt-4">
                <Field label="RSS地址" optional value={form.rss} onChange={(v) => onChange("rss", v)} placeholder="https://example.com/feed.xml" />
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    如果你的 RSS 不在常见路径，可填写完整 RSS/Atom 地址；未填写时系统自动发现。
                </p>
            </div>
        </>
    );
}

/**
 * 友链申请块：标题「友链申请」+ 类型切换（新增申请 / 修改信息）。
 * 新增申请与修改信息共用同一表单字段，修改信息额外多「原友链URL（可选）」「修改原因」两项。
 */
export function LinkApplyForm({ onSubmitted }: LinkApplyFormProps) {
    const [mode, setMode] = useState<ApplyMode>("create");
    const [form, setForm] = useState<BaseForm>(EMPTY_BASE);
    const [originalUrl, setOriginalUrl] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    function set<K extends keyof BaseForm>(key: K, value: string) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    // TODO: 提交 —— POST /public/links（新增）；修改信息接口待后端确认后接入
    async function handleSubmit() {
        setSubmitting(true);
        try {
            // 接口预留：mode === "create" ? submitLinkApply(form) : submitLinkUpdate({ ...form, originalUrl, reason })
            await new Promise((resolve) => setTimeout(resolve, 500));
            onSubmitted?.();
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            {/* 标题 */}
            <h3 className="text-lg font-semibold">友链申请</h3>

            {/* 类型切换：新增申请 / 修改信息 */}
            <div className="mt-3 mx-auto flex w-1/2 gap-1 rounded-lg bg-muted p-1">
                <button
                    type="button"
                    onClick={() => setMode("create")}
                    className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors ${mode === "create" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <Plus className="size-4" />
                    新增申请
                </button>
                <button
                    type="button"
                    onClick={() => setMode("update")}
                    className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors ${mode === "update" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <PencilLine className="size-4" />
                    修改信息
                </button>
            </div>

            {/* 公共表单字段 */}
            <BaseFields form={form} onChange={set} />

            {/* 修改信息额外字段：原友链URL（可选）+ 修改原因 */}
            {mode === "update" && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                        label="原友链URL"
                        optional
                        value={originalUrl}
                        onChange={setOriginalUrl}
                        placeholder="https://example.com"
                    />
                    <Field
                        label="修改原因"
                        required
                        value={reason}
                        onChange={setReason}
                        placeholder="请说明需要修改哪些信息及原因"
                    />
                </div>
            )}

            {/* 底部提交（两种模式都有） */}
            <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {mode === "create" ? "提交申请" : "提交修改"}
            </button>
        </div>
    );
}
