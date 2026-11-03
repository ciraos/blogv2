import type { EssayToken } from "@/lib/essay-markdown";
import { parseEssayMarkdown } from "@/lib/essay-markdown";

/**
 * 把说说的轻量 Markdown 渲染成 React 节点（不使用 dangerouslySetInnerHTML）。
 *
 * 外层仍保留 `whitespace-pre-wrap`，所以换行按原样呈现；
 * 这里只负责粗体 / 斜体 / 删除线 / 行内代码 / 链接 / 图片。
 */
function renderTokens(tokens: EssayToken[], keyPrefix = "t"): React.ReactNode[] {
    return tokens.map((token, i) => {
        const key = `${keyPrefix}-${i}`;
        switch (token.type) {
            case "text":
                return token.value;
            case "code":
                return (
                    <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">
                        {token.value}
                    </code>
                );
            case "strong":
                return (
                    <strong key={key} className="font-semibold text-foreground">
                        {renderTokens(token.children, key)}
                    </strong>
                );
            case "em":
                return <em key={key}>{renderTokens(token.children, key)}</em>;
            case "del":
                return (
                    <del key={key} className="text-muted-foreground">
                        {renderTokens(token.children, key)}
                    </del>
                );
            case "link": {
                const external = /^(https?:)?\/\//i.test(token.href);
                return (
                    <a
                        key={key}
                        href={token.href}
                        className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
                    >
                        {renderTokens(token.children, key)}
                    </a>
                );
            }
            case "image":
                return (
                    // eslint-disable-next-line @next/next/no-img-element -- 说说里的图片是用户随手贴的任意外链，next/image 需要白名单域名
                    <img
                        key={key}
                        src={token.src}
                        alt={token.alt || ""}
                        loading="lazy"
                        className="my-1 inline-block max-h-56 rounded-lg border object-cover align-middle"
                    />
                );
            default:
                return null;
        }
    });
}

export function EssayContent({ content, className }: { content: string; className?: string }) {
    return <p className={className}>{renderTokens(parseEssayMarkdown(content))}</p>;
}
