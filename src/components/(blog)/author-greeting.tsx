"use client";

import { useState } from "react";

interface AuthorGreetingProps {
    /** 技能列表（来自 sidebar.author.skills） */
    skills: string[];
}

/**
 * 作者卡顶部问候语：默认显示「欢迎光临」，点击后逐个循环显示技能词，
 * 到最后一项后再点击回到「欢迎光临」（循环）。
 */
export function AuthorGreeting({ skills }: AuthorGreetingProps) {
    // index：0 = 欢迎光临；1..n = 依次显示 skills[index-1]
    const [index, setIndex] = useState(0);

    function handleClick() {
        setIndex((prev) => (prev >= skills.length ? 0 : prev + 1));
    }

    const display = index === 0 ? "欢迎光临" : skills[index - 1];

    return (
        <button
            type="button"
            onClick={handleClick}
            title="点击切换"
            className="mx-auto flex w-fit cursor-pointer items-center rounded-full bg-[#fff3] px-2 py-0.5 text-left text-sm opacity-80 transition-opacity select-none hover:opacity-100"
        >
            {display}
        </button>
    );
}
