import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import BackToTop from "@/components/BackToTop";
import AuroraBackground from "@/components/AuroraBackground";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

// PWA 元数据
export const metadata: Metadata = {
  title: "StellaFlix - 沉浸式观影",
  description: "海量高清电影与纪录片，随时随地畅享观影体验",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StellaFlix",
  },
  formatDetection: {
    telephone: false,
  },
};

// Viewport 配置（PWA 必需）
export const viewport: Viewport = {
  themeColor: "#dc2626",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${plusJakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* iOS PWA 支持 */}
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="StellaFlix" />

        {/* 其他 PWA meta 标签 */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="StellaFlix" />
        <meta name="msapplication-TileColor" content="#dc2626" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-white">
        {/* Aurora 极光背景效果 */}
        <AuroraBackground />
        {children}
        <BackToTop />
      </body>
    </html>
  );
}
