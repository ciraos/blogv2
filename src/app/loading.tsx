import "./globals.css";

export default function Loading() {
    return (
        // 居中容器：水平 + 垂直（视口扣除头部/页脚后撑满，保证真正居中）
        <div className="flex min-h-[calc(100dvh-12rem)] w-full items-center justify-center">
            <div className="loader">
                <div className="loader__bar"></div>
                <div className="loader__bar"></div>
                <div className="loader__bar"></div>
                <div className="loader__bar"></div>
                <div className="loader__bar"></div>
                <div className="loader__ball"></div>
            </div>
        </div>
    );
}
