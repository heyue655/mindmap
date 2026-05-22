/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用严格模式
  reactStrictMode: true,
  // 路径别名由 tsconfig 管理，Next.js 自动识别 @/* 别名
  // standalone 模式：将所有依赖打包进 .next/standalone，便于 Docker 镜像最小化
  output: "standalone",
};

export default nextConfig;
