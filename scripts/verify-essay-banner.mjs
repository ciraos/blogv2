// 验证 essay banner 背景图
const html = (await (await fetch("http://localhost:3126/essay")).text()).replace(/<!-- -->/g, "");
console.log("banner 块存在:", html.includes("essay-banner"));
console.log("背景图 URL 已解析:", html.includes("/api/f/Be4G/1781329196069141827.avif"));
console.log("object-cover 铺满:", html.includes("object-cover"));
console.log("黑色遮罩:", html.includes("bg-black/35"));
console.log("标题「即刻短文」:", html.includes("即刻短文"));
console.log("副标题:", html.includes("咸鱼的日常生活。"));
console.log("按钮文字:", html.includes("关于我"));
