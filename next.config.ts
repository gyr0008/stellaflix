import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

// PWA 配置
const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/~offline",
  },
});

const nextConfig: NextConfig = {
  // 空的 turbopack 配置，让 Next.js 16 使用 Turbopack
  turbopack: {},

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.picbf.com",
      },
      {
        protocol: "https",
        hostname: "*.bfzypic.com",
      },
      {
        protocol: "https",
        hostname: "*.lfytyd.com",
      },
      {
        protocol: "https",
        hostname: "*.ffzyapi.com",
      },
      {
        protocol: "https",
        hostname: "*.cj.bfcwp.com",
      },
      {
        protocol: "https",
        hostname: "*.vodfeiss.com",
      },
      {
        protocol: "https",
        hostname: "*.vodcombo.com",
      },
      {
        protocol: "https",
        hostname: "*.lziopic.com",
      },
      {
        protocol: "https",
        hostname: "*.sdzyapi.com",
      },
      {
        protocol: "https",
        hostname: "*.hongniuzy2.com",
      },
      {
        protocol: "https",
        hostname: "img.lziopic.com",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "img.ysdma.com",
      },
    ],
    localPatterns: [
      {
        pathname: "/api/proxy/image",
      },
    ],
  },
};

export default withPWA(nextConfig);
