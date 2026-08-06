/*
 * 多源结果聚合（方案 A 为主 + 方案 B 降级）单元测试
 * 验证：cleanTitleForAgg 清洗归一 + aggregateByLocalKey 跨源归并。
 * 运行：node test/search-aggregate.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 加载 search-filter-core.js（纯函数层，无 DOM 依赖）----
const code = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'video', 'search-filter-core.js'),
  'utf8'
);
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const Core = sandbox.window.StellaflixVideo.SearchFilterCore;

let pass = 0, fail = 0;
function expect(name, cond) {
  if (cond) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}

const cms = (title, year, pic, playUrl) => ({
  key: 's1:' + title, vodId: title, sourceId: 's1', sourceName: '源1',
  title, pic: pic || '', year: year || '', typeName: '动漫', playUrl: playUrl || '',
  variants: [{ key: 's1:' + title, sourceId: 's1', vodId: title, playUrl: playUrl || '' }]
});
const kz = (title) => ({
  isKazumi: true, key: 'kazumi:r1:' + title, title, pic: '', year: '',
  sourceName: 'r1', ruleName: 'r1', src: 'http://d/' + title,
  variants: [{ key: 'kazumi:r1:' + title, sourceId: 'kazumi:r1', vodId: 'kazumi:r1:' + title, isKazumi: true, ruleName: 'r1', src: 'http://d/' + title }]
});

console.log('cleanTitleForAgg:');
expect('空格差异归一',
  Core.cleanTitleForAgg('一人之下 第一季') === Core.cleanTitleForAgg('一人之下第一季'));
expect('动态漫括号归一',
  Core.cleanTitleForAgg('一人之下 第一季') === Core.cleanTitleForAgg('一人之下 第一季（动态漫）'));
expect('季数标记归一',
  Core.cleanTitleForAgg('你的名字。') === Core.cleanTitleForAgg('你的名字'));
expect('语言/画质噪声归一',
  Core.cleanTitleForAgg('进击的巨人 国语版1080P') === Core.cleanTitleForAgg('进击的巨人'));

console.log('aggregateByLocalKey:');
const merged = Core.aggregateByLocalKey([
  cms('一人之下 第一季', '2016', 'http://a.jpg', 'x$1.mp4'),
  cms('一人之下第一季', '2016', 'http://b.jpg', 'y$1.mp4'),
  kz('一人之下第一季')
]);
expect('同名异构源合并为 1 张卡', merged.length === 1);
expect('variants 累积 = 3（2 CMS + 1 Kazumi）', merged[0].variants.length === 3);
expect('cmsVars = 2', merged[0].cmsVars.length === 2);
expect('kzVars = 1', merged[0].kzVars.length === 1);
expect('混合卡 isKazumi = false（CMS 优先）', merged[0].isKazumi === false);
expect('主 pic 取自首个非空', merged[0].pic === 'http://a.jpg');
expect('保留清洗身份键', typeof merged[0]._localKey === 'string');

const diffYear = Core.aggregateByLocalKey([
  cms('一人之下 第一季', '2016', 'http://a.jpg'),
  cms('一人之下 第一季', '2021', 'http://b.jpg')
]);
expect('不同年份不合并（2 张卡）', diffYear.length === 2);

const onlyKz = Core.aggregateByLocalKey([kz('灵笼'), kz('灵笼')]);
expect('纯 Kazumi 同标题合并为 1 张卡', onlyKz.length === 1);
expect('纯 Kazumi 卡 isKazumi = true', onlyKz[0].isKazumi === true);
expect('纯 Kazumi 卡 variants = 2', onlyKz[0].variants.length === 2);

expect('空输入返回 []', Core.aggregateByLocalKey([]).length === 0);
expect('null 输入返回 []', Core.aggregateByLocalKey(null).length === 0);

console.log('\nTotal: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
