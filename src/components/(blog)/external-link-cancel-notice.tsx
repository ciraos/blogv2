"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { EXTERNAL_LINK_CANCEL_CHANNEL, EXTERNAL_LINK_CANCEL_MESSAGE } from "@/lib/external-link";

/**
 * 外链提示页倒计时结束时的「没跳转」提示。
 *
 * 场景：点带 `_blank` 的外链 → 提示页被开在**新标签**里 → 用户没点「立即前往」→
 * 提示页在倒计时结束时广播一条消息并 `window.close()` 把自己关掉。
 * 关掉之后它上面的 toast 随之消失，所以这条提示必须由**原标签页**接住 —— 就是这里。
 */
export function ExternalLinkCancelNotice() {
    useEffect(() => {
        if (typeof BroadcastChannel === "undefined") return;
        let channel: BroadcastChannel;
        try {
            channel = new BroadcastChannel(EXTERNAL_LINK_CANCEL_CHANNEL);
        } catch {
            return;
        }
        channel.onmessage = (event) => {
            if (event.data === "countdown-expired") {
                toast.info(EXTERNAL_LINK_CANCEL_MESSAGE, { duration: 6000 });
            }
        };
        return () => channel.close();
    }, []);

    return null;
}
