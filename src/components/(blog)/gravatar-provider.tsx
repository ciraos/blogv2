"use client";

import { createContext, useContext } from "react";

import type { GravatarConfig } from "@/lib/avatar";

const GravatarContext = createContext<GravatarConfig>({});

/**
 * 头像配置注入（(blog) layout 在服务端已经取到 site-config，这里直接传下来）。
 * 好处：客户端不用再请求一次 site-config，也不会出现「先按默认 d= 渲染一次、配置到了再换 URL」
 * 导致的头像闪动；任何评论区/评论列表都能用同一个配置。
 */
export function GravatarProvider({ value, children }: { value: GravatarConfig; children: React.ReactNode }) {
    return <GravatarContext.Provider value={value}>{children}</GravatarContext.Provider>;
}

/** 读取头像配置；不在 Provider 内时返回空对象，由调用方回退到内置默认值 */
export function useGravatarConfig(): GravatarConfig {
    return useContext(GravatarContext);
}
