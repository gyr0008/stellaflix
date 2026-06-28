/**
 * 图标生成脚本
 *
 * 使用方法：
 * 1. 安装依赖：npm install sharp
 * 2. 运行脚本：node public/icons/generate-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// 输入的 SVG 图标路径
const svgPath = path.join(__dirname, 'icon.svg');

// 需要生成的图标尺寸
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// 生成图标
async function generateIcons() {
  // 检查 SVG 文件是否存在
  if (!fs.existsSync(svgPath)) {
    console.error('SVG 图标文件不存在:', svgPath);
    console.log('请先创建一个 icon.svg 文件');
    return;
  }

  // 读取 SVG 内容
  const svgBuffer = fs.readFileSync(svgPath);

  // 生成每个尺寸的图标
  for (const size of sizes) {
    const outputPath = path.join(__dirname, `icon-${size}x${size}.png`);

    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`✓ 生成图标: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`✗ 生成图标失败: icon-${size}x${size}.png`, error.message);
    }
  }

  console.log('\n图标生成完成！');
}

// 运行
generateIcons().catch(console.error);
