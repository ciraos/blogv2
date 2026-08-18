import type { FriendLink } from "@/types/links";
import { resolveAssetUrl } from "@/lib/utils";

import { LinkAvatar } from "@/components/(blog)/link-avatar";

function initials(name: string): string {
    return name.trim().charAt(0) || "友";
}

export function LinkCard({ link }: { link: FriendLink }) {
    const logo = resolveAssetUrl(link.logo);
    const siteUrl = link.url.startsWith("http") ? link.url : `https://${link.url}`;

    return (
        <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
        >
            {logo ? (
                <LinkAvatar src={logo} alt={link.name} />
            ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                    {initials(link.name)}
                </div>
            )}

            <div className="min-w-0">
                <div className="truncate text-sm font-semibold group-hover:text-primary">{link.name}</div>
                {link.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{link.description}</div>
                )}
            </div>
        </a>
    );
}
