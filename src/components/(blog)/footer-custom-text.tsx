interface FooterCustomTextProps {
    /** footer.custom_text（后台「页脚自定义文本」，线上为空） */
    text?: string;
}

/**
 * 页脚自定义文案（官方 `footer.pug` 的 `.footer_custom_text`）。
 *
 * ⚠️ 风险说明：该字段是管理员可控的纯字符串，后端不做任何过滤，这里按官方口径用
 * `dangerouslySetInnerHTML` 未转义直出 —— 因此它是一条存储型 XSS 面
 * （能改站点配置的角色即可在前台执行脚本）；官方同口径，保留此行为以便
 * 社区惯用的 `<a href="https://beian.miit.gov.cn/">备案号</a>` 这类 HTML 片段正常生效。
 */
export function FooterCustomText({ text }: FooterCustomTextProps) {
    const value = text?.trim();
    if (!value) return null;

    return (
        <div
            className="mt-6 text-center text-sm leading-relaxed text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: value }}
        />
    );
}
