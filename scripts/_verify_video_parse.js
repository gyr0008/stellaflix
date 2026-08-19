'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', 'public', 'video');
let count = 0, failed = 0;
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.js$/i.test(name)) continue;
    const code = fs.readFileSync(p, 'utf8');
    try {
      new vm.Script(code, { filename: p });
      count++;
    } catch (e) {
      failed++;
      console.error('PARSE FAIL:', p, '\n  ', e.message);
    }
  }
}
walk(root);
console.log('\nParsed OK:', count, ' Failed:', failed);
process.exit(failed ? 1 : 0);
