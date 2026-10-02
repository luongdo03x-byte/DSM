import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
function walk(dir,out=[]){ for(const n of readdirSync(dir)){const p=join(dir,n); const s=statSync(p); if(s.isDirectory()) walk(p,out); else if(n.endsWith('.test.ts')) out.push(p);} return out; }
const files=walk('tests');
const r=spawnSync(process.execPath,['--experimental-strip-types','--test',...files],{stdio:'inherit'}); process.exit(r.status??1);
