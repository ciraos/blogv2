import { NextResponse } from "next/server";

// 插件 id 校验：与后端 manifest 的 id 规则保持一致
// （pkg/plugin/manifest.go:24 的 pluginIDPattern：2-64 位小写字母/数字/中划线/下划线，且以字母或数字开头）。
// 先校验再拼进转发路径，避免把任意路径片段（如 ../）带进远端 URL。
//
// 放在 _lib 私有目录：app 目录下以 _ 开头的文件夹不参与路由（Next 的 private folder 约定），
// 不会被当成路由段。
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

/** 校验插件 id；非法时返回 400 响应，合法时返回 null */
export function invalidPluginId(id: string): NextResponse | null {
    if (PLUGIN_ID_PATTERN.test(id)) return null;
    return NextResponse.json({ code: 400, message: "插件 id 非法", data: null }, { status: 400 });
}
