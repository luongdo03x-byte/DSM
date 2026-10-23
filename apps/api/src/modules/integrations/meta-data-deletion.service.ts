import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export class MetaDataDeletionService {
  private readonly repos:Repositories;private readonly appSecret:string;private readonly statusBaseUrl:string;
  constructor(deps:{repos:Repositories;appSecret:string;statusBaseUrl:string}){this.repos=deps.repos;this.appSecret=deps.appSecret;this.statusBaseUrl=deps.statusBaseUrl}
  async handle(signedRequest:string):Promise<{url:string;confirmation_code:string}>{
    const [signature,payload,extra]=signedRequest.split('.');
    if(!signature||!payload||extra)throw new Error('INVALID_SIGNED_REQUEST');
    const expected=createHmac('sha256',this.appSecret).update(payload).digest(),actual=Buffer.from(signature,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('INVALID_SIGNED_REQUEST');
    let claims:{algorithm?:string;user_id?:string};try{claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))}catch{throw new Error('INVALID_SIGNED_REQUEST')}
    if(claims.algorithm!=='HMAC-SHA256'||!claims.user_id)throw new Error('INVALID_SIGNED_REQUEST');
    const credentials=await this.repos.credentials.findBy({provider:'META',providerUserId:claims.user_id});
    await this.repos.transaction(async tx=>{
      for(const credential of credentials){
        for(const comment of await tx.socialComments.findBy({socialAccountId:credential.socialAccountId})){
          for(const action of await tx.commentActions.findBy({commentId:comment.id}))await tx.commentActions.remove(action.id);
          await tx.socialComments.remove(comment.id);
        }
        await tx.credentials.remove(credential.id);
        await tx.socialAccounts.update(credential.socialAccountId,{status:'DISCONNECTED',platformAccountId:null,username:null,displayName:null} as any);
      }
    });
    const confirmation_code=randomBytes(18).toString('base64url');
    const url=new URL(this.statusBaseUrl);url.searchParams.set('code',confirmation_code);
    return{url:url.toString(),confirmation_code};
  }
}
