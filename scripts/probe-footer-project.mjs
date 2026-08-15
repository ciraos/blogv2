// 探测线上 site-config 的 footer.project 结构
const res = await fetch("https://blog.ciraos.top/api/public/site-config");
const data = await res.json();
console.log("status:", res.status, "code:", data.code);
const footer = data?.data?.footer;
if (!footer) {
    console.log("no footer in config");
    process.exit(0);
}
console.log("footer keys:", Object.keys(footer));
console.log("project:", JSON.stringify(footer.project, null, 2));
console.log("list:", JSON.stringify(footer.list, null, 2));
console.log("bar.linkList:", JSON.stringify(footer.bar?.linkList, null, 2));
