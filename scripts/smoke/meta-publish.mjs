import {FacebookAdapter} from '../../apps/api/src/integrations/meta/facebook.adapter.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';

if(process.env.LIVE_META_SMOKE!=='1'){
  console.log('Meta live smoke skipped: set LIVE_META_SMOKE=1 for a dedicated test Page.');
}else{
  const required=['META_SMOKE_PAGE_ID','META_SMOKE_PAGE_TOKEN','META_SMOKE_IMAGE_URL'];
  const missing=required.filter(key=>!process.env[key]);
  if(process.env.META_SMOKE_CONFIRM_TEST_PAGE!=='1')missing.push('META_SMOKE_CONFIRM_TEST_PAGE=1');
  if(missing.length)throw new Error('Meta live smoke requires '+missing.join(', '));
  const page=process.env.META_SMOKE_PAGE_ID,token=process.env.META_SMOKE_PAGE_TOKEN,imageUrl=process.env.META_SMOKE_IMAGE_URL;
  const graph=new MetaGraphClient({baseUrl:process.env.META_GRAPH_BASE_URL??'https://graph.facebook.com',version:process.env.META_GRAPH_VERSION??'v24.0'});
  const adapter=new FacebookAdapter({graph,tokens:async()=>token});
  const created=[];
  try{
    const message=`DSM smoke test ${new Date().toISOString()}`;
    const text=await adapter.publish({brandId:'smoke',socialAccountId:'smoke',contentVariantId:'text',platform:'FACEBOOK',contentType:'TEXT',body:message,metadata:{pageId:page,format:'TEXT'}});
    if(!text.externalPostId)throw new Error('META_SMOKE_TEXT_NO_ID');created.push(text.externalPostId);console.log(`text: ${text.externalUrl}`);
    const image=await adapter.publish({brandId:'smoke',socialAccountId:'smoke',contentVariantId:'image',platform:'FACEBOOK',contentType:'IMAGE',caption:message,media:[{url:imageUrl,mimeType:'image/jpeg',kind:'IMAGE',width:1,height:1}],metadata:{pageId:page,format:'IMAGE'}});
    if(!image.externalPostId)throw new Error('META_SMOKE_IMAGE_NO_ID');created.push(image.externalPostId);console.log(`image: ${image.externalUrl}`);
  }finally{
    for(const postId of created.reverse()){
      const result=await graph.delete(`/${postId}`,token);
      if(result?.success!==true)throw new Error(`META_SMOKE_DELETE_FAILED:${postId}`);
      console.log(`deleted: ${postId}`);
    }
  }
}
