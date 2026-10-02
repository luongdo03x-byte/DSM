import {existsSync,readFileSync} from 'node:fs';
const required=[
 'apps/api/src/modules/publishing/publishing.service.ts','apps/browser-gateway/src/providers/gpmlogin/gpmlogin.client.ts',
 'apps/web/src/app/app/brands/[brandId]/overview/page.tsx','apps/web/src/app/app/brands/[brandId]/products/page.tsx',
 'apps/web/src/app/app/brands/[brandId]/content/page.tsx','apps/web/src/app/app/brands/[brandId]/calendar/page.tsx',
 'apps/web/src/app/app/brands/[brandId]/campaigns/page.tsx','apps/web/src/app/app/brands/[brandId]/accounts/page.tsx',
 'apps/web/src/app/app/brands/[brandId]/analytics/page.tsx','docs/verification/v1-acceptance.md',
 '.github/workflows/ci.yml','.github/workflows/browser-smoke.yml','packages/database/prisma/schema.prisma'
];
const missing=required.filter(x=>!existsSync(x));if(missing.length){console.error('Missing V1 artifacts:',missing);process.exit(1)}
const evidence=readFileSync('docs/verification/v1-acceptance.md','utf8');
for(const h of ['Automated implementation gate','Critical journey','Facebook live publish','Instagram live publish','Threads live publish','TikTok live publish','GPMLogin browser smoke'])if(!evidence.includes(`## ${h}`)){console.error('Missing acceptance section:',h);process.exit(1)}
if(!/## Automated implementation gate[\s\S]*Status: PASS/.test(evidence)||!/## Critical journey[\s\S]*Status: PASS/.test(evidence)){console.error('Automated acceptance is not PASS');process.exit(1)}
const blocked=[...evidence.matchAll(/Status: (BLOCKED_[A-Z_]+)/g)].map(x=>x[1]);console.log(`verify-v1: implementation evidence PASS; external/local blocked gates: ${blocked.length}`);
