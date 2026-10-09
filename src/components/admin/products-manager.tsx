"use client";

/**
 * 商品管理：统计磁贴 + 工具栏（关键词 / 状态筛选）+ 表格外壳 + 分页 + 三个弹窗。
 *
 * 接口（权威来源：官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/product.ts）
 *   GET    /pro/admin/products             L23-25  列表（走 api.ts 的 getAdminProductsApi）
 *   GET    /pro/admin/products/{id}        L30-32  详情（含 variants，编辑 / 规格 / 库存弹窗都用它取规格）
 *   POST   /pro/admin/products             L37-39  新增商品
 *   PUT    /pro/admin/products/{id}        L44-46  更新商品（**上下架 = 只传 { status }**；规格增改 = 传 variants）
 *   DELETE /pro/admin/products/{id}        L51-53  删除商品
 *   DELETE /pro/admin/variants/{id}        L58-60  删除型号
 *   GET    /pro/admin/variants/{id}/stock  L72-74  卡密库存列表
 *   POST   /pro/admin/variants/{id}/stock/import  L65-67 导入卡密（本地代理路径 /api/admin/variants/{id}/stock）
 *   POST   /pro/admin/stock/{id}/invalidate       L79-81 作废卡密
 *   浏览器经同源代理 /api/admin/* 转发（见 src/app/api/admin/{products,variants,stock}/）。
 *
 * ⚠️ 所有写操作（新增 / 更新 / 删除 / 导入 / 作废）本轮**只实现、不实测**（铁律：线上只读 GET 探测）。
 * ⚠️ 价格单位是**分**：官方 products/page.tsx L57-59 / L176 展示时统一 /100，
 *    ProductEditDialog 的标签也写着「价格（分）」；因此列表与表单都按分处理、按元展示。
 * ⚠️ 分页字段：响应 `{ list, total, page, page_size }`；请求参数 keyword / status / page / page_size。
 *
 * 页面结构遵循后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素；
 * 密度按后台紧凑规范（磁贴 px-3 py-2 / 表头 py-2 / 行 py-3 / 空态 py-8 / 弹窗 p-4 + space-y-3）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
    CircleAlert,
    KeyRound,
    Layers,
    Loader2,
    Package,
    PackageOpen,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Store,
    ToggleLeft,
    Trash2,
    TrendingUp,
    Wallet,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import { getAdminProductsApi } from "@/lib/api";
import {
    createAdminProductApi,
    deleteAdminProductApi,
    deleteAdminVariantApi,
    getAdminProductApi,
    importAdminVariantStockApi,
    invalidateAdminStockApi,
    listAdminVariantStockApi,
    stockStatusLabel,
    StockStatus,
    updateAdminProductApi,
    type AdminProduct,
    type AdminProductPayload,
    type AdminProductVariant,
    type AdminStockItem,
    type AdminVariantPayload,
    type DeliveryMethod,
} from "@/lib/api-orders-products";
import { resolveAssetUrl } from "@/lib/utils";
import { ProductStatus, type ProductListItem, type ProductStatusValue } from "@/types/products";

/** 每页条数（请求参数 page_size） */
const PAGE_SIZE = 10;
/** 卡密库存弹窗每页条数 */
const STOCK_PAGE_SIZE = 20;

/** 状态筛选常量：值的字符串形态与 ProductStatus 对齐 */
const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: String(ProductStatus.Draft), label: "草稿" },
    { value: String(ProductStatus.Published), label: "已上架" },
    { value: String(ProductStatus.Offline), label: "已下架" },
];

/** 把下拉框的字符串值收敛成接口要的 ProductStatusValue（"all" / 空串 / 非法值都返回 undefined） */
function parseStatusFilter(value: string): ProductStatusValue | undefined {
    if (value === String(ProductStatus.Draft)) return ProductStatus.Draft;
    if (value === String(ProductStatus.Published)) return ProductStatus.Published;
    if (value === String(ProductStatus.Offline)) return ProductStatus.Offline;
    return undefined;
}

/** 卡密状态筛选："all" / 非数字 → undefined */
function parseStockStatus(value: string): (typeof StockStatus)[keyof typeof StockStatus] | undefined {
    const n = Number(value);
    if (n === StockStatus.Available) return StockStatus.Available;
    if (n === StockStatus.Used) return StockStatus.Used;
    if (n === StockStatus.Invalid) return StockStatus.Invalid;
    return undefined;
}

