import test from 'node:test';
import assert from 'node:assert/strict';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';

const account={id:'yt',brandId:'b',platform:'YOUTUBE' as const,platformAccountId:'channel',publishMode:'API' as const,status:'CONNECTED' as const};
test('YouTube analytics maps daily views and watch time, without historic subscriber guesses',async()=>{
  const http:HttpClient={async request<T>(request:HttpRequest){if(request.url.includes('youtubeanalytics'))return{status:200,data:{rows:[['2026-10-20',120,30]]} as T};return{status:200,data:{items:[{statistics:{subscriberCount:'500'},snippet:{description:'Bio',thumbnails:{default:{url:'https://img.test/a'}}},brandingSettings:{channel:{unsubscribedTrailer:'link'}}}]} as T}}};
  const adapter=new YouTubeAdapter({baseUrl:'https://google.test',http,tokens:async()=> 'token',storage:new InMemoryObjectStorage(),audited:false});
  const rows=await adapter.fetchAccountDaily(account,'2026-10-20','2026-10-20','UTC');
  assert.equal(rows[0]?.views,120);assert.equal(rows[0]?.watchTimeMinutes,30);assert.equal(rows[0]?.followers,null);
  assert.equal(rows[0]?.source,'YOUTUBE:analytics');
});

test('YouTube post insights reads video statistics',async()=>{
  const http:HttpClient={async request<T>(request:HttpRequest){assert.match(request.url,/videos\?/);return{status:200,data:{items:[{statistics:{viewCount:'80',likeCount:'5',commentCount:'2'}}]} as T}}};
  const adapter=new YouTubeAdapter({baseUrl:'https://google.test',http,tokens:async()=> 'token',storage:new InMemoryObjectStorage(),audited:false});
  const result=await adapter.fetchPostMetrics(account,'video');
  assert.deepEqual([result.views,result.likes,result.comments],[80,5,2]);
});
