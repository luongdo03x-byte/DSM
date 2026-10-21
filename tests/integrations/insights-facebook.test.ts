import test from 'node:test';
import assert from 'node:assert/strict';
import {FacebookAdapter} from '../../apps/api/src/integrations/meta/facebook.adapter.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';

const account={id:'fb',brandId:'b',platform:'FACEBOOK' as const,platformAccountId:'page',publishMode:'API' as const,status:'CONNECTED' as const};

test('Facebook insights keeps missing metrics null and uses current view metrics',async()=>{
  const paths:string[]=[];
  const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async input=>{
    const url=new URL(String(input));paths.push(url.pathname+url.search);
    if(url.pathname.endsWith('/insights'))return Response.json({data:[{name:'page_total_media_view_unique',values:[{end_time:'2026-10-21T00:00:00+0000',value:40}]}]});
    return Response.json({fan_count:120,picture:{data:{url:'https://img.test/a'}},about:'Bio',website:'https://example.com'});
  }});
  const adapter=new FacebookAdapter({graph,tokens:async()=> 'token'});
  const rows=await adapter.fetchAccountDaily(account,'2026-10-20','2026-10-20','Asia/Bangkok');
  assert.equal(rows.length,1);assert.equal(rows[0]?.views,40);assert.equal(rows[0]?.reach,null);
  assert.equal(rows[0]?.followers,null);assert.equal(rows[0]?.source,'FACEBOOK:page_total_media_view_unique');
  assert.ok(paths.every(path=>!path.includes('impressions')));
  assert.ok(paths.some(path=>path.includes('until=2026-10-21')));
  assert.deepEqual(await adapter.fetchProfile(account),{hasAvatar:true,hasBio:true,hasLink:true});
});

test('Facebook insights permission error has stable code',async()=>{
  const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async()=>new Response(JSON.stringify({error:{code:10,message:'Permission denied'}}),{status:403})});
  const adapter=new FacebookAdapter({graph,tokens:async()=> 'token'});
  await assert.rejects(adapter.fetchAccountDaily(account,'2026-10-20','2026-10-20','UTC'),error=>error instanceof PublishError&&error.type==='AUTH_ERROR'&&error.code==='INSIGHTS_PERMISSION_MISSING');
});

test('Facebook stores current follower count only on capture day',async()=>{
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());
  const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async input=>String(input).includes('/insights')?Response.json({data:[]}):Response.json({fan_count:120})});
  const adapter=new FacebookAdapter({graph,tokens:async()=> 'token'});
  const rows=await adapter.fetchAccountDaily(account,day,day,'UTC');
  assert.equal(rows.length,1);assert.equal(rows[0]?.followers,120);assert.equal(rows[0]?.views,null);
});
