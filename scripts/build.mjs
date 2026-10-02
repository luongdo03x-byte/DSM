import { spawnSync } from 'node:child_process';
const r=spawnSync('tsc',['-p','tsconfig.json','--noEmit'],{stdio:'inherit',shell:true}); process.exit(r.status??1);
