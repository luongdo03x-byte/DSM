import type {PublishError} from '../../../../packages/platform-contracts/src/index.ts';
const base=[30_000,120_000,600_000,1_800_000];export class RetryPolicy{decide(e:PublishError,attempt:number){if(!e.retryable||attempt>=4)return{retry:false};const calc=base[Math.max(0,attempt-1)]??base[3]!;return{retry:true,delayMs:Math.max(calc,e.retryAfterMs??0)}}}
