/**
 * PWA 图标生成脚本
 * 使用 canvas 生成不同尺寸的 PNG 图标
 *
 * 运行方式: node scripts/generate-pwa-icons.js
 */

const fs = require('fs');
const path = require('path');

// 图标尺寸列表
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// SVG 模板
const createSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#991b1b;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" fill="url(#grad)"/>
  <path d="M180 140 L380 256 L180 372 Z" fill="white" opacity="0.95"/>
  <circle cx="400" cy="120" r="8" fill="white" opacity="0.6"/>
  <circle cx="420" cy="160" r="5" fill="white" opacity="0.4"/>
  <circle cx="380" cy="100" r="4" fill="white" opacity="0.5"/>
</svg>
`;

// 输出目录
const iconsDir = path.join(__dirname, '../public/icons');

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 生成 SVG 文件
SIZES.forEach((size) => {
  const svg = createSVG(size);
  const filename = `icon-${size}x${size}.svg`;
  fs.writeFileSync(path.join(iconsDir, filename), svg);
  console.log(`✅ 生成: ${filename}`);
});

console.log('\n📦 SVG 图标生成完成！');
console.log('\n💡 提示：');
console.log('   SVG 图标可以直接在 Web 中使用');
console.log('   如需 PNG 格式，请使用在线工具转换：');
console.log('   https://convertio.co/svg-png/');