/** 状态徽章（ProductStatus：1=草稿 2=已上架 3=已下架） */
function statusBadge(status?: number) {
    if (status === ProductStatus.Published)
        return { label: "已上架", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    if (status === ProductStatus.Draft)
        return { label: "草稿", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
    if (status === ProductStatus.Offline) return { label: "已下架", cls: "bg-muted text-muted-foreground" };
    return { label: status == null ? "—" : String(status), cls: "bg-muted text-muted-foreground" };
}

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 价格展示：远端字段单位是**分**（官方 products/page.tsx L57-59），展示换算成元 */
function yuan(fen: unknown): string {
    const n = Number(fen);
    return Number.isFinite(n) ? (n / 100).toFixed(2) : "0.00";
}

/** 发货方式 → 中文 */
function deliveryLabel(method: DeliveryMethod): string {
    return method === "STOCK_ITEM" ? "卡密库存" : "固定回复";
}

// 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
// min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
// 表头与数据行共用这套列宽，列顺序：商品 / 价格 / 规格数 / 销量 / 收入 / 状态 / 首页展示 / 创建时间 / 操作
const rowGrid = "sm:grid-cols-[minmax(0,1fr)_112px_56px_64px_104px_72px_72px_136px_168px]";
const rowMinW = "sm:min-w-[1080px]";

/** 骨架行：列宽与真实行完全一致，加载时表格不跳版 */
function ProductRowSkeleton() {
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
            </div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-6 sm:mx-auto" />
            <Skeleton className="h-3.5 w-8 sm:ml-auto" />
            <Skeleton className="h-3.5 w-12 sm:ml-auto" />
            <Skeleton className="h-4 w-12 rounded-full sm:mx-auto" />
            <Skeleton className="h-4 w-8 rounded-full sm:mx-auto" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-32" />
        </div>
    );
}

/** 单行模板：字段与 ProductListItem 一一对应；操作列 5 个动作全部接真接口 */
interface ProductRowProps {
    item: ProductListItem;
    /** 该行有写操作在途（禁用按钮，避免重复提交） */
    busy: boolean;
    onEdit: (item: ProductListItem) => void;
    onVariants: (item: ProductListItem) => void;
    onStock: (item: ProductListItem) => void;
    onToggleStatus: (item: ProductListItem) => void;
    onDelete: (item: ProductListItem) => void;
}

function ProductRow({ item, busy, onEdit, onVariants, onStock, onToggleStatus, onDelete }: ProductRowProps) {
    const badge = statusBadge(item.status);
    const published = item.status === ProductStatus.Published;
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            {/* 商品：封面 cover_url + 标题 title */}
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {item.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={resolveAssetUrl(item.cover_url) ?? item.cover_url}
                            alt=""
                            className="size-full object-cover"
                        />
                    ) : (
                        <Package className="size-4 text-muted-foreground/50" />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{item.title || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">#{item.id}</div>
                </div>
            </div>
            {/* 价格：min_price ~ max_price（单位分 → 元；单一价格时只显示一个） */}
            <div className="text-xs tabular-nums">
                <span className="mr-1 text-muted-foreground sm:hidden">价格</span>
                <span className="font-semibold text-primary">
                    {Number(item.min_price) === Number(item.max_price)
                        ? `¥${yuan(item.min_price)}`
                        : `¥${yuan(item.min_price)} ~ ¥${yuan(item.max_price)}`}
                </span>
            </div>
            <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                <span className="mr-1 sm:hidden">规格数</span>
                {item.variant_count || 0}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground sm:text-right">
                <span className="mr-1 sm:hidden">销量</span>
                {item.total_sales || 0}
            </div>
            <div className="text-xs tabular-nums sm:text-right">
                <span className="mr-1 text-muted-foreground sm:hidden">收入</span>
                <span className="font-medium text-foreground">¥{yuan(item.total_revenue)}</span>
            </div>
            <div className="sm:text-center">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                </span>
            </div>
            <div className="sm:text-center">
                <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.show_on_homepage
                            ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                            : "bg-muted text-muted-foreground"
                    }`}
                >
                    {item.show_on_homepage ? "是" : "否"}
                </span>
            </div>
            <div className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</div>
            {/* 操作列：编辑 / 规格 / 卡密库存 / 上下架 / 删除 */}
            <div className="flex items-center gap-1 sm:justify-center">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑"
                    title="编辑商品（改字段与规格）"
                    className={ACTION_TONE.edit}
                    disabled={busy}
                    onClick={() => onEdit(item)}
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="规格管理"
                    title="规格（型号）管理"
                    className={ACTION_TONE.pin}
                    disabled={busy}
                    onClick={() => onVariants(item)}
                >
                    <Layers className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="卡密库存"
                    title="卡密库存（列表 / 导入 / 作废）"
                    className={ACTION_TONE.key}
                    disabled={busy}
                    onClick={() => onStock(item)}
                >
                    <KeyRound className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={published ? "下架" : "上架"}
                    title={published ? "下架（PUT status=3）" : "上架（PUT status=2）"}
                    className={published ? ACTION_TONE.neutral : ACTION_TONE.approve}
                    disabled={busy}
                    onClick={() => onToggleStatus(item)}
                >
                    <ToggleLeft className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    title="删除商品"
                    className={ACTION_TONE.delete}
                    disabled={busy}
                    onClick={() => onDelete(item)}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}

// ============================================================
// 弹窗公共件（仓库里没有 ui/dialog，沿用 supports-manager 的手写浮层；
// 密度按后台紧凑规范：外壳 p-4、内容 space-y-3、底部按钮 h-8 / size="sm"）
// ============================================================

/** 表单字段：标签在上、控件在下（label 用 div 包，避免点击标签误触发 Radix 控件） */
function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
            {children}
        </div>
    );
}

/** 多行文本框（仓库里没有 ui/textarea，沿用 supports-manager 的裸 textarea + 主题令牌） */
function Textarea({
    value,
    onChange,
    placeholder,
    rows = 3,
    disabled,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
}) {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
        />
    );
}

function Modal({
    title,
    subtitle,
    onClose,
    children,
    footer,
    wide,
}: {
    title: string;
    subtitle?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
    wide?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className={`flex max-h-[85vh] w-full flex-col rounded-xl border bg-card p-4 shadow-sm ${
                    wide ? "max-w-3xl" : "max-w-xl"
                }`}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold">{title}</h3>
                        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        ✕
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-auto">{children}</div>
                <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2">{footer}</div>
            </div>
        </div>
    );
}

// ============================================================
// 一、新增 / 编辑商品弹窗（字段对齐官方 ProductEditDialog.tsx L119-296）
// ============================================================

/** 表单里的规格（价格 / 排序用字符串存，提交时再转数字） */
interface VariantForm {
    /** 已有规格带上 id（提交时原样回传 = 更新；不带 = 新增） */
    id?: string | number;
    name: string;
    price: string;
    delivery_method: DeliveryMethod;
    fixed_reply_content: string;
    sort_order: string;
}

interface ProductForm {
    title: string;
    description: string;
    cover_url: string;
    status: string;
    sort_order: string;
    show_on_homepage: boolean;
    exclude_from_membership: boolean;
    variants: VariantForm[];
}

const EMPTY_VARIANT: VariantForm = {
    name: "",
    price: "0",
    delivery_method: "FIXED_REPLY",
    fixed_reply_content: "",
    sort_order: "0",
};

function toVariantForm(variant: AdminProductVariant): VariantForm {
    return {
        id: variant.id,
        name: variant.name,
        price: String(variant.price ?? 0),
        delivery_method: variant.delivery_method,
        fixed_reply_content: variant.fixed_reply_content ?? "",
        sort_order: String(variant.sort_order ?? 0),
    };
}

function initialProductForm(product: AdminProduct | null): ProductForm {
    if (!product) {
        return {
            title: "",
            description: "",
            cover_url: "",
            status: String(ProductStatus.Published),
            sort_order: "0",
            show_on_homepage: true,
            exclude_from_membership: false,
            variants: [{ ...EMPTY_VARIANT }],
        };
    }
    return {
        title: product.title ?? "",
        description: product.description ?? "",
        cover_url: product.cover_url ?? "",
        status: String(product.status || ProductStatus.Published),
        sort_order: String(product.sort_order ?? 0),
        show_on_homepage: product.show_on_homepage !== false,
        exclude_from_membership: product.exclude_from_membership === true,
        variants: product.variants.length > 0 ? product.variants.map(toVariantForm) : [{ ...EMPTY_VARIANT }],
    };
}

/** 表单校验 + 组装请求体（返回 error 表示本地校验没过，不发请求） */
function buildProductPayload(form: ProductForm): { payload: AdminProductPayload } | { error: string } {
    if (!form.title.trim()) return { error: "请输入商品标题" };
    if (form.variants.length === 0) return { error: "请至少添加一个规格" };

    const variants: AdminVariantPayload[] = [];
    for (const [index, variant] of form.variants.entries()) {
        const price = Number(variant.price);
        if (!variant.name.trim()) return { error: `规格 ${index + 1} 的名称不能为空` };
        if (!Number.isFinite(price) || price < 0) {
            return { error: `规格 ${index + 1} 的价格必须是 ≥ 0 的数字（单位：分）` };
        }
        const sortOrder = Number(variant.sort_order);
        const item: AdminVariantPayload = {
            name: variant.name.trim(),
            price,
            delivery_method: variant.delivery_method,
            fixed_reply_content: variant.fixed_reply_content.trim() || undefined,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        };
        if (variant.id !== undefined) item.id = variant.id;
        variants.push(item);
    }

    const sortOrder = Number(form.sort_order);
    return {
        payload: {
            title: form.title.trim(),
            description: form.description.trim() || undefined,
            cover_url: form.cover_url.trim() || undefined,
            status: Number(form.status),
            exclude_from_membership: form.exclude_from_membership,
            show_on_homepage: form.show_on_homepage,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
            variants,
        },
    };
}

/** 单个规格的编辑块（新增 / 编辑商品弹窗与规格管理弹窗共用） */
function VariantEditor({
    label,
    value,
    onChange,
    onRemove,
    removeTitle,
    disabled,
}: {
    label: string;
    value: VariantForm;
    onChange: (next: Partial<VariantForm>) => void;
    onRemove?: () => void;
    removeTitle?: string;
    disabled?: boolean;
}) {
    return (
        <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    {label} · 发货方式：{deliveryLabel(value.delivery_method)}
                </p>
                {onRemove ? (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="移除规格"
                        title={removeTitle ?? "移除规格"}
                        className={ACTION_TONE.delete}
                        disabled={disabled}
                        onClick={onRemove}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Field label="型号名称">
                    <Input
                        value={value.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        placeholder="如：标准版"
                        className="h-8 text-sm"
                        disabled={disabled}
                    />
                </Field>
                <Field label="价格（分）">
                    <Input
                        type="number"
                        value={value.price}
                        onChange={(e) => onChange({ price: e.target.value })}
                        className="h-8 text-sm"
                        disabled={disabled}
                    />
                </Field>
                <Field label="发货方式">
                    <Select
                        value={value.delivery_method}
                        onValueChange={(v) => onChange({ delivery_method: v as DeliveryMethod })}
                        disabled={disabled}
                    >
                        <SelectTrigger className="h-8 w-full" aria-label="发货方式">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="FIXED_REPLY">固定回复</SelectItem>
                            <SelectItem value="STOCK_ITEM">卡密库存</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="排序值">
                    <Input
                        type="number"
                        value={value.sort_order}
                        onChange={(e) => onChange({ sort_order: e.target.value })}
                        className="h-8 text-sm"
                        disabled={disabled}
                    />
                </Field>
            </div>
            {/* 官方 ProductEditDialog L278-293：只有「固定回复」才需要填内容 */}
            {value.delivery_method === "FIXED_REPLY" ? (
                <div className="mt-2">
                    <Field label="固定回复内容">
                        <Textarea
                            value={value.fixed_reply_content}
                            onChange={(v) => onChange({ fixed_reply_content: v })}
                            placeholder="用户支付成功后返回的内容"
                            rows={2}
                            disabled={disabled}
                        />
                    </Field>
                </div>
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                    发货方式为「卡密库存」时不需要固定回复，保存后用行内「卡密库存」按钮导入卡密。
                </p>
            )}
        </div>
    );
}

function ProductEditDialog({
    product,
    onClose,
    onSaved,
}: {
    product: AdminProduct | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState<ProductForm>(() => initialProductForm(product));
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const isEdit = product !== null;

    const patch = (next: Partial<ProductForm>) => setForm((prev) => ({ ...prev, ...next }));
    const patchVariant = (index: number, next: Partial<VariantForm>) =>
        setForm((prev) => ({
            ...prev,
            variants: prev.variants.map((item, i) => (i === index ? { ...item, ...next } : item)),
        }));

    const submit = async () => {
        const built = buildProductPayload(form);
        if ("error" in built) {
            setError(built.error);
            toast.warning(built.error);
            return;
        }
        setError("");
        setSaving(true);
        try {
            if (product) {
                await updateAdminProductApi(product.id, built.payload);
                toast.success("商品已更新");
            } else {
                await createAdminProductApi(built.payload);
                toast.success("商品已创建");
            }
            onSaved();
            onClose();
        } catch (e) {
            const message = e instanceof Error ? e.message : "保存商品失败";
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={isEdit ? "编辑商品" : "新增商品"}
            subtitle={isEdit ? `商品 #${product?.id} · 价格单位为分` : "价格单位为分；至少保留一个规格"}
            onClose={onClose}
            wide
            footer={
                <>
                    <Button variant="outline" size="sm" className="h-8" onClick={onClose} disabled={saving}>
                        取消
                    </Button>
                    <Button size="sm" className="h-8" onClick={() => void submit()} disabled={saving}>
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {saving ? "保存中…" : isEdit ? "保存修改" : "创建商品"}
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Field label="商品标题">
                    <Input
                        value={form.title}
                        onChange={(e) => patch({ title: e.target.value })}
                        placeholder="请输入商品标题"
                        className="h-8 text-sm"
                        disabled={saving}
                    />
                </Field>
                <Field label="封面地址">
                    <Input
                        value={form.cover_url}
                        onChange={(e) => patch({ cover_url: e.target.value })}
                        placeholder="https://…"
                        className="h-8 text-sm"
                        disabled={saving}
                    />
                </Field>
                <Field label="状态">
                    <Select value={form.status} onValueChange={(v) => patch({ status: v })} disabled={saving}>
                        <SelectTrigger className="h-8 w-full" aria-label="商品状态">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="排序值">
                    <Input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) => patch({ sort_order: e.target.value })}
                        className="h-8 text-sm"
                        disabled={saving}
                    />
                </Field>
            </div>

            <Field label="商品描述">
                <Textarea
                    value={form.description}
                    onChange={(v) => patch({ description: v })}
                    placeholder="请输入商品描述"
                    rows={3}
                    disabled={saving}
                />
            </Field>

            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                        checked={form.show_on_homepage}
                        onCheckedChange={(v) => patch({ show_on_homepage: v === true })}
                        disabled={saving}
                        aria-label="首页显示"
                    />
                    首页显示
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                        checked={form.exclude_from_membership}
                        onCheckedChange={(v) => patch({ exclude_from_membership: v === true })}
                        disabled={saving}
                        aria-label="会员排除"
                    />
                    会员排除（会员不能免费获取）
                </label>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-semibold">商品规格（型号）</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={saving}
                        onClick={() => patch({ variants: [...form.variants, { ...EMPTY_VARIANT }] })}
                    >
                        <Plus size={14} />
                        添加规格
                    </Button>
                </div>
                {form.variants.map((variant, index) => (
                    <VariantEditor
                        key={`${variant.id ?? "new"}-${index}`}
                        label={`规格 ${index + 1}${variant.id !== undefined ? "（已保存）" : ""}`}
                        value={variant}
                        onChange={(next) => patchVariant(index, next)}
                        onRemove={
                            form.variants.length > 1
                                ? () => patch({ variants: form.variants.filter((_, i) => i !== index) })
                                : undefined
                        }
                        removeTitle="从本次提交里移除该规格（不调用删除接口）"
                        disabled={saving}
                    />
                ))}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </Modal>
    );
}

