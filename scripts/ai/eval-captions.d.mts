export interface EvalSample{id:string;title:string;body:string;type?:'TEXT'|'IMAGE'|'ALBUM'|'VIDEO';hook?:string;cta?:string}
export interface EvalSet{brandVoice:{tone:string;doList?:string[];dontList?:string[];samplePosts?:string[]};samples:EvalSample[]}
export function validateEvalSet(data:unknown):EvalSet;
export function estimatedUsd(rows:Array<{usage?:{inputTokens:number;outputTokens:number;cacheReadTokens:number}}>,prices?:{input:number;output:number;cacheRead:number}):number;
