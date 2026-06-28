/**
 * HTML 处理工具
 *
 * 功能：
 * 1. 清理 HTML 标签，提取纯文本
 * 2. 解码 HTML 实体（如 &nbsp;）
 * 3. 安全渲染 HTML 内容
 */

/**
 * 解码 HTML 实体
 *
 * @param text 包含 HTML 实体的文本
 * @returns 解码后的文本
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';

  const htmlEntities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
    '&hellip;': '…',
    '&mdash;': '—',
    '&ndash;': '–',
    '&laquo;': '«',
    '&raquo;': '»',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&deg;': '°',
    '&times;': '×',
    '&divide;': '÷',
    '&plusmn;': '±',
    '&micro;': 'µ',
    '&para;': '¶',
    '&sect;': '§',
    '&curren;': '¤',
    '&yen;': '¥',
    '&pound;': '£',
    '&cent;': '¢',
    '&euro;': '€',
  };

  let result = text;

  // 替换命名实体
  for (const [entity, char] of Object.entries(htmlEntities)) {
    result = result.split(entity).join(char);
  }

  // 替换数字实体（如 &#32; 或 &#x20;）
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

/**
 * 移除 HTML 标签，提取纯文本
 *
 * @param html HTML 内容
 * @returns 纯文本
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';

  // 先解码 HTML 实体
  let text = decodeHtmlEntities(html);

  // 移除 HTML 标签
  text = text.replace(/<[^>]*>/g, '');

  // 移除多余空白
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * 清理并格式化描述文本
 *
 * @param description 原始描述（可能包含 HTML）
 * @returns 清理后的文本
 */
export function cleanDescription(description: string): string {
  if (!description) return '';

  // 解码 HTML 实体
  let text = decodeHtmlEntities(description);

  // 移除 HTML 标签
  text = text.replace(/<[^>]*>/g, '');

  // 清理 &nbsp; 等实体（可能还有残留）
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&[a-zA-Z]+;/g, '');

  // 移除多余空白和换行
  text = text.replace(/\n\s*\n/g, '\n'); // 移除空行
  text = text.replace(/\s+/g, ' '); // 合并空格
  text = text.trim();

  return text;
}

/**
 * 安全渲染 HTML（用于 dangerouslySetInnerHTML）
 *
 * @param html HTML 内容
 * @returns 清理后的 HTML
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // 移除危险的标签和属性
  let safe = html
    // 移除 script 标签
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // 移除 on* 事件属性
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    // 移除 javascript: 协议
    .replace(/javascript:/gi, '')
    // 移除 data: 协议（除了图片）
    .replace(/data:(?!image)/gi, '');

  return safe;
}
