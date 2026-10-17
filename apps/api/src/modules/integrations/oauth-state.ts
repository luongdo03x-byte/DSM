import {createHmac,timingSafeEqual} from 'node:crypto';

export const OAUTH_STATE_TTL_MS=10*60_000;
type StatePayload={brandId:string;userId:string;provider:string;nonce:string};

function signature(data:string,secret:string):Buffer {return createHmac('sha256',secret).update(data).digest()}

export function signState(payload:StatePayload,secret:string,now:number):string {
  if(!secret||!Number.isSafeInteger(now))throw new Error('OAUTH_STATE_INVALID');
  const encoded=Buffer.from(JSON.stringify({payload,issuedAt:now})).toString('base64url');
  return `${encoded}.${signature(encoded,secret).toString('base64url')}`;
}

export function verifyState(state:string,secret:string,now:number):StatePayload {
  try {
    if(!secret||!Number.isSafeInteger(now))throw new Error('OAUTH_STATE_INVALID');
    const parts=state.split('.');
    if(parts.length!==2||!parts[0]||!parts[1])throw new Error('OAUTH_STATE_INVALID');
    const expected=signature(parts[0],secret),actual=Buffer.from(parts[1],'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('OAUTH_STATE_INVALID');
    const parsed=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')) as {payload?:StatePayload;issuedAt?:number};
    if(!parsed.payload||!['brandId','userId','provider','nonce'].every(key=>typeof parsed.payload?.[key as keyof StatePayload]==='string'&&!!parsed.payload?.[key as keyof StatePayload])||!Number.isSafeInteger(parsed.issuedAt))throw new Error('OAUTH_STATE_INVALID');
    if(now<parsed.issuedAt!||now-parsed.issuedAt!>OAUTH_STATE_TTL_MS)throw new Error('OAUTH_STATE_EXPIRED');
    return parsed.payload;
  }catch(error){
    if(error instanceof Error&&error.message==='OAUTH_STATE_EXPIRED')throw error;
    throw new Error('OAUTH_STATE_INVALID');
  }
}
