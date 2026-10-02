import { readdirSync,readFileSync,statSync } from 'node:fs'; import { join } from 'node:path';
const roots=['apps','packages','scripts']; let bad=[];
function walk(d){for(const n of readdirSync(d)){const p=join(d,n),s=statSync(p); if(s.isDirectory()) walk(p); else if(/\.(ts|mjs)$/.test(n)){if(p==='scripts/lint.mjs') continue; const t=readFileSync(p,'utf8'); if(/\b(TODO|FIXME|HACK)\b/.test(t)) bad.push(p);}}}
for(const r of roots) walk(r); if(bad.length){console.error('Forbidden placeholders:',bad);process.exit(1)} console.log('lint: ok');
