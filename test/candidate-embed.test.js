/*
 * 候选 embed / 直链分类（P3）单元测试
 * 验证：
 *  - classifyCandidateEmbed：CMS 始终直链(false)；Kazumi 按规则模式 xpath→内嵌(true)、api→直链(false)；
 *    缺模块/未知规则安全降级为 false。
 *  - buildCandidates：拼装候选时正确打 isEmbed（CMS false / Kazumi xpath true / Kazumi api false）。
 * 运行：node test/candidate-embed.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 加载 search-filter-core（buildCandidates 依赖 filterCandidatesForQuery）----
const coreCode = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'video', 'search-filter-core.js'), 'utf8'
);
// ---- 加载 detail-core.js（提供 classifyCandidateEmbed / buildCandidates 纯数据层，#6-序1 重构后归属此文件）----
const detailCode = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'video', 'detail-core.js'), 'utf8'
);

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(coreCode, sandbox);   // 设置 SFV.SearchFilterCore
vm.runInContext(detailCode, sandbox); // 设置 SFV.detail
const SFV = sandbox.window.StellaflixVideo;

let pass = 0, fail = 0;
function expect(name, cond) {
  if (cond) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}

console.log('classifyCandidateEmbed:');
expect('CMS 候选 isEmbed=false', SFV.detail.classifyCandidateEmbed({ kind: 'cms' }) === false);
expect('CMS 候选(带 _ref) isEmbed=false',
  SFV.detail.classifyCandidateEmbed({ kind: 'cms', _ref: { sourceId: 's1', vodId: '1' } }) === false);

// 桩：xpath 规则 → 'xpath'；api 规则 → 'api'；其余默认 'xpath'（与真实 getRuleMode 默认一致）
SFV.kazumi = { getRuleMode: function (n) { return n === 'apiRule' ? 'api' : 'xpath'; } };
expect('Kazumi xpath 规则 isEmbed=true',
  SFV.detail.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'xpathRule' }) === true);
expect('Kazumi api 规则 isEmbed=false',
  SFV.detail.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'apiRule' }) === false);
expect('Kazumi 未知规则(默认 xpath) isEmbed=true',
  SFV.detail.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'unknown' }) === true);

// 缺模块安全降级
delete SFV.kazumi;
expect('无 kazumi 模块时 Kazumi 候选安全降级 false',
  SFV.detail.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'xpathRule' }) === false);

expect('未知 kind 默认 false', SFV.detail.classifyCandidateEmbed({ kind: 'other' }) === false);
expect('null 默认 false', SFV.detail.classifyCandidateEmbed(null) === false);

console.log('buildCandidates:');
SFV.kazumi = { getRuleMode: function (n) { return n === 'apiRule' ? 'api' : 'xpath'; } };
const cmsRes = {
  items: [{
    title: '你的名字', year: '2016', sourceName: '源1',
    variants: [{ sourceId: 's1', vodId: '1', sourceName: '源1' }]
  }]
};
const kzRes = {
  items: [
    { title: '你的名字', ruleName: 'xpathRule', src: 'http://d/x1' },
    { title: '你的名字', ruleName: 'apiRule', src: 'http://d/a1' }
  ]
};
const cands = SFV.detail.buildCandidates([cmsRes, kzRes], { title: '你的名字' });
expect('拼出 3 个候选（1 CMS + 2 Kazumi）', cands.length === 3);
const cmsC = cands.filter(c => c.kind === 'cms')[0];
const kzX = cands.filter(c => c.kind === 'kazumi' && c.ruleName === 'xpathRule')[0];
const kzA = cands.filter(c => c.kind === 'kazumi' && c.ruleName === 'apiRule')[0];
expect('CMS 候选 isEmbed=false', cmsC && cmsC.isEmbed === false);
expect('Kazumi xpath 候选 isEmbed=true', kzX && kzX.isEmbed === true);
expect('Kazumi api 候选 isEmbed=false', kzA && kzA.isEmbed === false);
expect('候选含 kind 字段', cands.every(c => typeof c.kind === 'string'));
expect('候选含 group 字段', cands.every(c => typeof c.group === 'string'));

console.log('\nTotal: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
