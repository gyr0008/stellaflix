// 原位重排 00-state：将状态块(line 4-216) eager 调用的 10 个深层 loader
// 函数定义上移到 loadEqualizerState(217) 之前，固化 00-state 边界。
// 依赖函数提升(hoist)，调用点不变 => 运行时语义零变化。仅源码重组，不删任何声明。
//
// 不依赖外部解析器：用已知起始行号 + 字符级括号匹配（正确处理 字符串/模板/注释/正则），
// 提取整段函数文本。安全网：写 .new 后由 node --check 与 build:music 验证。
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'C:/Users/Administrator/Desktop/Mineradio-Extended-1.1.2-extended.1/src/music/legacy-music.js';
const OUT = SRC + '.new';

// 需上移的 loader：name -> 起始行号(1-based, 来自 grep '^function NAME(')
const MOVE = {
  readDiyModePreference: 246,
  readLocalBeatPrefs: 9651,
  readLocalBeatMapCache: 9658,
  readPlaybackQualityPreference: 13002,
  readCustomCoverMap: 13308,
  readHomePosterState: 13391,
  loadListenStatsState: 13550,
  readCustomLyricMap: 14973,
  readCustomLyricPrefs: 14996,
  loadPlaylistDetailSortMode: 18421,
};
const ANCHOR = { name: 'loadEqualizerState', line: 217 };

const src = readFileSync(SRC, 'utf8');

function offsetOfLine(lineNo1) {
  let line = 1, idx = 0;
  while (line < lineNo1) {
    const nl = src.indexOf('\n', idx);
    if (nl === -1) throw new Error('行号越界: ' + lineNo1);
    idx = nl + 1; line++;
  }
  return idx;
}

// 字符级括号匹配：从 function 关键字起，找到匹配的函数体右括号索引。
function findFunctionEnd(start) {
  if (!src.startsWith('function', start)) throw new Error('起始处非 function: ' + start);
  const n = src.length;
  let i = start;
  let opened = false, depth = 0;
  let inStr = null;          // "'", '"', '`'
  let templateDepth = 0;     // 模板字面量内 ${...} 嵌套深度
  let inLineComment = false, inBlockComment = false;
  let prevNonSpace = '';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; i++; continue; }
    if (inBlockComment) { if (c === '*' && c2 === '/') { inBlockComment = false; i += 2; } else i++; continue; }
    if (inStr) {
      if (inStr === '`') {
        if (c === '\\') { i += 2; continue; }
        if (templateDepth > 0) {
          if (c === '{') { templateDepth++; i++; continue; }
          if (c === '}') { templateDepth--; i++; continue; }
          i++; continue;
        }
        if (c === '`') { inStr = null; i++; continue; }
        if (c === '$' && c2 === '{') { templateDepth++; i += 2; continue; }
        i++; continue;
      } else {
        if (c === '\\') { i += 2; continue; }
        if (c === inStr) { inStr = null; i++; continue; }
        i++; continue;
      }
    }
    // 不在字符串/注释中
    if (c === '/' && c2 === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && c2 === '*') { inBlockComment = true; i += 2; continue; }
    if (c === "'" || c === '"') { inStr = c; i++; continue; }
    if (c === '`') { inStr = '`'; i++; continue; }
    if (c === '{') { if (!opened) { opened = true; depth = 1; } else depth++; i++; continue; }
    if (c === '}') {
      if (opened) { depth--; if (depth === 0) return i; }
      i++; continue;
    }
    if (c === '/') {
      const isRegex = '([,:=![&|?{;'.includes(prevNonSpace) || prevNonSpace === '' || prevNonSpace === '}';
      if (isRegex) {
        i++;
        let inClass = false;
        while (i < n) {
          const ch = src[i];
          if (ch === '\\') { i += 2; continue; }
          if (ch === '[') { inClass = true; i++; continue; }
          if (ch === ']') { inClass = false; i++; continue; }
          if (ch === '/' && !inClass) { i++; break; }
          if (ch === '\n') break;
          i++;
        }
        continue;
      }
    }
    if (!/\s/.test(c)) prevNonSpace = c;
    i++;
  }
  throw new Error('未找到匹配的右括号 (start=' + start + ')');
}

const insertionOffset = offsetOfLine(ANCHOR.line);
if (!src.startsWith('function ' + ANCHOR.name + '(', insertionOffset)) {
  throw new Error('锚点校验失败: line ' + ANCHOR.line);
}

const moveRanges = [];
for (const [name, line] of Object.entries(MOVE)) {
  const s = offsetOfLine(line);
  if (!src.startsWith('function ' + name + '(', s)) throw new Error(`起始校验失败 ${name} line ${line}`);
  const e = findFunctionEnd(s);
  moveRanges.push({ name, start: s, end: e + 1, text: src.slice(s, e + 1) });
}

moveRanges.sort((a, b) => a.start - b.start);
for (const r of moveRanges) {
  if (r.start <= insertionOffset) throw new Error(`loader ${r.name} 位于锚点之前, 移除会平移插入偏移`);
}

// 从原文件剔除 MOVE 区间 -> trimmed
let trimmed = '';
let cursor = 0;
for (const r of moveRanges) {
  if (r.start < cursor) throw new Error('区间重叠');
  trimmed += src.slice(cursor, r.start);
  cursor = r.end;
}
trimmed += src.slice(cursor);

if (trimmed.slice(0, insertionOffset) !== src.slice(0, insertionOffset)) {
  throw new Error('断言失败: 锚点前内容被平移');
}

const bannerOpen = [
  '',
  '// ============================================================',
  '//  00-state region (Global State + 其 eager 调用的 loader)',
  '//  原位重排(2026-08-06): 将状态块 line 86-214 eager 调用的深层 loader',
  '//  上移至此固化边界; 函数声明提升, 调用点不变, 运行时语义零变化。',
  '// ============================================================',
  '',
].join('\n');
const bannerClose = [
  '',
  '// --- end 00-state region (loaders) ---',
  '',
].join('\n');

const movedText = moveRanges.map(r => r.text).join('\n\n');
const newSrc = trimmed.slice(0, insertionOffset) + bannerOpen + '\n' + movedText + '\n' + bannerClose + trimmed.slice(insertionOffset);

writeFileSync(OUT, newSrc, 'utf8');

const origLines = src.split('\n').length;
const newLines = newSrc.split('\n').length;
console.log('OK 写入 ' + OUT);
console.log('  移除 loader 数 :', moveRanges.length);
console.log('  原行数         :', origLines);
console.log('  新行数         :', newLines, '(+', newLines - origLines, ')');
console.log('  插入锚点偏移   :', insertionOffset);
console.log('  移动的函数     :', moveRanges.map(r => r.name).join(', '));
