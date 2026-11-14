"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PartyPopper, X } from "lucide-react";

/** 一颗烟花弹（从底部升起，到达目标高度后炸开） */
interface Rocket {
    x: number;
    y: number;
    vy: number;
    targetY: number;
    hue: number;
}

/** 爆炸后的粒子 */
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    hue: number;
    size: number;
}

interface FireworksProps {
    enabled?: boolean;
    /** 按钮文案（fireworks.button_text） */
    buttonText?: string;
    /** 祝福文案（fireworks.message） */
    message?: string;
}

/**
 * 节庆烟花（后台「其它开关 → 启用节庆烟花入口 + 节庆烟花文案」）。
 *
 * 交互对齐官方主题：右下角一个入口按钮，点开全屏放烟花，中间浮出祝福文案；
 * 点任意处或右上角 × 关闭。动画是纯 canvas 手工积分（重力 + 阻力 + 衰减），
 * 不引第三方库。
 *
 * 无障碍：`prefers-reduced-motion` 时不放动画，只显示祝福文案 —— 对前庭敏感用户友好。
 */
export function Fireworks({ enabled, buttonText, message }: FireworksProps) {
    const [open, setOpen] = useState(false);
    const [reduced, setReduced] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    // 尊重系统的「减少动态效果」设置
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const sync = () => setReduced(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);

    /** 关闭：停掉动画帧 */
    const close = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setOpen(false);
    }, []);

    // Esc 关闭
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("keydown", onKey);
        // 烟花期间锁滚动，避免背景上下晃
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, close]);

    // 动画主体
    useEffect(() => {
        if (!open || reduced) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener("resize", resize);

        const W = () => window.innerWidth;
        const H = () => window.innerHeight;

        const rockets: Rocket[] = [];
        const particles: Particle[] = [];
        let lastLaunch = 0;
        const start = performance.now();

        /** 随机在两三处高度炸开，颜色取色相环上的暖色段 */
        const launch = () => {
            rockets.push({
                x: W() * (0.12 + Math.random() * 0.76),
                y: H(),
                vy: -(11 + Math.random() * 4),
                targetY: H() * (0.12 + Math.random() * 0.4),
                hue: 20 + Math.random() * 300,
            });
        };

        const explode = (r: Rocket) => {
            const count = 96;
            for (let i = 0; i < count; i += 1) {
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
                const speed = 3.6 + Math.random() * 7.4;
                particles.push({
                    x: r.x,
                    y: r.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 0,
                    maxLife: 70 + Math.random() * 50,
                    hue: r.hue + (Math.random() * 26 - 13),
                    size: 1.6 + Math.random() * 2.2,
                });
            }
        };

        const frame = (now: number) => {
            // 每帧把已有像素「抹淡」而不是清空：粒子自带拖尾（destination-out 只降 alpha，画面保持透明）
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
            ctx.fillRect(0, 0, W(), H());
            ctx.globalCompositeOperation = "lighter";

            if (now - lastLaunch > 340 && now - start < 7600) {
                lastLaunch = now;
                launch();
            }

            for (let i = rockets.length - 1; i >= 0; i -= 1) {
                const r = rockets[i];
                r.y += r.vy;
                r.vy += 0.08;
                ctx.beginPath();
                ctx.fillStyle = `hsla(${r.hue}, 100%, 72%, 0.95)`;
                ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
                ctx.fill();
                if (r.y <= r.targetY || r.vy >= 0) {
                    explode(r);
                    rockets.splice(i, 1);
                }
            }

            for (let i = particles.length - 1; i >= 0; i -= 1) {
                const p = particles[i];
                p.life += 1;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.985;
                p.vy = p.vy * 0.985 + 0.045;
                const alpha = Math.max(0, 1 - p.life / p.maxLife);
                const radius = p.size * (0.45 + alpha * 0.75);
                // 外圈辉光：低透明度大半径，叠出「炸开」的通透感
                ctx.beginPath();
                ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, ${alpha * 0.22})`;
                ctx.arc(p.x, p.y, radius * 2.6, 0, Math.PI * 2);
                ctx.fill();
                // 内圈亮核
                ctx.beginPath();
                ctx.fillStyle = `hsla(${p.hue}, 100%, ${74 + alpha * 14}%, ${alpha})`;
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.fill();
                if (p.life >= p.maxLife) particles.splice(i, 1);
            }

            ctx.globalCompositeOperation = "source-over";

            // 放满 10 秒收尾（之后即便还有余烬也不再续帧，直接关掉）
            if (now - start > 10000) {
                close();
                return;
            }
            rafRef.current = requestAnimationFrame(frame);
        };

        rafRef.current = requestAnimationFrame(frame);

        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            window.removeEventListener("resize", resize);
        };
    }, [open, reduced, close]);

    if (!enabled) return null;

    return (
        <>
            {/* 入口：右下角悬浮按钮组上方，与「+」同一套外观 */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={buttonText || "节庆烟花"}
                title={buttonText || "节庆烟花"}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
                <PartyPopper className="size-4" />
                <span className="hidden sm:inline">{buttonText || "节日快乐"}</span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-label="节庆烟花"
                    onClick={close}
                >
                    {!reduced && <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />}

                    <div
                        className="relative z-10 mx-6 max-w-md text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="editorial-serif text-2xl leading-relaxed text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-3xl">
                            {message || "愿你的每一天都有新的惊喜"}
                        </p>
                        <button
                            type="button"
                            onClick={close}
                            className="mt-6 rounded-full border border-white/40 px-4 py-1.5 text-xs text-white/90 transition-colors hover:bg-white/15"
                        >
                            关闭
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={close}
                        aria-label="关闭烟花"
                        className="absolute top-5 right-5 flex size-9 items-center justify-center rounded-full border border-white/30 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            )}
        </>
    );
}
