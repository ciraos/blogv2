"use client";

// 这个文件以前是「友链分类排序」对话框，底部挂着一个永远 `disabled` 的「保存排序」假按钮
// （注释写着「保存功能待后端分类排序 API 支持后启用」）。
//
// 事实核查：后端**确实没有**分类排序接口 —— 分类模型 pkg/domain/model/link.go 里没有排序字段，
// internal/infra/router/router.go 的 /links/categories 分组只有 GET / POST / PUT /:id / DELETE，
// 前台 /link 页按分类 id 升序（创建顺序）展示。所以分类排序没有可接的后端，不该留假按钮。
//
// 于是这个入口让位给**友链**排序（友链有真实接口：PUT /links/sort）。
// 保留 CategorySortDialog 这个导出名，是因为引用它的是 src/app/admin/friends/page.tsx，
// 而该文件不在本次允许改动的范围内；真正实现在 ./link-sort-dialog.tsx。
export { LinkSortDialog as CategorySortDialog } from "./link-sort-dialog";
