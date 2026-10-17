// 支付配置（PRO 模块）的类型定义。
//
// 证据来源（非猜测）：官方前端 src/lib/api/payment.ts:11-101
// （scripts/theme/theme-anheyu-next-main/src/lib/api/payment.ts），以及线上只读探活：
//   GET  /api/pro/payment/config/details      → 401（路由存在，需鉴权）
//   POST /api/pro/payment/config/alipay       → 401
//   POST /api/pro/payment/config/ALIPAY/toggle→ 401
//   POST /api/pro/payment/config/ALIPAY/test  → 401
//
// 注意：这些配置**不在**设置表里（社区版 internal/configdef 里没有任何 payment 键），
// 而是 PRO 侧独立的一组接口，所以设置页里用一块自定义面板读写（见
// components/admin/payment-settings-panel.tsx），不能当成普通配置键塞进设置表单。

/** 支付方式（后端枚举值，大写；toggle / test 路径里用的就是它） */
export type PaymentProvider = "ALIPAY" | "WECHAT" | "EPAY" | "HUPIJIAO";

/** 保存配置时路径里的 provider 段（小写；与 toggle/test 的大写不同，别混） */
export type PaymentProviderSlug = "alipay" | "wechat" | "epay" | "hupijiao";

// ===================== 保存用的请求体 =====================

/** 支付宝配置 */
export interface AlipayConfig {
    app_id: string;
    app_private_key: string;
    alipay_public_key: string;
}

/** 微信支付配置 */
export interface WechatConfig {
    app_id: string;
    mch_id: string;
    mch_serial_no: string;
    api_v3_key: string;
    private_key_data: string;
}

/** 易支付配置 */
export interface EpayConfig {
    mch_id: string;
    key: string;
    gateway: string;
    return_url?: string;
}

/** 虎皮椒 V3 配置 */
export interface HupijiaoConfig {
    app_id: string;
    app_secret: string;
    gateway?: string;
    return_url?: string;
}

// ===================== 读取用的配置详情 =====================

/** 各支付方式的公共字段 */
interface ProviderConfigBase {
    /** 是否已启用（收银台是否展示该方式） */
    enabled: boolean;
    /** 是否已配置过（必填项齐全） */
    configured: boolean;
    /** 支付回调地址（后端生成，配到支付平台后台用） */
    notify_url: string;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface AlipayConfigDetails extends ProviderConfigBase {
    app_id: string;
    app_private_key: string;
    alipay_public_key: string;
    has_private_key: boolean;
    has_public_key: boolean;
}

export interface WechatConfigDetails extends ProviderConfigBase {
    app_id: string;
    mch_id: string;
    mch_serial_no: string;
    api_v3_key: string;
    private_key_data: string;
    has_api_v3_key: boolean;
    has_private_key: boolean;
}

export interface EpayConfigDetails extends ProviderConfigBase {
    mch_id: string;
    key: string;
    gateway: string;
    return_url: string;
    has_key: boolean;
}

export interface HupijiaoConfigDetails extends ProviderConfigBase {
    app_id: string;
    app_secret: string;
    gateway: string;
    return_url: string;
    has_app_secret: boolean;
}

/** GET /pro/payment/config/details 的 data */
export interface PaymentConfigDetails {
    alipay: AlipayConfigDetails;
    wechat: WechatConfigDetails;
    epay: EpayConfigDetails;
    hupijiao: HupijiaoConfigDetails;
    /** 当前 PRO 版本真正支持的支付方式 */
    available_providers: string[];
    /** provider 枚举 → 展示名 */
    provider_names: Record<string, string>;
}

/** 一份配置 = 一个键值对（面板里按字段名收集，最后原样 POST 给对应接口） */
export type PaymentFormValues = Record<string, string>;
