import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 本地开发期的探测 / 验证脚本与参考资料（已在 .gitignore 中忽略，不该参与 lint：
    // 里面既有自己写的 .mjs，也可能放着拉下来对照的官方源码）
    "scripts/**",
    // 浏览器 headless 测试残留目录（Edge profile 等）
    ".edge-tmp/**",
    ".edge-tmp2/**",
  ]),
]);

export default eslintConfig;
