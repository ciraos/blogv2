import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  /* config options here */
  distDir: ".next",
  output: "standalone",
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  reactCompiler: true,
  reactStrictMode: false
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
  // options: { remarkPlugins: [remarkGfm], }
});

export default withMDX(nextConfig);
