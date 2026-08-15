// 验证时间轴：日期在节点上方、节点对准线中心
const html = (await (await fetch("http://localhost:3126/")).text()).replace(/<!-- -->/g, "");

// 结构：日期行 → 节点 → 卡片
const seg = html.substring(html.indexOf("即刻动态"), html.indexOf("即刻动态") + 1500);
console.log("日期行 leading-4（在节点上方）:", /text-\[11px\] leading-4/.test(seg));
console.log("实心节点（无白边）:", /size-2\.5 rounded-full bg-primary shadow-sm/.test(seg) && !seg.includes("border-2 border-background bg-primary"));
console.log("时间线 top-[24px]:", html.includes("top-[24px] h-0.5"));
// 顺序验证：日期出现在节点之前
const dIdx = seg.indexOf("08/15");
const dotIdx = seg.indexOf("size-2.5 rounded-full bg-primary");
console.log("日期在节点上方（日期索引 < 节点索引）:", dIdx >= 0 && dotIdx > dIdx);
console.log("结构片段:", JSON.stringify(seg.substring(seg.indexOf("w-48 shrink-0"), seg.indexOf("w-48 shrink-0") + 260)));
