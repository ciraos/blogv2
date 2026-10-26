/**
 * 渲染一段 `application/ld+json`。
 *
 * 安全：`JSON.stringify` 的结果里如果出现 `</script>`（比如文章标题里带这串字符），
 * 浏览器会提前结束 script 标签 —— 所以把 `<` 全部转成 `\u003c`（JSON 里等价，字符串值不变）。
 * `>` 与 `&` 同样处理，避免 HTML 解析器误判。
 */
export function JsonLd({ data }: { data: object | object[] }) {
    const json = JSON.stringify(data)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
