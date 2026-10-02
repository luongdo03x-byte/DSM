import { existsSync,readFileSync } from 'node:fs';
const paths=['apps/api','apps/worker','apps/web','apps/browser-gateway','packages/database','packages/shared','packages/platform-contracts','packages/browser-contracts','packages/ui'];
for(const p of paths) if(!existsSync(p)) throw new Error(`missing ${p}`);
const pkg=JSON.parse(readFileSync('package.json','utf8')); for(const s of ['build','typecheck','test']) if(!pkg.scripts[s]) throw new Error(`missing script ${s}`);
console.log('workspace smoke: ok');
