export function ensureRequestId(headers:Record<string,string|undefined>){const existing=headers['x-request-id']?.trim();return existing||crypto.randomUUID()}
export interface CorrelationContext{requestId:string;batchId?:string;jobId?:string;browserTaskId?:string}
