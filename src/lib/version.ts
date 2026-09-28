/**
 * 本前端项目自己的版本号（不是后端版本）。
 *
 * 唯一来源是 package.json 的 `version`，由 next.config.ts 在构建时读取并注入 env.APP_VERSION
 * （服务端与浏览器端都可内联使用）。改版本只需改 package.json 一处，然后重新构建。
 *
 * 想更省事也可以在 package.json 里加脚本：`"version": "..."` 由 `pnpm version patch` 之类的命令维护
 * （pnpm/npm 的 version 命令会自动改 package.json 并打 git tag）。
 */
export const APP_VERSION = process.env.APP_VERSION || "0.0.0";

/** 带 v 前缀的展示形式：v0.1.0 */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
