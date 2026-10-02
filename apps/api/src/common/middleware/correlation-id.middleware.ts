import {ensureRequestId} from '../../../../../packages/shared/src/correlation.ts';
export function correlationIdMiddleware(headers:Record<string,string|undefined>){return{'x-request-id':ensureRequestId(headers)}}
