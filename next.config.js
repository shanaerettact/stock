/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // 實驗性功能
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // 路徑別名（配合 tsconfig.json）
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

module.exports = nextConfig;

