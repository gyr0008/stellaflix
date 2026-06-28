/**
 * Aurora 全局背景组件
 *
 * 用途: 在网站全局添加极光效果背景
 * 特点:
 *   - 固定定位，覆盖整个视口
 *   - 低透明度，不影响内容阅读
 *   - 使用网站主题色（红色系）
 *   - 在 admin 页面降低透明度
 */

'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

// 动态导入 Aurora 组件（避免 SSR 问题）
const Aurora = dynamic(() => import('./Aurora'), {
  ssr: false,
  loading: () => null
});

export default function AuroraBackground() {
  const pathname = usePathname();

  // 在 admin 页面降低透明度
  const isAdminPage = pathname.startsWith('/admin');

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Aurora
        colorStops={['#d01818', '#833ff4', '#3B82F6']}
        blend={0.3}
        amplitude={0.8}
        speed={0.3}
      />
      {/* 暗色遮罩，降低亮度让内容更清晰 */}
      <div className={`absolute inset-0 ${isAdminPage ? 'bg-[#0a0a0f]/50' : 'bg-[#0a0a0f]/70'}`} />
    </div>
  );
}
