import {createHash,createHmac} from 'node:crypto';
import type {ObjectStorage} from './media.service.ts';

export interface S3CompatibleObjectStorageOptions{
  endpoint:string; region:string; accessKey:string; secretKey:string; bucket:string; now?:()=>Date;
}
const awsEncode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
const hmac=(key:any,value:string)=>createHmac('sha256',key).update(value).digest();
const hmacHex=(key:any,value:string)=>createHmac('sha256',key).update(value).digest('hex');
function amzDate(date:Date){return date.toISOString().replace(/[:-]|\.\d{3}/g,'')}
function safePath(value:string){return value.split('/').map(awsEncode).join('/')}

export class S3CompatibleObjectStorage implements ObjectStorage{
  private readonly options:S3CompatibleObjectStorageOptions;
  constructor(options:S3CompatibleObjectStorageOptions){this.options=options}
  async putSignedUrl(key:string,_mime:string,ttl:number){return this.presign('PUT',key,ttl)}
  async getSignedUrl(key:string,ttl:number){return this.presign('GET',key,ttl)}
  private presign(method:'PUT'|'GET',key:string,ttl:number){
    if(ttl<1||ttl>900)throw new Error('INVALID_TTL');
    if(!key||key.startsWith('/')||key.includes('..')||key.includes('\\'))throw new Error('INVALID_STORAGE_KEY');
    const endpoint=new URL(this.options.endpoint);
    if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('INVALID_S3_ENDPOINT');
    const now=(this.options.now??(()=>new Date()))();
    const timestamp=amzDate(now),dateStamp=timestamp.slice(0,8);
    const scope=`${dateStamp}/${this.options.region}/s3/aws4_request`;
    const basePath=endpoint.pathname.replace(/\/$/,'');
    const canonicalUri=`${basePath}/${awsEncode(this.options.bucket)}/${safePath(key)}`.replace(/^\/\//,'/');
    const params:Record<string,string>={
      'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
      'X-Amz-Credential':`${this.options.accessKey}/${scope}`,
      'X-Amz-Date':timestamp,
      'X-Amz-Expires':String(ttl),
      'X-Amz-SignedHeaders':'host'
    };
    const canonicalQuery=Object.entries(params).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${awsEncode(k)}=${awsEncode(v)}`).join('&');
    const host=endpoint.host;
    const canonicalRequest=[method,canonicalUri,canonicalQuery,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign=['AWS4-HMAC-SHA256',timestamp,scope,sha256(canonicalRequest)].join('\n');
    const kDate=hmac(`AWS4${this.options.secretKey}`,dateStamp);
    const kRegion=hmac(kDate,this.options.region);
    const kService=hmac(kRegion,'s3');
    const kSigning=hmac(kService,'aws4_request');
    const signature=hmacHex(kSigning,stringToSign);
    return `${endpoint.protocol}//${endpoint.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}