// ============================================================
// 二、规格（型号）管理弹窗
// ============================================================

function VariantsDialog({
    product,
    onClose,
    onChanged,
}: {
    product: ProductListItem;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [form, setForm] = useState<VariantForm[]>([]);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | number | null>(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const detail = await getAdminProductApi(product.id);
            setForm(detail.variants.length > 0 ? detail.variants.map(toVariantForm) : [{ ...EMPTY_VARIANT }]);
        } catch (e) {
            const message = e instanceof Error ? e.message : "获取商品规格失败";
            setLoadError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [product.id]);

    useEffect(() => {
        // 打开弹窗时拉一次商品详情拿规格：setState 都在 await 之后（这条规则对异步取数判得过严，同 products-manager 的既有处理）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const patchVariant = (index: number, next: Partial<VariantForm>) =>
        setForm((prev) => prev.map((item, i) => (i === index ? { ...item, ...next } : item)));

    /** 保存：PUT 商品的 variants 数组（官方 use-products-page.ts L124-155 也是整组提交） */
    const save = async () => {
        const built = buildProductPayload({
            // 规格弹窗只改 variants，其它字段用当前行的值占位（后端 PUT 允许部分字段，这里只送 variants）
            title: product.title || "占位标题",
            description: "",
            cover_url: "",
            status: String(product.status ?? ProductStatus.Published),
            sort_order: "0",
            show_on_homepage: product.show_on_homepage !== false,
            exclude_from_membership: product.exclude_from_membership === true,
            variants: form,
        });
        if ("error" in built) {
            setError(built.error);
            toast.warning(built.error);
            return;
        }
        if (!built.payload.variants) {
            setError("规格数据异常");
            return;
        }
        setError("");
        setSaving(true);
        try {
            // 只提交 variants：不碰标题 / 价格以外的商品字段，避免误覆盖
            await updateAdminProductApi(product.id, { variants: built.payload.variants });
            toast.success("规格已保存");
            await load();
            onChanged();
        } catch (e) {
            const message = e instanceof Error ? e.message : "保存规格失败";
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    /**
     * 删除规格：
     *   · 已保存的规格（有 id）→ 调远端 DELETE /pro/admin/variants/{id}（官方 product.ts L58-60，二次确认）
     *   · 未保存的新行 → 只从本地表单移除，保存时自然不会提交
     */
    const remove = async (variant: VariantForm, index: number) => {
        if (variant.id === undefined) {
            setForm((prev) => prev.filter((_, i) => i !== index));
            return;
        }
        if (
            !window.confirm(
                `确定删除规格「${variant.name || variant.id}」吗？\n该规格会从商品下移除，且不可恢复。`
            )
        )
            return;
        setDeletingId(variant.id);
        try {
            await deleteAdminVariantApi(variant.id);
            toast.success("规格已删除");
            await load();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除规格失败");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Modal
            title="规格（型号）管理"
            subtitle={`商品「${product.title || `#${product.id}`}」· 共 ${form.length} 个规格 · 价格单位为分`}
            onClose={onClose}
            wide
            footer={
                <>
                    <Button variant="outline" size="sm" className="h-8" onClick={onClose}>
                        关闭
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={loading || saving}
                        onClick={() => setForm((prev) => [...prev, { ...EMPTY_VARIANT }])}
                    >
                        <Plus size={14} />
                        添加规格
                    </Button>
                    <Button size="sm" className="h-8" disabled={loading || saving} onClick={() => void save()}>
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {saving ? "保存中…" : "保存规格"}
                    </Button>
                </>
            }
        >
            {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    加载规格…
                </div>
            ) : loadError ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <p className="text-sm text-destructive">{loadError}</p>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
                        <RefreshCw size={14} />
                        重试
                    </Button>
                </div>
            ) : (
                <>
                    {form.map((variant, index) => (
                        <VariantEditor
                            key={`${variant.id ?? "new"}-${index}`}
                            label={`规格 ${index + 1}${variant.id !== undefined ? `（已保存 #${variant.id}）` : "（未保存）"}`}
                            value={variant}
                            onChange={(next) => patchVariant(index, next)}
                            onRemove={() => void remove(variant, index)}
                            removeTitle={
                                variant.id !== undefined
                                    ? "删除该型号（调 DELETE /pro/admin/variants/{id}）"
                                    : "移除这条未保存的规格"
                            }
                            disabled={saving || deletingId === variant.id}
                        />
                    ))}
                    <p className="text-xs text-muted-foreground">
                        保存只提交规格数组（PUT /pro/admin/products/{"{id}"} 的 variants）；已保存的规格用左上角删除键走
                        DELETE /pro/admin/variants/{"{id}"}，两者都是写操作，本轮未实测。
                    </p>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </>
            )}
        </Modal>
    );
}

// ============================================================
// 三、卡密库存弹窗（列表 / 导入 / 作废）
// ============================================================

function StockDialog({ product, onClose }: { product: ProductListItem; onClose: () => void }) {
    const [loadingVariants, setLoadingVariants] = useState(true);
    const [variants, setVariants] = useState<AdminProductVariant[]>([]);
    const [variantId, setVariantId] = useState("");
    const [items, setItems] = useState<AdminStockItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState("all");
    const [loadingList, setLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [importText, setImportText] = useState("");
    const [importing, setImporting] = useState(false);
    const [invalidatingId, setInvalidatingId] = useState<string | number | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const selected = variants.find((v) => String(v.id) === variantId) ?? null;
    const totalPages = Math.max(1, Math.ceil(total / STOCK_PAGE_SIZE));

    /** 打开弹窗先取商品详情拿规格列表（官方 StockManageDialog.tsx L67-89） */
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoadingVariants(true);
            try {
                const detail = await getAdminProductApi(product.id);
                if (cancelled) return;
                setVariants(detail.variants);
                setVariantId(detail.variants.length > 0 ? String(detail.variants[0].id) : "");
            } catch (e) {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "获取商品规格失败");
            } finally {
                if (!cancelled) setLoadingVariants(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [product.id]);

    /** 拉卡密列表：variantId / 页码 / 状态筛选 / 写操作后刷新都会触发 */
    useEffect(() => {
        if (!variantId) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoadingList(true);
            setListError(null);
            try {
                const data = await listAdminVariantStockApi(variantId, {
                    page,
                    page_size: STOCK_PAGE_SIZE,
                    status: parseStockStatus(statusFilter),
                });
                if (cancelled) return;
                setItems(data.list);
                setTotal(data.total);
            } catch (e) {
                if (cancelled) return;
                const message = e instanceof Error ? e.message : "卡密库存加载失败";
                setItems([]);
                setTotal(0);
                setListError(message);
                toast.error(message);
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [variantId, page, statusFilter, reloadKey]);

    const previewItems = variantId ? items : [];

    /** 导入卡密：每行一条，官方 StockManageDialog.tsx L196-231 同时送 items 与 item_text */
    const handleImport = async () => {
        if (!variantId) {
            toast.warning("请先选择规格");
            return;
        }
        const lines = importText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        if (lines.length === 0) {
            toast.warning("请输入至少一条卡密（每行一条）");
            return;
        }
        setImporting(true);
        try {
            const result = await importAdminVariantStockApi(variantId, {
                items: lines,
                item_text: importText.trim(),
            });
            const imported = result?.imported ?? result?.imported_count ?? 0;
            const duplicate = result?.duplicate ?? 0;
            const failed = result?.failed_count ?? 0;
            toast.success(
                `导入完成：新增 ${imported} 条${duplicate > 0 ? `，重复 ${duplicate} 条` : ""}${
                    failed > 0 ? `，失败 ${failed} 条` : ""
                }`
            );
            setImportText("");
            setPage(1);
            setReloadKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导入卡密失败");
        } finally {
            setImporting(false);
        }
    };

    /** 作废卡密（二次确认，只有「可用」的卡密才能作废） */
    const handleInvalidate = async (item: AdminStockItem) => {
        if (
            !window.confirm(
                `确定作废这条卡密吗？\n${item.content.slice(0, 60)}\n作废后不可恢复。`
            )
        )
            return;
        setInvalidatingId(item.id);
        try {
            await invalidateAdminStockApi(item.id);
            toast.success("卡密已作废");
            setReloadKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "作废卡密失败");
        } finally {
            setInvalidatingId(null);
        }
    };

    const stockOptions = [
        { value: "all", label: "全部状态" },
        { value: String(StockStatus.Available), label: "可用" },
        { value: String(StockStatus.Used), label: "已使用" },
        { value: String(StockStatus.Invalid), label: "已作废" },
    ];

    return (
        <Modal
            title="卡密库存"
            subtitle={`商品「${product.title || `#${product.id}`}」· 每行一条，导入后可单独作废`}
            onClose={onClose}
            wide
            footer={
                <>
                    <span className="mr-auto text-xs text-muted-foreground">
                        共 <span className="font-medium tabular-nums text-foreground">{total}</span> 条
                        {selected ? ` · 该规格可用库存 ${selected.stock_count ?? 0}` : ""}
                    </span>
                    <Button variant="outline" size="sm" className="h-8" onClick={onClose}>
                        关闭
                    </Button>
                </>
            }
        >
            {loadingVariants ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    加载规格…
                </div>
            ) : variants.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                    该商品还没有规格，先在「编辑商品 / 规格管理」里添加型号。
                </div>
            ) : (
                <>
                    {/* 规格 + 状态筛选 */}
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Field label="商品规格">
                            <Select
                                value={variantId}
                                onValueChange={(v) => {
                                    setVariantId(v);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-8 w-full" aria-label="选择商品规格">
                                    <SelectValue placeholder="请选择规格" />
                                </SelectTrigger>
                                <SelectContent>
                                    {variants.map((v) => (
                                        <SelectItem key={String(v.id)} value={String(v.id)}>
                                            {v.name || `#${v.id}`}（¥{yuan(v.price)}）
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="库存状态">
                            <Select
                                value={statusFilter}
                                onValueChange={(v) => {
                                    setStatusFilter(v);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-8 w-full" aria-label="按库存状态筛选">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {stockOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>

                    {/* 批量导入 */}
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                        <p className="text-base font-semibold">批量导入卡密</p>
                        <Textarea
                            value={importText}
                            onChange={setImportText}
                            placeholder={"每行一条，例如：\nABC-001\nABC-002"}
                            rows={4}
                            disabled={importing}
                        />
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                                共 {importText.split("\n").filter((l) => l.trim()).length} 条待导入
                            </span>
                            <Button
                                size="sm"
                                className="h-8"
                                disabled={importing || !importText.trim()}
                                onClick={() => void handleImport()}
                            >
                                {importing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                {importing ? "导入中…" : "导入卡密"}
                            </Button>
                        </div>
                    </div>

                    {/* 卡密列表（密集行 + divide-y） */}
                    {loadingList ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            加载卡密…
                        </div>
                    ) : listError ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <p className="text-sm text-destructive">{listError}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => setReloadKey((k) => k + 1)}
                            >
                                <RefreshCw size={14} />
                                重试
                            </Button>
                        </div>
                    ) : previewItems.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            {statusFilter === "all" ? "该规格还没有卡密，先在上面导入" : "该状态下没有卡密"}
                        </div>
                    ) : (
                        <div className="divide-y rounded-lg border">
                            {previewItems.map((item) => (
                                <div key={String(item.id)} className="flex items-center gap-3 px-4 py-2 text-xs">
                                    <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                                        {item.content || "—"}
                                    </span>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                                            item.status === StockStatus.Available
                                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                                : item.status === StockStatus.Used
                                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                                  : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        {stockStatusLabel(item.status)}
                                    </span>
                                    <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:block">
                                        {formatDateTime(item.created_at)}
                                    </span>
                                    <span className="hidden shrink-0 tabular-nums text-muted-foreground md:block">
                                        {item.used_at ? formatDateTime(item.used_at) : "—"}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 shrink-0 ${ACTION_TONE.delete}`}
                                        disabled={
                                            item.status !== StockStatus.Available || invalidatingId === item.id
                                        }
                                        title="作废该卡密"
                                        onClick={() => void handleInvalidate(item)}
                                    >
                                        作废
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {totalPages > 1 ? (
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>
                                第 {page} / {totalPages} 页
                            </span>
                            <PaginationControls
                                page={page}
                                totalPages={totalPages}
                                onPageChange={(next) => setPage(next)}
                                disabled={loadingList}
                            />
                        </div>
                    ) : null}
                </>
            )}
        </Modal>
    );
}

/**
 * 商品管理页外壳：统计磁贴 + 工具栏（新增/搜索/状态筛选/刷新）+ 表格 + 分页 + 三个弹窗。
 * 列表数据来自 GET /api/admin/products；写操作全部经同源代理，本轮未实测。
 */
export function ProductsManager() {
    /** 搜索框输入值（受控，回车/清空时才发起请求） */
    const [input, setInput] = useState("");
    /** 已生效的关键词（接口参数 keyword） */
    const [keyword, setKeyword] = useState("");
    /** 状态筛选（"all" = 不筛选；接口参数 status） */
    const [status, setStatus] = useState("all");
    /** 当前页（接口参数 page） */
    const [page, setPage] = useState(1);

    /** 接口数据 */
    const [list, setList] = useState<ProductListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ===== 弹窗状态 =====
    /** 编辑 / 新增弹窗：undefined = 关着；null = 新增；对象 = 编辑该商品 */
    const [editTarget, setEditTarget] = useState<AdminProduct | null | undefined>(undefined);
    const [editLoadingId, setEditLoadingId] = useState<number | null>(null);
    const [variantsTarget, setVariantsTarget] = useState<ProductListItem | null>(null);
    const [stockTarget, setStockTarget] = useState<ProductListItem | null>(null);
    /** 正在执行写操作的商品 id（禁用该行按钮） */
    const [actingId, setActingId] = useState<number | null>(null);

    /** 请求序号：只让最后一次请求的结果落地（避免快速切页/筛选时旧响应覆盖新数据） */
    const reqIdRef = useRef(0);

    const fetchProducts = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const data = await getAdminProductsApi({
                page,
                page_size: PAGE_SIZE,
                // 空串 / 未选择 → undefined（URL 里就不带这个参数）
                keyword: keyword.trim() || undefined,
                status: parseStatusFilter(status),
            });
            if (reqId !== reqIdRef.current) return;
            setList(Array.isArray(data?.list) ? data.list : []);
            setTotal(Number(data?.total) || 0);
            setPageSize(Number(data?.page_size) || PAGE_SIZE);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            const message = err instanceof Error && err.message ? err.message : "商品列表加载失败";
            setError(message);
            setList([]);
            setTotal(0);
            toast.error(message);
        } finally {
            if (reqId === reqIdRef.current) setLoading(false);
        }
    }, [page, keyword, status]);

    useEffect(() => {
        // 挂载/筛选变化时拉列表：setState 都发生在请求 await 之后。
        // 该规则对经过 useCallback 的异步取数判得过严，这里显式豁免（与 article-history 同处理）。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchProducts();
    }, [fetchProducts]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    /** 是否有生效中的筛选（决定空态文案） */
    const hasFilter = Boolean(keyword.trim()) || status !== "all";

    /** 仅首屏（还没有任何数据）显示骨架；切页/刷新时保留旧列表，避免闪屏 */
    const initialLoading = loading && list.length === 0 && page === 1 && !hasFilter;

    /** 磁贴：商品总数取接口 total；已上架 / 销量 / 收入按当前页数据汇总（单位：分 → 元） */
    const publishedCount = list.filter((p) => p.status === ProductStatus.Published).length;
    const salesSum = list.reduce((sum, p) => sum + (Number(p.total_sales) || 0), 0);
    const revenueSum = list.reduce((sum, p) => sum + (Number(p.total_revenue) || 0), 0);

    /** 重置筛选：清关键词 + 状态，并回到第 1 页 */
    const resetFilters = () => {
        setInput("");
        setKeyword("");
        setStatus("all");
        setPage(1);
    };

    /** 关键词生效（回车触发） */
    const applyKeyword = () => {
        setKeyword(input.trim());
        setPage(1);
    };

    /** 新增：直接开空表单（不需要详情接口） */
    const openCreate = () => setEditTarget(null);

    /** 编辑：先取商品详情（variants 只有详情接口给），成功后再开弹窗 */
    const openEdit = async (item: ProductListItem) => {
        setEditLoadingId(item.id);
        try {
            const detail = await getAdminProductApi(item.id);
            setEditTarget(detail);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "获取商品详情失败");
        } finally {
            setEditLoadingId(null);
        }
    };

    /**
     * 上下架：官方 use-products-page.ts L222-237 就是 PUT /products/{id} 只传 status
     *（status === 2 ? 3 : 2），可逆操作，不需要二次确认。草稿也会被切成「已上架」。
     */
    const handleToggleStatus = async (item: ProductListItem) => {
        const next =
            item.status === ProductStatus.Published ? ProductStatus.Offline : ProductStatus.Published;
        const label = next === ProductStatus.Published ? "上架" : "下架";
        setActingId(item.id);
        try {
            await updateAdminProductApi(item.id, { status: next });
            toast.success(`商品已${label}`);
            await fetchProducts();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `商品${label}失败`);
        } finally {
            setActingId(null);
        }
    };

    /** 删除商品（二次确认，不可恢复） */
    const handleDelete = async (item: ProductListItem) => {
        if (
            !window.confirm(
                `确定删除商品「${item.title || `#${item.id}`}」吗？\n商品及其规格会一并删除，且不可恢复。`
            )
        )
            return;
        setActingId(item.id);
        try {
            await deleteAdminProductApi(item.id);
            toast.success("商品已删除");
            // 删掉当前页最后一条且后面还有页时回退一页，避免停在空页
            if (list.length === 1 && page > 1) setPage((p) => p - 1);
            else await fetchProducts();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除商品失败");
        } finally {
            setActingId(null);
        }
    };

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Package className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">商品总数</p>
                        <p className="text-lg font-semibold tabular-nums">{loading ? "—" : total}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Store className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">已上架（本页）</p>
                        <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {loading ? "—" : publishedCount}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <TrendingUp className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">总销量（本页）</p>
                        <p className="text-lg font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                            {loading ? "—" : salesSum}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">总收入（本页）</p>
                        <p className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {loading ? "—" : `¥${yuan(revenueSum)}`}
                        </p>
                    </div>
                </div>
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方表格滚动。
                左：搜索 + 状态筛选 + 重置；右：新增商品 / 刷新（卡密库存入口在每行操作列里） */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                // 回车才真正按 keyword 查询（输入过程不打扰）
                                if (e.key === "Enter") applyKeyword();
                            }}
                            placeholder="搜索商品标题（回车）"
                            className="h-8 pl-8 pr-8 text-sm"
                            aria-label="搜索商品"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => {
                                    setInput("");
                                    setKeyword("");
                                    setPage(1);
                                }}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 状态筛选：切换即查询（回到第 1 页） */}
                    <Select
                        value={status}
                        onValueChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-8 w-28 shrink-0" aria-label="按商品状态筛选">
                            <SelectValue placeholder="商品状态" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={resetFilters}
                        disabled={!hasFilter}
                    >
                        <RotateCcw size={14} />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium tabular-nums text-foreground">{total}</span> 件商品
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button size="sm" className="h-8" onClick={openCreate}>
                        <Plus size={14} />
                        新增商品
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void fetchProducts()}
                        disabled={loading}
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>商品</span>
                    <span>价格</span>
                    <span className="text-center">规格数</span>
                    <span className="text-right">销量</span>
                    <span className="text-right">收入</span>
                    <span className="text-center">状态</span>
                    <span className="text-center">首页展示</span>
                    <span>创建时间</span>
                    <span className="text-center">操作</span>
                </div>

                {initialLoading ? (
                    // 加载中：骨架行（列宽与真实行一致）
                    <div aria-busy="true" aria-label="商品列表加载中">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <ProductRowSkeleton key={i} />
                        ))}
                    </div>
                ) : error ? (
                    // 错误态：文案 + 重试（toast 已在请求失败时弹出）
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
                            <CircleAlert className="size-6 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-foreground">商品列表加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 text-xs"
                            onClick={() => void fetchProducts()}
                            disabled={loading}
                        >
                            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                            重试
                        </Button>
                    </div>
                ) : list.length === 0 ? (
                    // 空态：「有筛选没匹配」与「确实没数据」区分文案
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                            <PackageOpen className="size-6 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                            {hasFilter ? "没有匹配的商品" : "暂无商品"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {hasFilter ? "试试调整关键词或状态筛选" : "还没有商品数据，点「新增商品」创建第一个"}
                        </p>
                        {hasFilter ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 h-8 text-xs"
                                onClick={resetFilters}
                            >
                                <RotateCcw className="size-3.5" />
                                重置筛选
                            </Button>
                        ) : (
                            <Button size="sm" className="mt-1 h-8 text-xs" onClick={openCreate}>
                                <Plus className="size-3.5" />
                                新增商品
                            </Button>
                        )}
                    </div>
                ) : (
                    // 切页/刷新时保留旧列表（轻微降透明度表示正在更新）
                    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                        {list.map((item) => (
                            <ProductRow
                                key={item.id}
                                item={item}
                                busy={actingId === item.id || editLoadingId === item.id}
                                onEdit={(row) => void openEdit(row)}
                                onVariants={(row) => setVariantsTarget(row)}
                                onStock={(row) => setStockTarget(row)}
                                onToggleStatus={(row) => void handleToggleStatus(row)}
                                onDelete={(row) => void handleDelete(row)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium tabular-nums text-foreground">{total}</span> 条 · 第 {currentPage}/
                    {totalPages} 页
                </span>
                <PaginationControls
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={(next) => setPage(next)}
                    disabled={loading || Boolean(error)}
                />
            </div>

            {/* ===== 弹窗：新增 / 编辑商品 ===== */}
            {editTarget !== undefined ? (
                <ProductEditDialog
                    key={editTarget ? `edit-${editTarget.id}` : "create"}
                    product={editTarget}
                    onClose={() => setEditTarget(undefined)}
                    onSaved={() => void fetchProducts()}
                />
            ) : null}

            {/* ===== 弹窗：规格管理 ===== */}
            {variantsTarget ? (
                <VariantsDialog
                    key={`variants-${variantsTarget.id}`}
                    product={variantsTarget}
                    onClose={() => setVariantsTarget(null)}
                    onChanged={() => void fetchProducts()}
                />
            ) : null}

            {/* ===== 弹窗：卡密库存 ===== */}
            {stockTarget ? (
                <StockDialog
                    key={`stock-${stockTarget.id}`}
                    product={stockTarget}
                    onClose={() => setStockTarget(null)}
                />
            ) : null}
        </div>
    );
}
