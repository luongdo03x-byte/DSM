import test from 'node:test';
import assert from 'node:assert/strict';
import {InstagramAdapter} from '../../apps/api/src/integrations/meta/instagram.adapter.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';

const account={id:'ig',brandId:'b',platform:'INSTAGRAM' as const,platformAccountId:'ig-platform',publishMode:'API' as const,status:'CONNECTED' as const};
test('Instagram insights maps daily values without inventing unavailable metrics',async()=>{
  const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async input=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith('/insights'))return Response.json({data:[{name:'views',values:[{end_time:'2026-10-21T00:00:00+0000',value:80}]},{name:'reach',values:[{end_time:'2026-10-21T00:00:00+0000',value:50}]}]});
    return Response.json({followers_count:200,profile_picture_url:'https://img.test/a',biography:'Bio',website:'https://example.com'});
  }});
  const adapter=new InstagramAdapter({graph,tokens:async()=> 'token',accountIds:async()=> 'ig-platform'});
  const rows=await adapter.fetchAccountDaily(account,'2026-10-20','2026-10-20','UTC');
  assert.equal(rows[0]?.views,80);assert.equal(rows[0]?.reach,50);assert.equal(rows[0]?.engagements,null);assert.equal(rows[0]?.followers,null);
  assert.deepEqual(await adapter.fetchProfile(account),{hasAvatar:true,hasBio:true,hasLink:true});
});
