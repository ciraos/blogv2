// 跨平台版的 deploy：pnpm i → pnpm build → 拷贝 public / .next/static 进 standalone → 起服务。
//
// 为什么不用 package.json 里那条 deploy：
//   `cp -r` 和 `export PORT=…` 都是 POSIX 语法，Windows 的 cmd / PowerShell 里跑不了。
// 这里全部用 Node 原生能力（fs.cpSync / fs.symlinkSync / spawnSync），三端行为一致。
//
// Windows 有个坑：Next 组装 .next/standalone 时会在 node_modules 里建大量**符号链接**，
// 普通用户默认没有这个权限（EPERM）。所以这里先探测一次：
//   · 能建符号链接 → 走 standalone（等价于原来的 deploy）
//   · 不能         → 退化成 `next build`（跳过 standalone）+ `next start`，同样能起生产服务
// 想彻底走 standalone，开启 Windows「开发人员模式」或用管理员终端即可。
//
// 用法：
//   pnpm deploy:win   完整流水线（install → build → 拷贝 → 起服务）
//   pnpm server:win   只起服务（产物已存在时用；等价于 POSIX 那条 server script）
// PORT 默认 3126，可用环境变量覆盖。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 只起服务、不重新构建 */
const serveOnly = process.argv.includes("--serve");

/** 端口：与原 deploy 保持一致，默认 3126 */
const PORT = process.env.PORT || "3126";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const serverEntry = path.join(standaloneDir, "server.js");

/** 跑一条命令，失败就整个退出（和 shell 里的 `&&` 语义一致） */
function run(command, extraEnv) {
    console.log(`\n> ${command}`);
    const result = spawnSync(command, {
        stdio: "inherit",
        // Windows 下 pnpm 是 pnpm.cmd，不经 shell 直接 spawn 会 ENOENT
        shell: true,
        env: { ...process.env, ...extraEnv },
    });
    if (result.status !== 0) {
        console.error(`\n✗ 命令失败（exit ${result.status ?? "unknown"}）：${command}`);
        process.exit(result.status ?? 1);
    }
}

/** 递归拷贝目录；目标已存在时合并（Node 20 的 fs.cpSync 自带这个语义） */
function copyDir(from, to) {
    const src = path.join(root, from);
    if (!fs.existsSync(src)) {
        console.error(`\n✗ 找不到要拷贝的目录：${from}`);
        process.exit(1);
    }
    console.log(`> copy ${from} -> ${path.relative(root, to)}`);
    fs.cpSync(src, to, { recursive: true, force: true });
}

/**
 * 当前账户能不能创建符号链接（决定走 standalone 还是 next start 回退）。
 * 探测目录放在 .next 下，用完即删，不影响产物。
 */
function canCreateSymlink() {
    const probeDir = path.join(root, ".next", ".symlink-probe");
    const target = path.join(probeDir, "target.txt");
    const link = path.join(probeDir, "link.txt");
    try {
        fs.mkdirSync(probeDir, { recursive: true });
        fs.writeFileSync(target, "ok");
        fs.symlinkSync(target, link);
        return true;
    } catch {
        return false;
    } finally {
        fs.rmSync(probeDir, { recursive: true, force: true });
    }
}

/** 起 standalone 产物（生产形态，和 Docker 里跑的是同一个 server.js） */
function startStandalone() {
    console.log(`\n> node .next/standalone/server.js  (PORT=${PORT})`);
    const server = spawnSync(process.execPath, [serverEntry], {
        cwd: standaloneDir,
        stdio: "inherit",
        env: { ...process.env, PORT },
    });
    process.exit(server.status ?? 0);
}

/** 退路：next start（没有 standalone 产物时用，跑的是同一份 .next 构建）。
 *  带上 NEXT_SKIP_STANDALONE=1：next.config 里的 output 是条件字段，构建时跳过 standalone，
 *  启动时也要跳过，否则 Next 会警告「next start 不适用于 output: standalone」。 */
function startNext() {
    run(`pnpm exec next start -p ${PORT}`, { NEXT_SKIP_STANDALONE: "1" });
}

const hasStandalone = () => fs.existsSync(serverEntry);

if (serveOnly) {
    if (hasStandalone()) startStandalone();
    if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
        console.error("\n✗ 没有可用的构建产物，先跑一次 `pnpm deploy:win`。");
        process.exit(1);
    }
    startNext();
} else {
    run("pnpm install");

    const symlinkOk = canCreateSymlink();
    if (symlinkOk) {
        run("pnpm build");
    } else {
        console.log(
            "\n! 当前账户不能创建符号链接（Windows 默认行为），跳过 standalone 打包，" +
            "改用 next build + next start。\n" +
            "  想产出 standalone（Docker / 单文件部署）：开启「开发人员模式」或用管理员终端再跑。",
        );
        run("pnpm build", { NEXT_SKIP_STANDALONE: "1" });
    }

    if (hasStandalone()) {
        // 静态资源：standalone 产物不含 public 与 .next/static，必须手工并进去（原 deploy 的 pnpm copy）
        copyDir("public", path.join(standaloneDir, "public"));
        copyDir(path.join(".next", "static"), path.join(standaloneDir, ".next", "static"));
        startStandalone();
    }

    startNext();
}
